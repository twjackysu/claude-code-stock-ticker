# Claude Code Stock Ticker

[繁體中文](README.md) | **English**

**Claude writes the code. You watch the market.**

Live Taiwan stock quotes right above your Claude Code prompt, so you can check your watchlist while Claude works.

![Stock ticker band above the prompt in the Claude Code desktop app](docs/screenshot.png)

- TWSE and TPEx stocks, ETFs, and the TAIEX / TPEx indices
- Refreshes every 5 seconds during market hours, with a toast on big moves
- Works in the terminal and the desktop app, no setup needed

## Install

Paste this into a terminal (requires Claude Code 2.1.287 or later):

```bash
claude plugin marketplace add twjackysu/claude-code-stock-ticker && claude plugin install stock-ticker@claude-code-stock-ticker
```

Or inside Claude Code:

```
/plugin marketplace add twjackysu/claude-code-stock-ticker
/plugin install stock-ticker@claude-code-stock-ticker
/reload-plugins
```

## Usage

```
/stock add 2330 2454 TPEX   add symbols
/stock rm 2330              remove
/stock list                 show quotes
/stock off                  hide (/stock on to show)
```

The default watchlist is TAIEX, 2330 and 0050, up to 10 symbols. Refresh rate, red-up or green-up colors, and the alert threshold are in `/config` under **stock-ticker**.

## Notes

- Data source: TWSE MIS public real-time quotes
- Outside trading hours (weekdays 08:30–14:00 Taipei time) polling stops and the last quotes stay
- Quotes are for reference only. Not investment advice.

## License

MIT
