export type Quote = {
  symbol: string
  label: string
  price: number
  changePercent: number
  /** When the source priced it, in seconds, where the source says (Yahoo). */
  asOf?: number
}

export type TickerSettings = {
  /** Seconds between polls for each market. */
  refreshSeconds: { tw: number; us: number }
  colors: 'red-up' | 'green-up'
  /** Toast once a day when a quote moves at least this much; 0 turns alerts off. */
  alertPercent: number
}

declare module 'claude-code' {
  interface PluginState {
    'stock-ticker': {
      quotes: Quote[]
      isHidden: boolean
      error: string | null
      settings: TickerSettings
    }
  }
}
