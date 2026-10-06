import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Quote } from '../types'
import { DEFAULT_WATCHLIST, cellWidth, formatChange, formatPrice, misUrl, normalizeSymbol, parseMis } from './quotes'

const quotes = atom({ plugin: 'stock-ticker', key: 'quotes' } as const, [] as Quote[])
const isHidden = atom({ plugin: 'stock-ticker', key: 'isHidden' } as const, false)
const error = atom({ plugin: 'stock-ticker', key: 'error' } as const, null as string | null)

const WATCHLIST_KEY = 'watchlist'
const HIDDEN_KEY = 'hidden'
const MAX_SYMBOLS = 10
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

async function loadWatchlist($: EngineInterface): Promise<string[]> {
  const stored = await $.store.get(WATCHLIST_KEY)

  return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : DEFAULT_WATCHLIST
}

/** Weekdays 08:30–14:00 Taipei time: pre-open matching through the after-hours fixed-price session. */
function isMarketHours(now: number): boolean {
  const taipei = new Date(now + TAIPEI_OFFSET_MS)
  const day = taipei.getUTCDay()
  const minutes = taipei.getUTCHours() * 60 + taipei.getUTCMinutes()

  return day >= 1 && day <= 5 && minutes >= 8 * 60 + 30 && minutes <= 14 * 60
}

/** Big-move toasts: the threshold, and which symbol already fired on which Taipei day. */
type Alerts = { percent: number; seen: Set<string> }

async function refresh($: EngineInterface, alerts: Alerts, { force = false } = {}) {
  const now = await $.clock.now()
  // Outside trading hours the last quotes stand; one fetch fills an empty band.
  if (!force && !isMarketHours(now) && (await read($, quotes)).length > 0) return

  const codes = await loadWatchlist($)
  if (codes.length === 0) {
    await update($, quotes, () => [])
    return
  }

  try {
    const response = await $.http.fetch(misUrl(codes))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const next = parseMis(response.text, codes)
    await update($, quotes, () => next)
    await update($, error, () => null)
    notifyBigMoves($, alerts, next, now)
  } catch (reason) {
    await update($, error, () => (reason instanceof Error ? reason.message : String(reason)))
  }
}

function notifyBigMoves($: EngineInterface, alerts: Alerts, list: Quote[], now: number) {
  if (alerts.percent <= 0) return
  const day = new Date(now + TAIPEI_OFFSET_MS).toISOString().slice(0, 10)
  for (const quote of list) {
    const id = `${day}:${quote.symbol}`
    if (Math.abs(quote.changePercent) < alerts.percent || alerts.seen.has(id)) continue
    alerts.seen.add(id)
    $.ui.toast(`${quote.label} ${formatPrice(quote.price)} ${formatChange(quote.changePercent)}`)
  }
}

/** The leading quotes that fit in `columns` cells, each followed by `gap` cells. */
function fitRow(list: Quote[], columns: number, gap: number): Quote[] {
  const shown: Quote[] = []
  let room = columns
  for (const quote of list) {
    const width = cellWidth(`${quote.label} ${formatPrice(quote.price)} ${formatChange(quote.changePercent)}`) + gap
    if (width > room) break
    room -= width
    shown.push(quote)
  }

  return shown
}

export const register: Register = (on, options) => {
  const refreshMs = Math.max(5, Number(options.refreshSeconds ?? 5)) * 1000
  const isRedUp = options.colors !== 'green-up'
  const alerts: Alerts = { percent: Number(options.alertPercent ?? 3), seen: new Set() }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'stock',
      description: 'Taiwan stock ticker: add/remove symbols, show or hide the band',
      argumentHint: 'add 2330 0050 | rm 2330 | list | on | off',
    })
    const wasHidden = (await $.store.get(HIDDEN_KEY)) === true
    await update($, isHidden, () => wasHidden)

    void refresh($, alerts, { force: true })
    $.clock.every(refreshMs, () => void refresh($, alerts))

    return next(e)
  })

  on('command.run', { command: 'stock' }, async ($, e) => {
    const [verb = 'list', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const watchlist = await loadWatchlist($)

    if (verb === 'add' || verb === 'rm' || verb === 'remove') {
      const codes = rest.map(normalizeSymbol)
      const invalid = rest.filter((_, i) => codes[i] === undefined)
      const valid = codes.filter((c): c is string => c !== undefined)
      const fresh = [...new Set(valid)].filter(c => !watchlist.includes(c))
      const room = Math.max(0, MAX_SYMBOLS - watchlist.length)
      const overLimit = verb === 'add' ? fresh.slice(room) : []
      const nextList = verb === 'add' ? [...watchlist, ...fresh.slice(0, room)] : watchlist.filter(c => !valid.includes(c))
      await $.store.set(WATCHLIST_KEY, nextList)
      await refresh($, alerts, { force: true })
      const absent = verb === 'add' ? [] : valid.filter(c => !watchlist.includes(c))
      const notes = [
        invalid.length > 0 ? `無法辨識：${invalid.join(' ')}` : '',
        absent.length > 0 ? `不在自選股：${absent.join(' ')}` : '',
        overLimit.length > 0 ? `最多 ${MAX_SYMBOLS} 檔，未加入：${overLimit.join(' ')}` : '',
      ].filter(Boolean)

      return { text: [`自選股：${nextList.join(' ') || '(空)'}`, ...notes].join('\n') }
    }

    if (verb === 'on' || verb === 'off') {
      await $.store.set(HIDDEN_KEY, verb === 'off')
      await update($, isHidden, () => verb === 'off')

      return { text: verb === 'off' ? '報價列已隱藏，/stock on 重新顯示。' : '報價列已顯示。' }
    }

    if (verb === 'list') {
      const list = await read($, quotes)
      const lines = list.map(q => `${q.symbol} ${q.label} ${formatPrice(q.price)} ${formatChange(q.changePercent)}`)

      return { text: lines.length > 0 ? lines.join('\n') : `自選股：${watchlist.join(' ') || '(空)'}` }
    }

    return { text: '用法：/stock add 2330 0050 | /stock rm 2330 | /stock list | /stock on | /stock off' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const list = await read($, quotes)
    const failure = await read($, error)
    const { Box, Text } = $.ui.resolve(e)

    if (list.length === 0) {
      return failure === null ? next(e) : <Text dimColor>台股報價暫時無法取得（{failure}）</Text>
    }

    // Keep whole quotes that fit on one row; never cut one in half. When some
    // do not fit, leave room for a "+N" saying how many are left out.
    const gap = 3
    let shown = fitRow(list, e.props.bodyColumns, gap)
    if (shown.length < list.length) shown = fitRow(list, e.props.bodyColumns - 4, gap)
    const hidden = list.length - shown.length

    const colorOf = (percent: number) => {
      if (percent === 0) return undefined
      return percent > 0 === isRedUp ? 'red' : 'green'
    }

    return (
      <Box flexDirection="row">
        {shown.map(quote => (
          <Box key={quote.symbol} marginRight={gap}>
            <Text>{quote.label} </Text>
            <Text bold>{formatPrice(quote.price)} </Text>
            <Text color={colorOf(quote.changePercent)} dimColor={quote.changePercent === 0}>
              {formatChange(quote.changePercent)}
            </Text>
          </Box>
        ))}
        {hidden > 0 ? <Text dimColor>+{hidden}</Text> : null}
      </Box>
    )
  })
}
