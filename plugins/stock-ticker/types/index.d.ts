export type Quote = {
  symbol: string
  label: string
  price: number
  changePercent: number
  /** When the source priced it, in seconds, where the source says (Yahoo). */
  asOf?: number
}

declare module 'claude-code' {
  interface PluginState {
    'stock-ticker': {
      quotes: Quote[]
      isHidden: boolean
      error: string | null
    }
  }
}
