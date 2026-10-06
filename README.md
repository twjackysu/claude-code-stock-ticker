# Claude Code Stock Ticker

**繁體中文** | [English](README.en.md)

**Claude 在寫 code，你在看盤。**

在 Claude Code 輸入框上方即時顯示台股報價，等 Claude 跑任務的空檔，順便看一下自選股。

![在 Claude Code 桌面版的樣子](docs/screenshot.png)

- 上市、上櫃、ETF、加權指數、櫃買指數都支援
- 盤中每 5 秒更新，大漲大跌跳通知
- 終端機和桌面版都能用，裝好不用設定

## 安裝

在終端機貼上這一行（需要 Claude Code 2.1.287 以上）：

```bash
claude plugin marketplace add twjackysu/claude-code-stock-ticker && claude plugin install stock-ticker@claude-code-stock-ticker
```

或在 Claude Code 裡輸入：

```
/plugin marketplace add twjackysu/claude-code-stock-ticker
/plugin install stock-ticker@claude-code-stock-ticker
/reload-plugins
```

## 用法

```
/stock add 2330 2454 櫃買   加入自選股
/stock rm 2330              移除
/stock list                 列出報價
/stock off                  隱藏（/stock on 顯示）
```

預設自選股是加權、2330、0050，最多 10 檔。

## 設定

在 Claude Code 輸入 `/config`，找到 **stock-ticker** 就能調整：

| 設定 | 預設 | 說明 |
| --- | --- | --- |
| `refreshSeconds` 更新秒數 | `5` | 最少 5 秒 |
| `colors` 漲跌顏色 | `red-up` | `red-up` 紅漲綠跌，`green-up` 綠漲紅跌 |
| `alertPercent` 通知門檻（%） | `3` | 每檔每天最多通知一次，`0` 關閉 |

也可以在安裝時直接指定，例如改成每 10 秒更新：

```bash
claude plugin install stock-ticker@claude-code-stock-ticker --config refreshSeconds=10
```

## 說明

- 資料來源：證交所 MIS 公開即時報價
- 非交易時段（台北時間平日 08:30–14:00 以外）停止輪詢，保留最後報價
- 只有畫面上正在看的 session 會輪詢，切到別的 session 就暫停
- 報價僅供參考，不構成投資建議

## License

MIT
