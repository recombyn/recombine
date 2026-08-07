# Desktop (Tauri v2)

| | Command | API | Product id |
|--|---------|-----|------------|
| **Local** | `npm run dev:desktop` / `build:desktop` | Bundled API sidecar + SQLite (app data) | `com.recombyn.app` · Recombyn |
| **Cloud** | `npm run dev:desktop:cloud` / `build:desktop:cloud` | `VITE_API_BASE_URL` (default `https://recombyn.com`) | `com.recombyn.app.cloud` · Recombyn Cloud |

## Local data & login

UI still calls `/api/v1/...` on **`127.0.0.1:8000`**. Projects, skills, uploads, wallet live in app-data SQLite + `storage/uploads`.

**Login:** Local desktop auto-signs in as the OS user (`DESKTOP_LOCAL_AUTO_LOGIN`, loopback-only `POST /auth/desktop-local`). No email OTP. Cloud desktop / browser still use normal login.

**Billing UI:** Local flavor hides plans / redeem / upgrade (no cloud account switch in-app — use the Cloud desktop build for that).

**Models:** Local does **not** expose the platform LLM catalog (no Seedream / OpenRouter entries for end users). Add your own OpenAI-compatible providers + API keys under Agent settings (BYOK). Wallet holds are skipped.

## Prerequisites

1. **Node.js** + repo `npm install`
2. **Rust** ([rustup](https://rustup.rs)) + platform C++/WebView toolchain
3. **Local flavor**
   - **Dev:** `apps/api` Python venv (`pip install -e ".[dev]"`)
   - **Release EXE:** PyInstaller sidecar (`pip install -e ".[desktop]"` or the build script installs `pyinstaller`)

## Commands

```bash
# Dev local — live Python API on :8000 + Tauri window
npm run dev:desktop

# Build API sidecar only (PyInstaller onedir → src-tauri/sidecars/recombyn-api/)
npm run build:desktop:sidecar

# Release local installer (builds sidecar if missing, embeds it as Tauri resources)
npm run build:desktop

# Force rebuild sidecar then app:
# RECOMBYN_REBUILD_SIDECAR=1 npm run build:desktop

# Cloud desktop (no sidecar)
npm run dev:desktop:cloud
npm run build:desktop:cloud
```

### Output paths (after `build:desktop`)

| What | Path |
|------|------|
| Installers (NSIS / MSI 等) | `apps/web/src-tauri/target/release/bundle/` |
| Unpacked main EXE | `apps/web/src-tauri/target/release/recombyn.exe` |
| API sidecar (build staging) | `apps/web/src-tauri/sidecars/recombyn-api/recombyn-api.exe` |

Cloud build uses the same `bundle/` tree; product name is **Recombyn Cloud**.

## Architecture

```
Local release
  Recombyn.exe
    → spawns resources/recombyn-api/recombyn-api.exe  (PyInstaller onedir)
    → SQLite + uploads under app data dir

Local dev
  npm run dev:desktop
    → ensure-desktop-api.mjs (uvicorn from apps/api/.venv)
    → Tauri loads Vite :3000 (proxy /api → :8000)

Cloud desktop
  UI only → VITE_API_BASE_URL
```

- **Sidecar entry:** `apps/api/scripts/desktop_sidecar_main.py`
- **Stage script:** `scripts/build-desktop-sidecar.mjs`
- **Tauri resources (local build):** `src-tauri/tauri.local.conf.json`
- **Spawn logic:** `src-tauri/src/local_api.rs` (bundled exe first, Python fallback)
- **API URL helper:** `apps/web/src/utils/apiBase.ts`

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Skills / projects “Request failed” | Re-login — old cloud JWT won’t match a fresh local SQLite DB |
| Still shows email/OTP login | Auto-login failed — often stale SQLite schema; pull latest, restart `dev:desktop`, or delete `apps/api/storage/recombyn.db` |
| Sidecar build fails | `cd apps/api && .venv\Scripts\activate && pip install -e ".[desktop]"` |
| Release app won’t start API | Confirm `sidecars/recombyn-api/recombyn-api.exe` exists before/after build |
| Port 8000 in use | Quit other API / previous desktop; `ensure-desktop-api` refuses a listener without working auto-login |
| Want cloud MySQL in desktop | Use **cloud** flavor, not local |

## Related

- [self-hosting.md](./self-hosting.md) · [architecture.md](./architecture.md)
- `scripts/dev-desktop.mjs` · `scripts/ensure-desktop-api.mjs`
