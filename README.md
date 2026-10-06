# Claude Code Stock Ticker

**English** | [繁體中文](README.zh-TW.md)

**Claude writes the code. You watch the market.**

Live Taiwan and US stock quotes right above your Claude Code prompt, so you can check your watchlist while Claude works.

![How it works](docs/demo.gif)

- Taiwan stocks, ETFs and indices; US stocks plus the Dow, S&P 500, Nasdaq and SOX
- Refreshes every 15 seconds during market hours (down to 5), with a toast on big moves
- Works in the CLI and the desktop app, no setup needed

## Install

Requires Claude Code 2.1.287 or later.

**CLI**: type this inside Claude Code:

```
/plugin marketplace add twjackysu/claude-code-stock-ticker
/plugin install stock-ticker@claude-code-stock-ticker
/reload-plugins
```

**Desktop app**: Settings → **Plugins** → **Add** → **Add from a repository**, enter `twjackysu/claude-code-stock-ticker` and press **Sync**, then install **Stock ticker** from **Discover**.

![Installing in the desktop app](docs/desktop-install.gif)

## Usage

```
/stock add 2330 NVDA SOX    add symbols (digits: Taiwan, letters: US)
/stock rm 2330              remove
/stock rm all               clear the watchlist
/stock list                 show quotes
/stock off                  hide (/stock on to show)
```

The default watchlist is SPY, QQQ, NVDA and AAPL, up to 10 symbols.

## Settings

Change them with `/stock`; they apply at once and are kept across sessions:

```
/stock refresh 5            US quotes every 5 seconds (default 15, minimum 5)
/stock refresh tw 10        Taiwan quotes every 10 seconds (default 15, minimum 5)
/stock color green-up       green for gains; red-up (the default) is red for gains, as in Taiwan
/stock alert 5              toast once a day when a symbol moves 5% or more (default 3, 0 turns it off)
/stock settings             show the current settings
```

## Update

Third-party plugins don't update on their own by default. In the CLI, type `/plugin`, open **Installed**, select stock-ticker and choose **Update now**. To update automatically, open **Marketplaces**, select claude-code-stock-ticker and choose **Enable auto-update**.

Or run this in a terminal (refreshing the marketplace first lets Claude Code see the new version):

```bash
claude plugin marketplace update claude-code-stock-ticker && claude plugin update stock-ticker@claude-code-stock-ticker
```

## What it connects to

- `mis.twse.com.tw` for Taiwan quotes and `query1.finance.yahoo.com` for US quotes, sending only the symbols on your watchlist.
- Nothing else: it reads nothing from your project or conversation, and sends no telemetry.

## Notes

- Data sources: TWSE MIS public real-time quotes for Taiwan, Yahoo Finance for the US
- Outside trading hours polling stops and the last quotes stay: Taiwan trades weekdays 08:30–14:00 Taipei time, the US weekdays 09:30–16:00 New York time
- Only the session on screen polls; switching to another session pauses it
- Quotes are for reference only. Not investment advice.

## License

MIT
