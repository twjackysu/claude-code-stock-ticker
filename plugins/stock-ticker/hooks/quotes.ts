import type { Quote } from '../types'

// TWSE MIS index codes, and the names people actually type for them.
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
}

const INDEX_LABELS: Record<string, string> = { t00: '加權', o00: '櫃買' }

export const DEFAULT_WATCHLIST = ['t00', '2330', '0050', '2317', '2454']

/** Normalizes what someone typed into a MIS code, or undefined when it is not one. */
export function normalizeSymbol(raw: string): string | undefined {
  const text = raw.trim()
  const alias = INDEX_ALIASES[text.toLowerCase()]
  if (alias) return alias
  const code = text.toUpperCase().replace(/\.(TW|TWO)$/, '')

  return /^\d{4,6}[A-Z]?$/.test(code) ? code : undefined
}

/** One request for every code: each asked on both TWSE and TPEx, the wrong one answers empty. */
export function misUrl(codes: readonly string[]): string {
  const channels = codes.flatMap(code =>
    code === 't00' ? ['tse_t00.tw'] : code === 'o00' ? ['otc_o00.tw'] : [`tse_${code}.tw`, `otc_${code}.tw`],
  )

  return `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channels.join('|'))}&json=1&delay=0`
}

const price = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number.NaN

  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Best bid/ask strings look like "2580.0000_2575.0000_..."
const bestLevel = (value: unknown) => (typeof value === 'string' ? price(value.split('_')[0]) : undefined)

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
    byCode.set(row.c, {
      symbol: row.c,
      label: INDEX_LABELS[row.c] ?? row.n,
      price: last,
      changePercent: ((last - previous) / previous) * 100,
    })
  }

  return codes.flatMap(code => byCode.get(code) ?? [])
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
