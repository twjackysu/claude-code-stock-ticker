export type Quote = {
  symbol: string
  label: string
  price: number
  changePercent: number
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
