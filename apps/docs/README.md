# recombyn docs site

Vite + React documentation site (user-facing help + legal + sponsor).

Hosted on **GitHub Pages**: [https://recombyn.github.io/recombyn/](https://recombyn.github.io/recombyn/)

- **Help docs**: `/guide/getting-started`, …
- **Sponsor**: `/sponsor` (voluntary support; Alipay / WeChat QR)
- **Legal**: `/legal/terms`, …
- **i18n**: `en` / `zh-CN` / `zh-TW` / `ja`

The main app opens docs via `docsUrl()` → that GitHub Pages origin (override with `VITE_DOCS_URL`).

## Local preview

```bash
# repo root
npm install
npm run dev:docs
```

Default [http://localhost:5175](http://localhost:5175). For main-app local linking:

```bash
VITE_DOCS_URL=http://localhost:5175
```

## Build

```bash
# local (base /)
npm run build:docs

# same as CI / GitHub Pages
VITE_DOCS_BASE=/recombyn/ npm run build --workspace=apps/docs
```

Output: `apps/docs/dist`.

## Deploy (GitHub Pages)

Workflow: [`.github/workflows/docs-pages.yml`](../../.github/workflows/docs-pages.yml)

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. Push changes under `apps/docs/` to `main` (or run the workflow manually)
3. Site URL: `https://recombyn.github.io/recombyn/`

## Content

Markdown under `content/{locale}/` (`guide/`, `features/`, `faq/`, `legal/`, top-level `sponsor.md`).

Chrome copy: `src/i18n/locales/`. Missing body falls back `en → zh-CN → zh-TW → ja`.

“Start creating / Home” uses `VITE_APP_URL` (default `https://recombyn.com`).
