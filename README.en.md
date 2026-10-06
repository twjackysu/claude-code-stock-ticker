# Claude Code Stock Ticker

[繁體中文](README.md) | **English**

**Claude writes the code. You watch the market.**

Live Taiwan stock quotes right above your Claude Code prompt, so you can check your watchlist while Claude works.

![Stock ticker band above the prompt in the Claude Code desktop app](docs/screenshot.png)

- TWSE and TPEx stocks, ETFs, and the TAIEX / TPEx indices
- Refreshes every 5 seconds during market hours, with a toast on big moves
- Works in the terminal and the desktop app, no setup needed

## Install

Requires Claude Code 2.1.287 or later.

**Paste this into a terminal** (works for both the CLI and the desktop app; new sessions pick it up):

```bash
claude plugin marketplace add twjackysu/claude-code-stock-ticker && claude plugin install stock-ticker@claude-code-stock-ticker
```

**In the CLI** you can also type:

```
/plugin marketplace add twjackysu/claude-code-stock-ticker
/plugin install stock-ticker@claude-code-stock-ticker
/reload-plugins
```

**In the desktop app** you can also add the marketplace `https://github.com/twjackysu/claude-code-stock-ticker.git` from the plugin settings, then install **stock-ticker**.

## Usage

```
/stock add 2330 2454 TPEX   add symbols
/stock rm 2330              remove
/stock list                 show quotes
/stock off                  hide (/stock on to show)
```

The default watchlist is TAIEX, 2330 and 0050, up to 10 symbols.

## Settings

Available settings:

| Setting | Default | |
| --- | --- | --- |
| `refreshSeconds` | `5` | Refresh interval in seconds, minimum 5 |
| `colors` | `red-up` | `red-up` for red gains, `green-up` for green gains |
| `alertPercent` | `3` | Toast once a day per symbol past this move; `0` turns alerts off |

Change them from a terminal (works for both the CLI and the desktop app; restart Claude Code afterwards):

```bash
echo '{"refreshSeconds":"10"}' | claude plugin configure stock-ticker@claude-code-stock-ticker --values-stdin
```

In the CLI you can also type `/plugin configure stock-ticker` inside Claude Code.

## Notes

- Data source: TWSE MIS public real-time quotes
- Outside trading hours (weekdays 08:30–14:00 Taipei time) polling stops and the last quotes stay
- Only the session on screen polls; switching to another session pauses it
- Quotes are for reference only. Not investment advice.

## License

MIT
