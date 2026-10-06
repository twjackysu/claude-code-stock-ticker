import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Quote, TickerSettings } from '../types'
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

const DEFAULT_SETTINGS: TickerSettings = { refreshSeconds: { tw: 15, us: 15 }, colors: 'red-up', alertPercent: 3 }
const MIN_REFRESH_SECONDS = 5

const quotes = atom({ plugin: 'stock-ticker', key: 'quotes' } as const, [] as Quote[])
const isHidden = atom({ plugin: 'stock-ticker', key: 'isHidden' } as const, false)
const error = atom({ plugin: 'stock-ticker', key: 'error' } as const, null as string | null)
const settings = atom({ plugin: 'stock-ticker', key: 'settings' } as const, DEFAULT_SETTINGS)

const WATCHLIST_KEY = 'watchlist'
const HIDDEN_KEY = 'hidden'
const SETTINGS_KEY = 'settings'
const MAX_SYMBOLS = 10

async function loadWatchlist($: EngineInterface): Promise<string[]> {
  const stored = await $.store.get(WATCHLIST_KEY)

  return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : DEFAULT_WATCHLIST
}

/** The stored settings over the defaults, each field checked so a bad value falls back. */
async function loadSettings($: EngineInterface): Promise<TickerSettings> {
  const stored = ((await $.store.get(SETTINGS_KEY)) ?? {}) as Partial<TickerSettings>
  const seconds = (value: unknown, fallback: number) =>
    typeof value === 'number' && value >= MIN_REFRESH_SECONDS ? value : fallback

  return {
    refreshSeconds: {
      tw: seconds(stored.refreshSeconds?.tw, DEFAULT_SETTINGS.refreshSeconds.tw),
      us: seconds(stored.refreshSeconds?.us, DEFAULT_SETTINGS.refreshSeconds.us),
    },
    colors: stored.colors === 'green-up' ? 'green-up' : DEFAULT_SETTINGS.colors,
    alertPercent:
      typeof stored.alertPercent === 'number' && stored.alertPercent >= 0 ? stored.alertPercent : DEFAULT_SETTINGS.alertPercent,
  }
}

async function saveSettings($: EngineInterface, change: (current: TickerSettings) => TickerSettings): Promise<TickerSettings> {
  const next = change(await read($, settings))
  await $.store.set(SETTINGS_KEY, next)
  await update($, settings, () => next)

  return next
}

const MARKETS: readonly Market[] = ['tw', 'us']
const MARKET_NAMES: Record<Market, string> = { tw: '台股 Taiwan', us: '美股 US' }
// Replies read in Chinese then English, for both audiences.
const listText = (codes: readonly string[]) => `自選股 Watchlist：${codes.join(' ') || '(空 empty)'}`
const refreshText = (s: TickerSettings) => `更新秒數 Refresh：美股 US ${s.refreshSeconds.us}s，台股 Taiwan ${s.refreshSeconds.tw}s`
const colorsText = (s: TickerSettings) => `漲跌顏色 Colors：${s.colors === 'red-up' ? '紅漲綠跌 red-up' : '綠漲紅跌 green-up'}`
const alertText = (s: TickerSettings) =>
  s.alertPercent > 0 ? `通知門檻 Alert：${s.alertPercent}%` : '通知已關閉 Alerts off'
const USAGE = [
  '用法 Usage：',
  '/stock add 2330 NVDA | /stock rm 2330 | /stock rm all | /stock list | /stock on | /stock off',
  '/stock refresh 5 | /stock refresh tw 10 | /stock color green-up | /stock alert 5 | /stock settings',
].join('\n')

/** This session's polling per market, and which big-move toasts already fired today. */
type Poll = {
  timers: Partial<Record<Market, Timer>>
  isFetching: Record<Market, boolean>
  alerted: Set<string>
}

/** (Re)starts each market's timer at its current interval. */
function startTimers($: EngineInterface, poll: Poll, current: TickerSettings) {
  for (const market of MARKETS) {
    poll.timers[market]?.cancel()
    poll.timers[market] = $.clock.every(current.refreshSeconds[market] * 1000, () => void refresh($, poll, market))
  }
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
    notifyBigMoves($, poll, (await read($, settings)).alertPercent, fresh, now)
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

function notifyBigMoves($: EngineInterface, poll: Poll, alertPercent: number, list: Quote[], now: number) {
  if (alertPercent <= 0) return
  const day = taipeiDay(now)
  for (const quote of list) {
    const id = `${day}:${quote.symbol}`
    if (Math.abs(quote.changePercent) < alertPercent || poll.alerted.has(id)) continue
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

export const register: Register = on => {
  const poll: Poll = { timers: {}, isFetching: { tw: false, us: false }, alerted: new Set() }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'stock',
      description: 'Stock ticker: add/remove Taiwan or US symbols, change refresh, colors and alerts',
      argumentHint: 'add 2330 NVDA | rm 2330 | rm all | list | refresh 5 | color green-up | alert 5 | settings | on | off',
    })
    const wasHidden = (await $.store.get(HIDDEN_KEY)) === true
    await update($, isHidden, () => wasHidden)
    const loaded = await loadSettings($)
    await update($, settings, () => loaded)

    void refreshAll($, poll, { force: true })
    startTimers($, poll, loaded)

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

    if (verb === 'refresh') {
      // `/stock refresh 5` sets the US; `/stock refresh tw 10` Taiwan.
      const named = rest[0] === 'tw' || rest[0] === 'us' ? rest[0] : undefined
      const market: Market = named ?? 'us'
      const seconds = Number(named ? rest[1] : rest[0])
      if (!Number.isFinite(seconds) || seconds < MIN_REFRESH_SECONDS) {
        return { text: `秒數要 ${MIN_REFRESH_SECONDS} 以上 Seconds must be ${MIN_REFRESH_SECONDS} or more：/stock refresh 5 | /stock refresh tw 10` }
      }
      const next = await saveSettings($, s => ({ ...s, refreshSeconds: { ...s.refreshSeconds, [market]: seconds } }))
      startTimers($, poll, next)

      return { text: refreshText(next) }
    }

    if (verb === 'color' || verb === 'colors') {
      const choice = rest[0]?.toLowerCase()
      if (choice !== 'red-up' && choice !== 'green-up') {
        return { text: '用 red-up（紅漲綠跌）或 green-up（綠漲紅跌） Use red-up or green-up：/stock color green-up' }
      }
      const next = await saveSettings($, s => ({ ...s, colors: choice }))

      return { text: colorsText(next) }
    }

    if (verb === 'alert') {
      const percent = Number(rest[0])
      if (!Number.isFinite(percent) || percent < 0) {
        return { text: '門檻要 0 以上，0 關閉 Use 0 or more, 0 turns alerts off：/stock alert 5' }
      }
      const next = await saveSettings($, s => ({ ...s, alertPercent: percent }))

      return { text: alertText(next) }
    }

    if (verb === 'settings') {
      const current = await read($, settings)

      return { text: [refreshText(current), colorsText(current), alertText(current)].join('\n') }
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

    return { text: USAGE }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const list = await read($, quotes)
    const failure = await read($, error)
    const isRedUp = (await read($, settings)).colors === 'red-up'
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
