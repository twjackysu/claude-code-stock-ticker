import type { Lang, TickerSettings } from '../types'
import type { Market } from './quotes'

/** Every line the mod says to the person, per language. Quote codes and names are never translated. */
export type Messages = {
  market: Record<Market, string>
  watchlist: (codes: readonly string[]) => string
  cleared: string
  unknown: (codes: readonly string[]) => string
  notInWatchlist: (codes: readonly string[]) => string
  overLimit: (limit: number, codes: readonly string[]) => string
  refresh: (s: TickerSettings) => string
  refreshInvalid: (min: number) => string
  colors: (s: TickerSettings) => string
  colorsInvalid: string
  alert: (s: TickerSettings) => string
  alertInvalid: string
  lang: string
  langInvalid: string
  hidden: string
  shown: string
  usage: string
  unavailable: (reason: string) => string
}

const COMMANDS = [
  '/stock add 2330 NVDA | /stock rm 2330 | /stock rm all | /stock list | /stock on | /stock off',
  '/stock refresh 5 | /stock refresh tw 10 | /stock color red-up | /stock alert 5 | /stock lang zh | /stock settings',
].join('\n')

export const MESSAGES: Record<Lang, Messages> = {
  en: {
    market: { tw: 'Taiwan', us: 'US' },
    watchlist: codes => `Watchlist: ${codes.join(' ') || '(empty)'}`,
    cleared: 'Watchlist cleared. Add symbols with /stock add NVDA 2330.',
    unknown: codes => `Unknown: ${codes.join(' ')}`,
    notInWatchlist: codes => `Not in watchlist: ${codes.join(' ')}`,
    overLimit: (limit, codes) => `Over the ${limit}-symbol limit: ${codes.join(' ')}`,
    refresh: s => `Refresh: US ${s.refreshSeconds.us}s, Taiwan ${s.refreshSeconds.tw}s`,
    refreshInvalid: min => `Seconds must be ${min} or more: /stock refresh 5 | /stock refresh tw 10`,
    colors: s => `Colors: ${s.colors === 'green-up' ? 'green for gains (green-up)' : 'red for gains (red-up)'}`,
    colorsInvalid: 'Use green-up or red-up: /stock color red-up',
    alert: s => (s.alertPercent > 0 ? `Alert: ${s.alertPercent}%` : 'Alerts off'),
    alertInvalid: 'Use 0 or more; 0 turns alerts off: /stock alert 5',
    lang: 'Language: English',
    langInvalid: 'Use en or zh: /stock lang zh',
    hidden: 'Ticker hidden. /stock on shows it again.',
    shown: 'Ticker shown.',
    usage: `Usage:\n${COMMANDS}`,
    unavailable: reason => `Quotes unavailable (${reason})`,
  },
  zh: {
    market: { tw: '台股', us: '美股' },
    watchlist: codes => `自選股：${codes.join(' ') || '(空)'}`,
    cleared: '自選股已清空，用 /stock add NVDA 2330 加入新的。',
    unknown: codes => `無法辨識：${codes.join(' ')}`,
    notInWatchlist: codes => `不在自選股：${codes.join(' ')}`,
    overLimit: (limit, codes) => `最多 ${limit} 檔，未加入：${codes.join(' ')}`,
    refresh: s => `更新秒數：美股 ${s.refreshSeconds.us} 秒，台股 ${s.refreshSeconds.tw} 秒`,
    refreshInvalid: min => `秒數要 ${min} 以上：/stock refresh 5 | /stock refresh tw 10`,
    colors: s => `漲跌顏色：${s.colors === 'green-up' ? '綠漲紅跌（green-up）' : '紅漲綠跌（red-up）'}`,
    colorsInvalid: '請用 green-up（綠漲紅跌）或 red-up（紅漲綠跌）：/stock color red-up',
    alert: s => (s.alertPercent > 0 ? `通知門檻：${s.alertPercent}%` : '通知已關閉'),
    alertInvalid: '門檻要 0 以上，0 是關閉：/stock alert 5',
    lang: '語言：中文',
    langInvalid: '請用 en 或 zh：/stock lang en',
    hidden: '報價列已隱藏，/stock on 重新顯示。',
    shown: '報價列已顯示。',
    usage: `用法：\n${COMMANDS}`,
    unavailable: reason => `報價暫時無法取得（${reason}）`,
  },
}
