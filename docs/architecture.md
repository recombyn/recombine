# Architecture

## Repository layout

| Path | Role |
|------|------|
| `apps/web` | React editor, home, Agent chat |
| `apps/api` | FastAPI: import, projects/plaza, Design Agent, etc. |
| `apps/docs` | User help and legal docs site |
| `packages/scene-schema` | Scene JSON protocol |
| `packages/scene-builder-py` | Parse blocks → Scene JSON |

Backend details: [apps/api/README.md](../apps/api/README.md).

## Web canvas

Mixed scenes of about **5k** nodes stay smooth for daily editing (Chromium pan median ~**17ms**); rectangle-heavy scenes can reach ~**10k**; for very heavy paths, keep roughly **1k–2k** per scene. Implemented with viewport culling + LOD, spatial-index hits, and copy-on-write history. Retest: `npm run test:stress --workspace=apps/web`.

## Backend layers

```
HTTP     api/v1/*                 thin routes
Domain   services/*               by domain (design / plaza / wallet / …)
Seeds    data/*.json              flows, dictionaries, fonts, official cases → DB
                                  (INSERT missing; do not overwrite existing)
Design   design.runtime           orchestrator → design_stream → graph
         design.prompts           Skill / prompt pack / knowledge / token
         design.ops               tool_ops contract
```

Design Agent main path:

```text
POST /api/v1/design/run
  → run_design_job → design_stream → run_agent_graph (LangGraph nodes)
```

- `runtime/host/` — product primitives (prompt assembly, placement, ops validation, resource loading)
- `runtime/graph/` — graph compile, nodes, SSE / turn / paint helpers
- `agent_controller` — compatibility re-exports; not the outer entry

Configurable content (prompt packs, Skills, dictionaries, global rules, etc.) is seeded from `apps/api/data/public/` (and optional `private/` overrides); Admin / DB is authoritative. Skill namespaces: [design_skills/README.md](../apps/api/data/public/design_skills/README.md).

Package layout, call conventions, and SSE-related interfaces: **[design-agent-runtime.md](./design-agent-runtime.md)**.

Database: SQLite / MySQL / PostgreSQL (see [postgres-switch.md](./postgres-switch.md)); SQLite defaults to WAL with optional periodic backups.

LangGraph short-lived checkpoints: [postgres-switch.md · LangGraph checkpointer](./postgres-switch.md#langgraph-checkpointer-design-agent--create_agent).

## Import data flow

```
Image -> OpenCV + OCR/layout ──> scene_builder ──> Scene JSON ──> Web
```

Async jobs: Redis + Celery (`POST /api/v1/import/jobs`, `source_type=image`).

## Deploy

Dev: `npm run dev:web` + `npm run dev:api` (+ Redis / Worker as needed)  
Prod: Docker Compose (web + api + worker + redis)
