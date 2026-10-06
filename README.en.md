# Claude Code Stock Ticker

[繁體中文](README.md) | **English**

Watch the Taiwan stock market right above your Claude Code prompt while Claude works.

![Stock ticker band above the prompt in the Claude Code desktop app](docs/screenshot.png)

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

The default watchlist is 加權 (TAIEX), 2330 and 0050. It is kept across sessions.

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

## License

MIT
