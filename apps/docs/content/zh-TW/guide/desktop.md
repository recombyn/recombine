# 桌面端

recombyn 提供 **Tauri** 桌面應用，有兩種口味：

| 版本 | 用途 | API |
|------|------|-----|
| **Local（本地版）** | 資料與模型都在本機 | 內嵌 API（SQLite），本機 `127.0.0.1:8000` |
| **Cloud（雲端版）** | 桌面殼 + 線上帳號 | 預設 `https://recombyn.com` |

## 本地版 vs 雲端版

| | 本地版 | 雲端版 |
|--|--------|--------|
| 登入 | 系統使用者**自動登入** | 與網頁相同 |
| 專案資料 | 本機 SQLite | 雲端同步 |
| 平台模型目錄 | **不提供** | 與網頁一致 |
| 第三方模型 | **必配**才能對話 / 出圖 | 標準檔及以上可配 |
| 方案 / 卡密 | 介面通常**隱藏** | 與網頁一致 |

設定第三方模型見 [自訂與第三方模型](/guide/custom-models)。

## 開發與打包（指令）

```bash
npm run dev:desktop
npm run dev:desktop:cloud
npm run build:desktop:sidecar
npm run build:desktop
npm run build:desktop:cloud
```

## 打包產物路徑

| 產物 | 路徑 |
|------|------|
| 安裝包（NSIS / MSI 等） | `apps/web/src-tauri/target/release/bundle/` |
| 未打包主程式 | `apps/web/src-tauri/target/release/recombyn.exe` |
| API 邊車（建置暫存） | `apps/web/src-tauri/sidecars/recombyn-api/recombyn-api.exe` |

更細的工程說明見倉庫 `docs/desktop.md`。

## 相關文件

- [自訂與第三方模型](/guide/custom-models)
- [帳戶與積分](/guide/account)
- [快速入門](/guide/getting-started)
- [常見問題](/faq/)
