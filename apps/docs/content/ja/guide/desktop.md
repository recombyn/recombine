# デスクトップ

recombyn の **Tauri** デスクトップには 2 種類あります。

| 版 | 用途 | API |
|----|------|-----|
| **Local** | データとモデルを本機で | 同梱 API + SQLite（`127.0.0.1:8000`） |
| **Cloud** | デスクトップ UI + オンラインアカウント | 既定 `https://recombyn.com` |

## Local と Cloud

| | Local | Cloud |
|--|-------|-------|
| ログイン | OS ユーザー自動ログイン | Web と同じ |
| プラットフォームモデル | **なし** | Web と同じ |
| サードパーティ | 会話 / 生成に**必須** | 通常 Plus 以上 |
| プラン / カードキー | だいたい非表示 | Web と同じ |

Key の設定: [カスタム / サードパーティモデル](/guide/custom-models)。

## 開発・パッケージコマンド

```bash
npm run dev:desktop
npm run dev:desktop:cloud
npm run build:desktop:sidecar
npm run build:desktop
npm run build:desktop:cloud
```

## 成果物パス

| 成果物 | パス |
|--------|------|
| インストーラ | `apps/web/src-tauri/target/release/bundle/` |
| EXE | `apps/web/src-tauri/target/release/recombyn.exe` |
| API サイドカー | `apps/web/src-tauri/sidecars/recombyn-api/recombyn-api.exe` |

詳細はリポジトリの `docs/desktop.md`。

## 関連

- [カスタム / サードパーティモデル](/guide/custom-models)
- [アカウントとクレジット](/guide/account)
- [はじめに](/guide/getting-started)
- [FAQ](/faq/)
