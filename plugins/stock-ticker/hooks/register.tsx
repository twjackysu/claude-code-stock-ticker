import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Lang, Quote, QuoteError, TickerSettings } from '../types'
import { MESSAGES } from './messages'
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

const DEFAULT_SETTINGS: TickerSettings = { refreshSeconds: { tw: 15, us: 15 }, colors: 'green-up', alertPercent: 3, lang: 'en' }
const MIN_REFRESH_SECONDS = 5

const quotes = atom({ plugin: 'stock-ticker', key: 'quotes' } as const, [] as Quote[])
const isHidden = atom({ plugin: 'stock-ticker', key: 'isHidden' } as const, false)
const error = atom({ plugin: 'stock-ticker', key: 'error' } as const, null as QuoteError | null)
const settings = atom({ plugin: 'stock-ticker', key: 'settings' } as const, DEFAULT_SETTINGS)

const WATCHLIST_KEY = 'watchlist'
const HIDDEN_KEY = 'hidden'
const SETTINGS_KEY = 'settings'
const MAX_SYMBOLS = 10
// The band never grows past this many rows, so it stays out of the way of the prompt.
const MAX_ROWS = 3

async function loadWatchlist($: EngineInterface): Promise<string[]> {
  const stored = await $.store.get(WATCHLIST_KEY)

  return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : DEFAULT_WATCHLIST
}

/**
 * What the person changed, and nothing else: unchanged fields follow the
 * defaults, so a later release's new default reaches them.
 */
type SettingsOverrides = {
  refreshSeconds?: Partial<Record<Market, number>>
  colors?: TickerSettings['colors']
  alertPercent?: number
  lang?: Lang
}

async function loadOverrides($: EngineInterface): Promise<SettingsOverrides> {
  const stored = await $.store.get(SETTINGS_KEY)

  return typeof stored === 'object' && stored !== null ? (stored as SettingsOverrides) : {}
}

/** The overrides over the defaults, each field checked so a bad value falls back. */
function applyOverrides(o: SettingsOverrides): TickerSettings {
  const seconds = (value: unknown, fallback: number) =>
    typeof value === 'number' && value >= MIN_REFRESH_SECONDS ? value : fallback

  return {
    refreshSeconds: {
      tw: seconds(o.refreshSeconds?.tw, DEFAULT_SETTINGS.refreshSeconds.tw),
      us: seconds(o.refreshSeconds?.us, DEFAULT_SETTINGS.refreshSeconds.us),
    },
    colors: o.colors === 'red-up' || o.colors === 'green-up' ? o.colors : DEFAULT_SETTINGS.colors,
    alertPercent: typeof o.alertPercent === 'number' && o.alertPercent >= 0 ? o.alertPercent : DEFAULT_SETTINGS.alertPercent,
    lang: o.lang === 'zh' || o.lang === 'en' ? o.lang : DEFAULT_SETTINGS.lang,
  }
}

/** Stores one change on top of the earlier ones and returns the settings now in force. */
async function saveSettings($: EngineInterface, change: SettingsOverrides): Promise<TickerSettings> {
  const stored = await loadOverrides($)
  const merged: SettingsOverrides = {
    ...stored,
    ...change,
    ...(change.refreshSeconds && { refreshSeconds: { ...stored.refreshSeconds, ...change.refreshSeconds } }),
  }
  await $.store.set(SETTINGS_KEY, merged)
  const next = applyOverrides(merged)
  await update($, settings, () => next)

  return next
}

const MARKETS: readonly Market[] = ['tw', 'us']

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
    await update($, error, () => ({ market, message }))
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

/**
 * Quotes packed into rows of `columns` cells, at most `maxRows` of them. Each
 * row takes whole quotes; when some are left over, the last row keeps room
 * for a "+N" saying how many.
 */
function layoutRows(list: Quote[], columns: number, maxRows: number, gap: number): { rows: Quote[][]; hidden: number } {
  const rows: Quote[][] = []
  let rest = list
  while (rest.length > 0 && rows.length < maxRows) {
    const isLast = rows.length === maxRows - 1
    let row = fitRow(rest, columns, gap)
    if (isLast && row.length < rest.length) row = fitRow(rest, columns - 4, gap)
    // A quote wider than the whole row still gets a row of its own.
    if (row.length === 0) row = rest.slice(0, 1)
    rows.push(row)
    rest = rest.slice(row.length)
  }

  return { rows, hidden: rest.length }
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
      description: 'Stock ticker: add/remove Taiwan or US symbols, change refresh, colors, alerts and language',
      argumentHint: 'add 2330 NVDA | rm 2330 | rm all | list | refresh 5 | color red-up | alert 5 | lang zh | settings | on | off',
    })
    const wasHidden = (await $.store.get(HIDDEN_KEY)) === true
    await update($, isHidden, () => wasHidden)
    const loaded = applyOverrides(await loadOverrides($))
    await update($, settings, () => loaded)

    void refreshAll($, poll, { force: true })
    startTimers($, poll, loaded)

    return next(e)
  })

  on('command.run', { command: 'stock' }, async ($, e) => {
    const [verb = 'list', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const watchlist = await loadWatchlist($)
    const t = MESSAGES[(await read($, settings)).lang]

    // Checked before symbols: ALL is also Allstate's ticker, which `add ALL` still adds.
    const isRemove = verb === 'rm' || verb === 'remove'
    if (isRemove && rest.length === 1 && rest[0]?.toLowerCase() === 'all') {
      await $.store.set(WATCHLIST_KEY, [])
      await refreshAll($, poll, { force: true })

      return { text: t.cleared }
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
        invalid.length > 0 ? t.unknown(invalid) : '',
        absent.length > 0 ? t.notInWatchlist(absent) : '',
        overLimit.length > 0 ? t.overLimit(MAX_SYMBOLS, overLimit) : '',
      ].filter(Boolean)

      return { text: [t.watchlist(nextList), ...notes].join('\n') }
    }

    if (verb === 'refresh') {
      // `/stock refresh 5` sets the US; `/stock refresh tw 10` Taiwan.
      const named = rest[0] === 'tw' || rest[0] === 'us' ? rest[0] : undefined
      const market: Market = named ?? 'us'
      const seconds = Number(named ? rest[1] : rest[0])
      if (!Number.isFinite(seconds) || seconds < MIN_REFRESH_SECONDS) {
        return { text: t.refreshInvalid(MIN_REFRESH_SECONDS) }
      }
      const next = await saveSettings($, { refreshSeconds: { [market]: seconds } })
      startTimers($, poll, next)

      return { text: t.refresh(next) }
    }

    if (verb === 'color' || verb === 'colors') {
      const choice = rest[0]?.toLowerCase()
      if (choice !== 'red-up' && choice !== 'green-up') {
        return { text: t.colorsInvalid }
      }

      return { text: t.colors(await saveSettings($, { colors: choice })) }
    }

    if (verb === 'alert') {
      const percent = Number(rest[0])
      if (!Number.isFinite(percent) || percent < 0) {
        return { text: t.alertInvalid }
      }

      return { text: t.alert(await saveSettings($, { alertPercent: percent })) }
    }

    if (verb === 'lang') {
      const choice = rest[0]?.toLowerCase()
      const lang: Lang | undefined =
        choice === 'en' ? 'en' : choice === 'zh' || choice === 'zh-tw' || choice === '中文' ? 'zh' : undefined
      if (!lang) return { text: t.langInvalid }
      await saveSettings($, { lang })

      return { text: MESSAGES[lang].lang }
    }

    if (verb === 'settings') {
      const current = await read($, settings)

      return { text: [t.refresh(current), t.colors(current), t.alert(current), t.lang].join('\n') }
    }

    if (verb === 'on' || verb === 'off') {
      await $.store.set(HIDDEN_KEY, verb === 'off')
      await update($, isHidden, () => verb === 'off')

      return { text: verb === 'off' ? t.hidden : t.shown }
    }

    if (verb === 'list') {
      const list = await read($, quotes)
      const lines = list.map(q =>
        [q.symbol, q.label === q.symbol ? '' : q.label, formatPrice(q.price), formatChange(q.changePercent)].filter(Boolean).join(' '),
      )

      return { text: lines.length > 0 ? lines.join('\n') : t.watchlist(watchlist) }
    }

    return { text: t.usage }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const list = await read($, quotes)
    const failure = await read($, error)
    const current = await read($, settings)
    const isRedUp = current.colors === 'red-up'
    const { Box, Text } = $.ui.resolve(e)

    if (list.length === 0) {
      if (failure === null) return next(e)
      const t = MESSAGES[current.lang]

      return <Text dimColor>{t.unavailable(`${t.market[failure.market]}: ${failure.message}`)}</Text>
    }

    // Wraps to the width this surface has now; a resize draws it again.
    const gap = 3
    const { rows, hidden } = layoutRows(list, e.props.bodyColumns, Math.max(1, Math.min(MAX_ROWS, e.props.maxRows)), gap)

    const colorOf = (percent: number) => {
      if (percent === 0) return undefined
      return percent > 0 === isRedUp ? 'red' : 'green'
    }

    return (
      <Box flexDirection="column">
        {rows.map((row, index) => (
          <Box key={`row-${index}`} flexDirection="row">
            {row.map(quote => (
              <Box key={quote.symbol} marginRight={gap}>
                <Text>{quote.label} </Text>
                <Text bold>{formatPrice(quote.price)} </Text>
                <Text color={colorOf(quote.changePercent)} dimColor={quote.changePercent === 0}>
                  {formatChange(quote.changePercent)}
                </Text>
              </Box>
            ))}
            {index === rows.length - 1 && hidden > 0 ? <Text dimColor>+{hidden}</Text> : null}
          </Box>
        ))}
      </Box>
    )
  })
}
