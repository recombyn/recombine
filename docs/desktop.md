# Desktop app (Tauri v2)

Recombyn’s desktop shell wraps the same React app in [`apps/web`](../apps/web) with **Tauri 2**. There is no separate frontend — the window loads Vite (`devUrl`) or the production `dist` build.

| Item | Value |
|------|--------|
| Product name | Recombyn |
| Bundle id | `com.recombyn.app` |
| Shell | `apps/web/src-tauri/` |
| Dev URL | `http://localhost:3000` (same as web) |
| API | Vite proxy → `127.0.0.1:8000` (run `npm run dev:api` as needed) |

## Prerequisites

1. **Node.js** + repo `npm install` (workspace root).
2. **Rust** via [rustup](https://rustup.rs) — `cargo` on `PATH` (or under `~/.cargo/bin`; `scripts/dev-desktop.mjs` prepends that on Windows).
3. **Platform toolchain**
   - **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++** (MSVC). WebView2 is usually already present on Win10/11.
   - **macOS:** Xcode Command Line Tools.
   - **Linux:** see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

Optional for full product behavior while developing: `npm run dev:api`, Redis / `npm run dev:collab` (same as web).

## Commands

From the **repo root**:

```bash
npm run dev:desktop      # tauri dev + Vite on :3000
npm run build:desktop    # production web build + native installers
```

Equivalents under `apps/web`:

```bash
npm run tauri:dev
npm run tauri:build
```

`dev:desktop` / `build:desktop` call [`scripts/dev-desktop.mjs`](../scripts/dev-desktop.mjs), which ensures `cargo` is discoverable before invoking the workspace scripts.

## Architecture notes

```
AppShell
  └─ DesktopTitlebar   # only when running in Tauri (decorations: false)
  └─ Outlet            # same routes as the browser app
```

- **Custom titlebar** — native decorations are off (`decorations: false` in `tauri.conf.json`). UI chrome uses `--rail` so light/dark match the home sidebar. Height: `DESKTOP_TITLEBAR_H` in `DesktopTitlebar.tsx`.
- **Detection** — `useIsDesktopShell()` / `__TAURI_INTERNALS__` / `import.meta.env.TAURI_ENV_PLATFORM`.
- **Navigation** — Prefer same-window `navigate` inside Tauri; `window.open(..., '_blank')` does not open a useful window in WebView. Home → editor boot uses `goEditor` / `homeAgentBoot` desktop paths.
- **External links** — Help / docs / mailto go through `openExternalUrl()` (`docsUrl.ts`) + `@tauri-apps/plugin-opener` so the **system browser** opens. Desktop prefers `https://docs.recombyn.com` when a local docs server is not the target.
- **Theme** — `applyTheme` also calls Tauri `setTheme` so the shell follows the app theme.
- **Narrow windows** — Titlebar keeps the brand mark; content-area mobile brand / rail logo are suppressed so they do not duplicate the chrome.

Vite (`apps/web/vite.config.ts`) sets `clearScreen: false`, `strictPort`, and ignores `src-tauri` for watch — required for `tauri dev`.

## Icons

Regenerate from the mark:

```bash
cd apps/web
npx tauri icon public/logo-mark.png
```

Outputs land under `apps/web/src-tauri/icons/`.

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| `cargo` not found | Install rustup; reopen the terminal; or use `npm run dev:desktop` (PATH fix). |
| Windows link / compile errors | Open a “x64 Native Tools” / Developer Prompt, or run after `vcvars64.bat`. Ensure MSVC Build Tools are installed. |
| Port 3000 already in use | Stop the other Vite / previous `tauri:dev`; avoid two `beforeDevCommand` instances. |
| `failed to remove … recombyn.exe` (Windows) | Quit every Recombyn window / kill `recombyn.exe`, then retry. |
| Clicks / “open in new tab” do nothing | Must use desktop navigation / `openExternalUrl` — not raw `window.open`. |
| Titlebar / theme looks wrong after config change | Fully quit and restart `dev:desktop` (`decorations` and native config are not hot-reloaded). |
| API / fonts 404 or proxy errors | Start `npm run dev:api` (and Redis if you need queues). |

## Related

- Web local setup: [README.md](../README.md) · [self-hosting.md](./self-hosting.md)
- Layout shell: `apps/web/src/components/layout/AppShell.tsx`, `DesktopTitlebar.tsx`
- Tauri config: `apps/web/src-tauri/tauri.conf.json`
