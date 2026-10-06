# Claude Code Stock Ticker

**繁體中文** | [English](README.en.md)

**Claude 在寫 code，你在看盤。**

在 Claude Code 輸入框上方即時顯示台股報價，等 Claude 跑任務的空檔，順便看一下自選股。

![在 Claude Code 桌面版的樣子](docs/screenshot.png)

- 上市、上櫃、ETF、加權指數、櫃買指數都支援
- 盤中自動更新，大漲大跌跳通知
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

預設自選股是加權、2330、0050。更新頻率、紅漲綠跌或綠漲紅跌、通知門檻可以在 `/config` 的 **stock-ticker** 調整。

## 說明

- 資料來源：證交所 MIS 公開即時報價
- 非交易時段（台北時間平日 08:30–14:00 以外）停止輪詢，保留最後報價
- 報價僅供參考，不構成投資建議

## License

MIT
