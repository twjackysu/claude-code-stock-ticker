# Claude Code Stock Ticker

**English** | [繁體中文](#繁體中文)

Watch the Taiwan stock market right above your Claude Code prompt while Claude works.

```
加權 49823 ▲0.22%   台積電 2585 ▲0.39%   元大台灣50 198.5 ▼0.15%   鴻海 200.5 ▼2.20%
```

<!-- TODO: demo GIF -->

- Live TWSE / TPEx quotes, refreshed every 30 seconds during market hours
- Stocks, ETFs and the TAIEX / TPEx indices
- Red-up or green-up colors, your choice
- A toast when a symbol moves past your alert threshold
- Works in the terminal and the Claude Code desktop app

## Install

Requires Claude Code 2.1.287 or later.

Inside Claude Code:

```
/plugin marketplace add twjackysu/claude-code-stock-ticker
/plugin install stock-ticker@claude-code-stock-ticker
/reload-plugins
```

Or from a terminal, in one line:

```bash
claude plugin marketplace add twjackysu/claude-code-stock-ticker && claude plugin install stock-ticker@claude-code-stock-ticker
```

## Usage

| Command | What it does |
| --- | --- |
| `/stock add 2330 0050 加權` | Add symbols (stock codes, ETF codes, `加權`/`TAIEX`, `櫃買`/`TPEX`) |
| `/stock rm 2330` | Remove symbols |
| `/stock list` | Show the watchlist with the latest quotes |
| `/stock off` / `/stock on` | Hide or show the band |

The default watchlist is 加權, 2330, 0050, 2317 and 2454. It is kept across sessions.

## Settings

Change them in `/config` under **stock-ticker**:

| Setting | Default | |
| --- | --- | --- |
| Refresh interval (seconds) | `30` | Minimum 10 |
| Up/down colors | `red-up` | `red-up` (Taiwan convention) or `green-up` (US convention) |
| Alert threshold (%) | `3` | Toast once a day per symbol; `0` turns alerts off |

## How it works

This is a [Claude Code mod](https://claude.dev/blog/getting-started-with-claude-code-mods/): a plugin of function hooks.
It draws an `AbovePrompt` band and polls the public TWSE MIS quote endpoint through `$.http.fetch`.
Outside market hours (weekdays 08:30–14:00 Taipei time) it stops polling and keeps the last quotes.
It reads nothing from your project and sends nothing anywhere but `mis.twse.com.tw`.

Quotes are for reference only and may be delayed. Not investment advice.

## Development

```bash
claude --plugin-dir ./plugins/stock-ticker
claude plugin validate ./plugins/stock-ticker
claude plugin test ./plugins/stock-ticker
```

---

## 繁體中文

一邊讓 Claude 寫程式，一邊在輸入框上方看台股即時報價。

- 盤中每 30 秒更新上市櫃即時報價
- 支援個股、ETF、加權指數、櫃買指數
- 紅漲綠跌或綠漲紅跌可切換
- 漲跌幅超過門檻時跳通知
- 終端機和 Claude Code 桌面版都能用

### 安裝

需要 Claude Code 2.1.287 以上。

在 Claude Code 裡輸入：

```
/plugin marketplace add twjackysu/claude-code-stock-ticker
/plugin install stock-ticker@claude-code-stock-ticker
/reload-plugins
```

或在終端機一行裝好：

```bash
claude plugin marketplace add twjackysu/claude-code-stock-ticker && claude plugin install stock-ticker@claude-code-stock-ticker
```

### 指令

| 指令 | 說明 |
| --- | --- |
| `/stock add 2330 0050 加權` | 加入自選股（股票代號、ETF 代號、`加權`、`櫃買`） |
| `/stock rm 2330` | 移除自選股 |
| `/stock list` | 列出自選股與最新報價 |
| `/stock off` / `/stock on` | 隱藏／顯示報價列 |

預設自選股：加權、2330、0050、2317、2454，跨 session 保留。

### 設定

在 `/config` 的 **stock-ticker** 底下調整：更新秒數（預設 30）、漲跌顏色（預設紅漲綠跌）、通知門檻（預設 3%，設 0 關閉）。

### 說明

資料來源為證交所 MIS 公開報價，僅供參考，可能有延遲，不構成投資建議。
非交易時段（台北時間平日 08:30–14:00 以外）停止輪詢，保留最後報價。
本 mod 不讀取你的專案內容，除了 `mis.twse.com.tw` 不連線任何地方。

## License

MIT
