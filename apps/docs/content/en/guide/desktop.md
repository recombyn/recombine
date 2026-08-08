# Desktop app

recombyn ships a **Tauri** desktop app in two flavors:

| Flavor | Use | API |
|--------|-----|-----|
| **Local** | On-device data & models | Bundled API + SQLite on `127.0.0.1:8000` |
| **Cloud** | Desktop shell + online account | Default `https://recombyn.com` |

## Local vs Cloud

| | Local | Cloud |
|--|-------|-------|
| Login | OS user **auto-login** | Same as web |
| Projects | Local SQLite | Cloud sync |
| Platform LLM catalog | **None** | Same as web |
| Third-party models | **Required** to chat / generate | Plus+ typically |
| Plans / redeem | Usually **hidden** | Same as web |

Configure keys: [Custom & third-party models](/guide/custom-models).

## Dev & packaging commands

From the repo root (Node + `npm install`; Local release also needs Rust and Python — see `docs/desktop.md`):

```bash
npm run dev:desktop
npm run dev:desktop:cloud
npm run build:desktop:sidecar
npm run build:desktop
npm run build:desktop:cloud
```

Force rebuild sidecar then app (PowerShell):

```powershell
$env:RECOMBYN_REBUILD_SIDECAR="1"; npm run build:desktop
```

## Output paths

After a successful `build:desktop` / `build:desktop:cloud`:

| Artifact | Path |
|----------|------|
| Installers (NSIS / MSI, …) | `apps/web/src-tauri/target/release/bundle/` |
| Unpacked EXE | `apps/web/src-tauri/target/release/recombyn.exe` |
| API sidecar (staging) | `apps/web/src-tauri/sidecars/recombyn-api/recombyn-api.exe` |

Deeper engineering notes: repo `docs/desktop.md`.

## FAQ

**Request failed after switching to Local?** Re-login / let auto-login run; stale cloud JWT won’t match a fresh SQLite DB.

**Still see email OTP?** Auto-login failed — restart `dev:desktop` or clear local DB per `docs/desktop.md`.

**Sidecar build fails?** `pip install -e ".[desktop]"` in `apps/api`, then `npm run build:desktop:sidecar`.

**Port 8000 in use?** Quit other API / desktop processes.

**Want cloud billing?** Use **Cloud** desktop or the website, not Local.

## Related

- [Custom & third-party models](/guide/custom-models)
- [Account & credits](/guide/account)
- [Getting started](/guide/getting-started)
- [FAQ](/faq/)
