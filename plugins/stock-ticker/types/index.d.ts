export type Quote = {
  symbol: string
  label: string
  price: number
  changePercent: number
  /** When the source priced it, in seconds, where the source says (Yahoo). */
  asOf?: number
}

/** The language of the mod's own messages; quote codes and names are never translated. */
export type Lang = 'en' | 'zh'

export type TickerSettings = {
  /** Seconds between polls for each market. */
  refreshSeconds: { tw: number; us: number }
  colors: 'red-up' | 'green-up'
  /** Toast once a day when a quote moves at least this much; 0 turns alerts off. */
  alertPercent: number
  lang: Lang
}

/** The last failed fetch, kept as data so the band words it in the current language. */
export type QuoteError = { market: 'tw' | 'us'; message: string }

declare module 'claude-code' {
  interface PluginState {
    'stock-ticker': {
      quotes: Quote[]
      isHidden: boolean
      error: QuoteError | null
      settings: TickerSettings
    }
  }
}
