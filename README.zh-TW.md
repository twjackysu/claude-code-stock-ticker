# Claude Code Stock Ticker

**繁體中文** | [English](README.en.md)

**Claude 在寫 code，你在看盤。**

在 Claude Code 輸入框上方即時顯示台股、美股報價，等 Claude 跑任務的空檔，順便看一下自選股。

![使用方法](docs/demo.gif)

- 台股上市、上櫃、ETF、加權、櫃買，美股個股與道瓊、標普、那斯達克、費半
- 盤中每 5 秒更新，大漲大跌跳通知
- CLI 和桌面版都能用，裝好不用設定

## 安裝

需要 Claude Code 2.1.287 以上。

**CLI** 在 Claude Code 裡輸入：

```
/plugin marketplace add twjackysu/claude-code-stock-ticker
/plugin install stock-ticker@claude-code-stock-ticker
/reload-plugins
```

**桌面版**：設定 → **Plugins** → **Add** → **Add from a repository**，填入 `twjackysu/claude-code-stock-ticker` 按 **Sync**，再到 **Discover** 安裝 **Stock ticker**。

![桌面版安裝步驟](docs/desktop-install.gif)

## 用法

```
/stock add 2330 NVDA 費半   加入自選股（數字是台股，英文是美股）
/stock rm 2330              移除
/stock rm all               清空自選股
/stock list                 列出報價
/stock off                  隱藏（/stock on 顯示）
```

預設自選股是加權、2330、0050，最多 10 檔。

## 設定

可以調整的設定：

| 設定 | 預設 | 說明 |
| --- | --- | --- |
| `refreshSeconds` 台股更新秒數 | `5` | 最少 5 秒 |
| `usRefreshSeconds` 美股更新秒數 | `5` | 最少 5 秒 |
| `colors` 漲跌顏色 | `red-up` | `red-up` 紅漲綠跌，`green-up` 綠漲紅跌 |
| `alertPercent` 通知門檻（%） | `3` | 每檔每天最多通知一次，`0` 關閉 |

**CLI** 在 Claude Code 裡輸入 `/plugin configure stock-ticker` 修改。

**桌面版**在終端機（PowerShell、Terminal）執行這行，改完重開 Claude Code：

```bash
echo '{"refreshSeconds":"10"}' | claude plugin configure stock-ticker@claude-code-stock-ticker --values-stdin
```

## 更新

第三方 plugin 預設不會自動更新。CLI 在 Claude Code 裡輸入 `/plugin`，到 **Installed** 選 stock-ticker 按 **Update now**；想自動更新的話，到 **Marketplaces** 選 claude-code-stock-ticker 按 **Enable auto-update**。

也可以在終端機執行：

```bash
claude plugin update stock-ticker@claude-code-stock-ticker
```

## 搭配 TWSEMCPServer

想讓 Claude 幫你查更深入的台股資料（個股日 K、三大法人、月營收、重大訊息⋯），可以另外安裝 [TWSEMCPServer](https://github.com/twjackysu/TWSEMCPServer)。兩個各自獨立，自由搭配：

```bash
claude mcp add --transport http --scope user tw-stock https://TW-Stock-MCP-Server.fastmcp.app/mcp
```

線上服務有使用量上限，用量大的話可以參考 [TWSEMCPServer](https://github.com/twjackysu/TWSEMCPServer) 自行架設。

## 說明

- 資料來源：台股為證交所 MIS 公開即時報價，美股為 Yahoo Finance
- 非交易時段停止輪詢，保留最後報價。台股為台北時間平日 08:30–14:00，美股為美東時間平日 09:30–16:00（台北時間約 21:30–04:00，冬令時間 22:30–05:00）
- 只有畫面上正在看的 session 會輪詢，切到別的 session 就暫停
- 報價僅供參考，不構成投資建議

## License

MIT
