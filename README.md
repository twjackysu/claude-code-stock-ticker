# Claude Code Stock Ticker

**繁體中文** | [English](README.en.md)

一邊讓 Claude 寫程式，一邊在輸入框上方看台股即時報價。

![在 Claude Code 桌面版的樣子](docs/screenshot.png)

- 盤中每 30 秒更新上市櫃即時報價
- 支援個股、ETF、加權指數、櫃買指數
- 紅漲綠跌或綠漲紅跌可切換
- 漲跌幅超過門檻時跳通知
- 終端機和 Claude Code 桌面版都能用

## 安裝

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

## 指令

| 指令 | 說明 |
| --- | --- |
| `/stock add 2330 0050 加權` | 加入自選股（股票代號、ETF 代號、`加權`/`TAIEX`、`櫃買`/`TPEX`） |
| `/stock rm 2330` | 移除自選股 |
| `/stock list` | 列出自選股與最新報價 |
| `/stock off` / `/stock on` | 隱藏／顯示報價列 |

預設自選股：加權、2330、0050，跨 session 保留。

## 設定

在 `/config` 的 **stock-ticker** 底下調整：

| 設定 | 預設 | 說明 |
| --- | --- | --- |
| 更新秒數 | `30` | 最少 10 秒 |
| 漲跌顏色 | `red-up` | `red-up` 紅漲綠跌（台股慣例），`green-up` 綠漲紅跌（美股慣例） |
| 通知門檻（%） | `3` | 每檔每天最多通知一次，設 `0` 關閉 |

## 運作方式

這是一個 [Claude Code mod](https://claude.dev/blog/getting-started-with-claude-code-mods/)，也就是用 function hooks 寫的 plugin。
它在輸入框上方畫一條 `AbovePrompt` 報價列，透過 `$.http.fetch` 輪詢證交所 MIS 公開報價。
非交易時段（台北時間平日 08:30–14:00 以外）停止輪詢，保留最後報價。
本 mod 不讀取你的專案內容，除了 `mis.twse.com.tw` 不連線任何地方。

報價僅供參考，可能有延遲，不構成投資建議。

## 開發

```bash
claude --plugin-dir ./plugins/stock-ticker
claude plugin validate ./plugins/stock-ticker
claude plugin test ./plugins/stock-ticker
```

## License

MIT
