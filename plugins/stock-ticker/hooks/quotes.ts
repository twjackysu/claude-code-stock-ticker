import type { Quote } from '../types'

export type Market = 'tw' | 'us'

// Index codes, and the names people actually type for them.
const INDEX_ALIASES: Record<string, string> = {
  t00: 't00',
  taiex: 't00',
  加權: 't00',
  加權指數: 't00',
  大盤: 't00',
  o00: 'o00',
  tpex: 'o00',
  櫃買: 'o00',
  櫃買指數: 'o00',
  otc: 'o00',
  道瓊: '^DJI',
  dji: '^DJI',
  標普: '^GSPC',
  標普500: '^GSPC',
  spx: '^GSPC',
  sp500: '^GSPC',
  那斯達克: '^IXIC',
  nasdaq: '^IXIC',
  費半: '^SOX',
  sox: '^SOX',
}

const INDEX_LABELS: Record<string, string> = {
  t00: '加權',
  o00: '櫃買',
  '^DJI': 'Dow',
  '^GSPC': 'S&P 500',
  '^IXIC': 'Nasdaq',
  '^SOX': 'SOX',
}

export const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'NVDA', 'AAPL']

/** Taiwan codes start with a digit (2330, 00631L) or are an index (t00, o00); everything else is US. */
export const marketOf = (code: string): Market => (/^\d/.test(code) || code === 't00' || code === 'o00' ? 'tw' : 'us')

/** Normalizes what someone typed into a quote code, or undefined when it is not one. */
export function normalizeSymbol(raw: string): string | undefined {
  const text = raw.trim()
  const alias = INDEX_ALIASES[text.toLowerCase()]
  if (alias) return alias
  const code = text.toUpperCase().replace(/\.(TW|TWO)$/, '')
  if (/^\d{4,6}[A-Z]?$/.test(code)) return code

  // US tickers: AAPL, BRK-B, BRK.B, ^GSPC
  return /^\^?[A-Z][A-Z0-9]{0,5}([.-][A-Z])?$/.test(code) ? code.replace('.', '-') : undefined
}

/** One MIS request for every Taiwan code: each asked on both TWSE and TPEx, the wrong one answers empty. */
export function misUrl(codes: readonly string[]): string {
  const channels = codes.flatMap(code =>
    code === 't00' ? ['tse_t00.tw'] : code === 'o00' ? ['otc_o00.tw'] : [`tse_${code}.tw`, `otc_${code}.tw`],
  )

  return `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channels.join('|'))}&json=1&delay=0`
}

/**
 * One Yahoo Finance request for every US code. Yahoo's edge caches answer a
 * repeated URL with a snapshot up to several seconds old, so `now` makes each
 * request's URL its own.
 */
export function yahooUrl(codes: readonly string[], now: number): string {
  return `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(codes.join(','))}&range=1d&interval=1d&_=${now}`
}

const price = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : Number.NaN

  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Best bid/ask strings look like "2580.0000_2575.0000_..."
const bestLevel = (value: unknown) => (typeof value === 'string' ? price(value.split('_')[0]) : undefined)

const quoteOf = (symbol: string, label: string, last: number, previous: number): Quote => ({
  symbol,
  label,
  price: last,
  changePercent: ((last - previous) / previous) * 100,
})

/** Parses a MIS response into quotes, ordered as `codes`. */
export function parseMis(text: string, codes: readonly string[]): Quote[] {
  const rows = (JSON.parse(text) as { msgArray?: Record<string, unknown>[] }).msgArray ?? []
  const byCode = new Map<string, Quote>()

  for (const row of rows) {
    if (typeof row.c !== 'string' || typeof row.n !== 'string') continue
    const previous = price(row.y)
    // z is "-" between trades; fall back to the last trade, then the order book.
    const last = price(row.z) ?? price(row.pz) ?? bestLevel(row.b) ?? bestLevel(row.a) ?? previous
    if (last === undefined || previous === undefined) continue
    byCode.set(row.c, quoteOf(row.c, INDEX_LABELS[row.c] ?? row.n, last, previous))
  }

  return codes.flatMap(code => byCode.get(code) ?? [])
}

/** Parses a Yahoo spark response (`{ AAPL: { fulldayPrice, chartPreviousClose, close } }`), ordered as `codes`. */
export function parseYahoo(text: string, codes: readonly string[]): Quote[] {
  const bySymbol = JSON.parse(text) as Record<string, Record<string, unknown> | undefined>

  return codes.flatMap(code => {
    const row = bySymbol[code]
    if (!row) return []
    const closes = Array.isArray(row.close) ? row.close : []
    const last = price(row.fulldayPrice) ?? price(closes[closes.length - 1])
    const previous = price(row.chartPreviousClose) ?? price(row.previousClose)
    if (last === undefined || previous === undefined) return []
    const stamps = Array.isArray(row.timestamp) ? row.timestamp : []
    const asOf = stamps[stamps.length - 1]

    return [{ ...quoteOf(code, INDEX_LABELS[code] ?? code, last, previous), ...(typeof asOf === 'number' && { asOf }) }]
  })
}

export function formatPrice(n: number): string {
  if (n >= 10000) return n.toFixed(0)
  if (Number.isInteger(n)) return String(n)

  return n.toFixed(2).replace(/\.?0+$/, '')
}

export function formatChange(percent: number): string {
  const arrow = percent > 0 ? '▲' : percent < 0 ? '▼' : '-'

  return `${arrow}${Math.abs(percent).toFixed(2)}%`
}

/** Terminal cells a string takes: CJK and fullwidth characters take two. */
export function cellWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    width += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1
  }

  return width
}

const HOUR_MS = 60 * 60 * 1000

/** The nth Sunday (1-based) of a UTC month, as a day of the month. */
function nthSunday(year: number, month: number, n: number): number {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay()

  return 1 + ((7 - firstDay) % 7) + (n - 1) * 7
}

/** New York's offset from UTC in hours: -4 from the second Sunday of March 2:00 to the first Sunday of November 2:00, -5 otherwise. */
function newYorkOffset(now: number): number {
  const year = new Date(now).getUTCFullYear()
  const dstStart = Date.UTC(year, 2, nthSunday(year, 2, 2), 2 + 5)
  const dstEnd = Date.UTC(year, 10, nthSunday(year, 10, 1), 2 + 4)

  return now >= dstStart && now < dstEnd ? -4 : -5
}

/** Local weekday and minutes since midnight at a fixed UTC offset. */
function localClock(now: number, offsetHours: number) {
  const local = new Date(now + offsetHours * HOUR_MS)

  return { day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() }
}

/**
 * Whether a market is trading: Taiwan weekdays 08:30–14:00 (pre-open matching
 * through the after-hours fixed-price session), US weekdays 09:30–16:00 New York.
 */
export function isMarketOpen(market: Market, now: number): boolean {
  const { day, minutes } = market === 'tw' ? localClock(now, 8) : localClock(now, newYorkOffset(now))
  const [open, close] = market === 'tw' ? [8 * 60 + 30, 14 * 60] : [9 * 60 + 30, 16 * 60]

  return day >= 1 && day <= 5 && minutes >= open && minutes <= close
}

/** The Taipei calendar day, for once-a-day alerts. */
export const taipeiDay = (now: number) => new Date(now + 8 * HOUR_MS).toISOString().slice(0, 10)
