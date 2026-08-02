# recombyn docs site

Vite + React documentation site.

- **Help docs**: light shell (top bar / sidebar / breadcrumbs), e.g. `/guide/getting-started`
- **Legal pages**: standalone dark reading pages, e.g. `/legal/terms` (not nested in the help chrome)
- **i18n**: top-bar language switch for `en` / `zh-CN` / `zh-TW` / `ja`; shares the main app localStorage key `language`. Default / fallback locale is **English**.

## Local preview

```bash
# repo root
npm install
npm run dev:docs
```

Default [http://localhost:5175](http://localhost:5175). For main-app local linking, set in `apps/web`:

```bash
VITE_DOCS_URL=http://localhost:5175
```

## Build

```bash
npm run build:docs
```

Output: `apps/docs/dist`.

## Content

Markdown is split by locale under `content/{locale}/`:

| Path | Content |
|------|---------|
| `content/en/` | English (default) |
| `content/zh-CN/` | Simplified Chinese |
| `content/zh-TW/` | Traditional Chinese |
| `content/ja/` | Japanese |

Each locale mirrors the same structure: `guide/`, `features/`, `faq/`, `legal/`.

Chrome copy lives in `src/i18n/locales/`. Missing body for a locale falls back `en → zh-CN → zh-TW → ja`.

“Start creating / Home” links use `VITE_APP_URL` (default `https://recombyn.com`).
