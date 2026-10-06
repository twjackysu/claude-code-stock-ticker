import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Quote } from '../types'
import type { Market } from './quotes'
import {
  DEFAULT_WATCHLIST,
  cellWidth,
  formatChange,
  formatPrice,
  isMarketOpen,
  marketOf,
  misUrl,
  normalizeSymbol,
  parseMis,
  parseYahoo,
  taipeiDay,
  yahooUrl,
} from './quotes'

const quotes = atom({ plugin: 'stock-ticker', key: 'quotes' } as const, [] as Quote[])
const isHidden = atom({ plugin: 'stock-ticker', key: 'isHidden' } as const, false)
const error = atom({ plugin: 'stock-ticker', key: 'error' } as const, null as string | null)

const WATCHLIST_KEY = 'watchlist'
const HIDDEN_KEY = 'hidden'
const MAX_SYMBOLS = 10

async function loadWatchlist($: EngineInterface): Promise<string[]> {
  const stored = await $.store.get(WATCHLIST_KEY)

  return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : DEFAULT_WATCHLIST
}

const MARKETS: readonly Market[] = ['tw', 'us']
const MARKET_NAMES: Record<Market, string> = { tw: '台股 Taiwan', us: '美股 US' }
// Replies read in Chinese then English, for both audiences.
const listText = (codes: readonly string[]) => `自選股 Watchlist：${codes.join(' ') || '(空 empty)'}`

/** This session's polling per market, and which big-move toasts already fired today. */
type Poll = {
  refreshMs: Record<Market, number>
  alertPercent: number
  isFetching: Record<Market, boolean>
  alerted: Set<string>
}

/** Taiwan quotes come from TWSE MIS; US quotes from Yahoo Finance, which refuses requests without a browser User-Agent. */
async function fetchQuotes($: EngineInterface, market: Market, codes: readonly string[], now: number): Promise<Quote[]> {
  const response =
    market === 'tw'
      ? await $.http.fetch(misUrl(codes))
      : await $.http.fetch(yahooUrl(codes, now), { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  return market === 'tw' ? parseMis(response.text, codes) : parseYahoo(response.text, codes)
}

/**
 * Every open session runs its own copy of the mod, so only a session on
 * screen polls: the desktop app and the phone detach a session when the
 * person switches away and attach it on return, and a terminal session is
 * drawn by its REPL for as long as it runs.
 */
async function isOnScreen($: EngineInterface): Promise<boolean> {
  return (await $.session.surfaces()).length > 0
}

/** Refreshes one market's quotes, keeping the other market's and the watchlist's order. */
async function refresh($: EngineInterface, poll: Poll, market: Market, { force = false } = {}) {
  const now = await $.clock.now()
  const watchlist = await loadWatchlist($)
  const codes = watchlist.filter(code => marketOf(code) === market)
  if (!force) {
    // Outside trading hours the last quotes stand; one fetch fills them in.
    const hasQuotes = (await read($, quotes)).some(quote => marketOf(quote.symbol) === market)
    if (!isMarketOpen(market, now) && hasQuotes) return
    if (!(await isOnScreen($))) return
  }
  if (poll.isFetching[market]) return

  // Merged into the latest list, not one read earlier: the other market may have landed meanwhile.
  // Should a cache still answer with an older snapshot, a quote never goes back in time.
  const merge = (fresh: Quote[]) => (latest: Quote[]) => {
    const bySymbol = new Map(latest.filter(q => marketOf(q.symbol) !== market).map(q => [q.symbol, q]))
    const previous = new Map(latest.map(q => [q.symbol, q]))
    for (const quote of fresh) {
      const known = previous.get(quote.symbol)
      const isStale = known?.asOf !== undefined && quote.asOf !== undefined && quote.asOf < known.asOf
      bySymbol.set(quote.symbol, isStale && known ? known : quote)
    }
    return watchlist.flatMap(code => bySymbol.get(code) ?? [])
  }
  if (codes.length === 0) {
    await update($, quotes, merge([]))
    return
  }

  poll.isFetching[market] = true
  try {
    const fresh = await fetchQuotes($, market, codes, now)
    await update($, quotes, merge(fresh))
    await update($, error, () => null)
    notifyBigMoves($, poll, fresh, now)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    await update($, error, () => `${MARKET_NAMES[market]}：${message}`)
  } finally {
    poll.isFetching[market] = false
  }
}

async function refreshAll($: EngineInterface, poll: Poll, { force = false } = {}) {
  await Promise.all(MARKETS.map(market => refresh($, poll, market, { force })))
}

function notifyBigMoves($: EngineInterface, poll: Poll, list: Quote[], now: number) {
  if (poll.alertPercent <= 0) return
  const day = taipeiDay(now)
  for (const quote of list) {
    const id = `${day}:${quote.symbol}`
    if (Math.abs(quote.changePercent) < poll.alertPercent || poll.alerted.has(id)) continue
    poll.alerted.add(id)
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
  const isRedUp = options.colors !== 'green-up'
  const poll: Poll = {
    refreshMs: {
      tw: Math.max(5, Number(options.refreshSeconds ?? 5)) * 1000,
      us: Math.max(5, Number(options.usRefreshSeconds ?? 5)) * 1000,
    },
    alertPercent: Number(options.alertPercent ?? 3),
    isFetching: { tw: false, us: false },
    alerted: new Set(),
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'stock',
      description: 'Stock ticker: add/remove Taiwan or US symbols, show or hide the band',
      argumentHint: 'add 2330 NVDA | rm 2330 | rm all | list | on | off',
    })
    const wasHidden = (await $.store.get(HIDDEN_KEY)) === true
    await update($, isHidden, () => wasHidden)

    void refreshAll($, poll, { force: true })
    for (const market of MARKETS) $.clock.every(poll.refreshMs[market], () => void refresh($, poll, market))

    return next(e)
  })

  on('command.run', { command: 'stock' }, async ($, e) => {
    const [verb = 'list', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const watchlist = await loadWatchlist($)

    // Checked before symbols: ALL is also Allstate's ticker, which `add ALL` still adds.
    const isRemove = verb === 'rm' || verb === 'remove'
    if (isRemove && rest.length === 1 && rest[0]?.toLowerCase() === 'all') {
      await $.store.set(WATCHLIST_KEY, [])
      await refreshAll($, poll, { force: true })

      return { text: '自選股已清空 Watchlist cleared。/stock add 2330 NVDA 加入新的 to add more.' }
    }

    if (verb === 'add' || isRemove) {
      const codes = rest.map(normalizeSymbol)
      const invalid = rest.filter((_, i) => codes[i] === undefined)
      const valid = codes.filter((c): c is string => c !== undefined)
      const fresh = [...new Set(valid)].filter(c => !watchlist.includes(c))
      const room = Math.max(0, MAX_SYMBOLS - watchlist.length)
      const overLimit = verb === 'add' ? fresh.slice(room) : []
      const nextList = verb === 'add' ? [...watchlist, ...fresh.slice(0, room)] : watchlist.filter(c => !valid.includes(c))
      await $.store.set(WATCHLIST_KEY, nextList)
      await refreshAll($, poll, { force: true })
      const absent = verb === 'add' ? [] : valid.filter(c => !watchlist.includes(c))
      const notes = [
        invalid.length > 0 ? `無法辨識 Unknown：${invalid.join(' ')}` : '',
        absent.length > 0 ? `不在自選股 Not in watchlist：${absent.join(' ')}` : '',
        overLimit.length > 0 ? `最多 ${MAX_SYMBOLS} 檔，未加入 Over the ${MAX_SYMBOLS}-symbol limit：${overLimit.join(' ')}` : '',
      ].filter(Boolean)

      return { text: [listText(nextList), ...notes].join('\n') }
    }

    if (verb === 'on' || verb === 'off') {
      await $.store.set(HIDDEN_KEY, verb === 'off')
      await update($, isHidden, () => verb === 'off')

      return {
        text: verb === 'off' ? '報價列已隱藏 Ticker hidden。/stock on 重新顯示 to show it again.' : '報價列已顯示 Ticker shown。',
      }
    }

    if (verb === 'list') {
      const list = await read($, quotes)
      const lines = list.map(q =>
        [q.symbol, q.label === q.symbol ? '' : q.label, formatPrice(q.price), formatChange(q.changePercent)].filter(Boolean).join(' '),
      )

      return { text: lines.length > 0 ? lines.join('\n') : listText(watchlist) }
    }

    return { text: '用法 Usage：/stock add 2330 NVDA | /stock rm 2330 | /stock rm all | /stock list | /stock on | /stock off' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const list = await read($, quotes)
    const failure = await read($, error)
    const { Box, Text } = $.ui.resolve(e)

    if (list.length === 0) {
      return failure === null ? next(e) : <Text dimColor>報價暫時無法取得 Quotes unavailable（{failure}）</Text>
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
