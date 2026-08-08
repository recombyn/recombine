# Architecture

## Repository layout

| Path | Role |
|------|------|
| `apps/web` | React editor, home, Agent chat, Yjs collab client |
| `apps/web/src-tauri` | Tauri v2 desktop shell (same UI; custom titlebar) |
| `apps/api` | FastAPI: import, projects/plaza, Design Agent, collab room tokens |
| `apps/collab` | Yjs WebSocket server (`y-websocket`); proxied as `/collab/` |
| `packages/scene-schema` | Scene JSON protocol |
| `packages/scene-builder-py` | Parse blocks → Scene JSON |

Backend details: [apps/api/README.md](../apps/api/README.md). Collab: [apps/collab/README.md](../apps/collab/README.md) · [self-hosting § multiplayer](./self-hosting.md#canvas-multiplayer-yjs--wss). Desktop: [desktop.md](./desktop.md).

## Web canvas

Mixed scenes of about **5k** nodes stay smooth for daily editing (Chromium pan median ~**17ms**); rectangle-heavy scenes can reach ~**10k**; for very heavy paths, keep roughly **1k–2k** per scene. Implemented with viewport culling + LOD, spatial-index hits, and copy-on-write history. Retest: `npm run test:stress --workspace=apps/web`.

**Stroke outline:** `outlineToPath` converts stroked open paths (line / pen / pencil / arrow) into filled editable paths. Single-subpath strokes use geometric offset (`outlinePolylineStroke`); multi-subpath strokes (e.g. arrows) rasterize one paint-accurate silhouette. Defaults: line and pen use butt/miter; pencil and arrow use round/round. Pencil centerlines are RDP-sparsified before offset. Module: `apps/web/src/components/rcb/scene/paint/outlineToPath.ts`.

**Realtime collab:** when enabled, the live scene truth is a Y.Doc (synced over WS); Redux is the UI projection. Room tokens from `POST /api/v1/collab/room-token`; view-only peers cannot seed or persist.

## Backend layers

```
HTTP     app/api/routes/*         thin routes (+ app/api/deps.py)
Domain   app/services/*           by domain (design / plaza / wallet / …)
Data     app/models.py + crud.py  SQLModel Session reads/writes
DDL      app/services/db          init_schema / ensure_* (legacy connect)
Seeds    data/*.json              flows, dictionaries, fonts → DB
                                  (INSERT missing; do not overwrite existing)
Design   app.services.design.runtime   orchestrator → design_stream → graph
         app.services.design.prompts   Skill / prompt pack / knowledge / token
         app.services.design.ops       tool_ops contract
```

Layout: [api-backend-refactor.md](./api-backend-refactor.md). Runtime: [design-agent-runtime.md](./design-agent-runtime.md).

Design Agent main path:

```text
POST /api/v1/design/run
  → run_design_job → design_stream → run_agent_graph
      # LangGraph outer StateGraph + LangChain inside nodes
```

- `app/api/` — FastAPI deps + routes (official layout)
- `app/core/config.py` · `app/core/db.py` — settings + SQLModel engine
- `app/services/` — domain (Design Agent, plaza, wallet, …)
- Package layout: **[api-backend-refactor.md](./api-backend-refactor.md)** · runtime: **[design-agent-runtime.md](./design-agent-runtime.md)**.

Database: SQLite / MySQL / PostgreSQL (see [postgres-switch.md](./postgres-switch.md)); SQLite defaults to WAL with optional periodic backups.

LangGraph short-lived checkpoints: [postgres-switch.md · LangGraph checkpointer](./postgres-switch.md#langgraph-checkpointer-design-agent--create_agent).

## Import data flow

```
Image -> OpenCV + OCR/layout ──> scene_builder ──> Scene JSON ──> Web
```

Async jobs: Redis + Celery (`POST /api/v1/import/jobs`, `source_type=image`; requires Bearer).

Auth status codes: [api-backend-refactor.md](./api-backend-refactor.md) — missing Bearer → 401; bad token → 403. `/import/*` requires login.

## Desktop shell

Tauri 2 (`devUrl` / `frontendDist`):

- **Local** — FastAPI + SQLite sidecar (`VITE_DESKTOP_MODE=local`)
- **Cloud** — remote API (`VITE_DESKTOP_MODE=cloud` + `VITE_API_BASE_URL`)

Custom titlebar via `useIsDesktopShell()`; API host via `apiBase.ts`; external URLs via `plugin-opener`. Details: [desktop.md](./desktop.md).

## Deploy

Dev: `npm run dev:web` + `npm run dev:api` + `npm run dev:collab` (+ Redis / Worker as needed)  
Desktop: `npm run dev:desktop` / `dev:desktop:cloud` / `build:desktop` / `build:desktop:cloud` (see [desktop.md](./desktop.md))  
Prod: Docker Compose (web + api + worker + redis + **collab**); public HTTPS needs `wss://` and shared `COLLAB_TOKEN_SECRET`
