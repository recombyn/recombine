# API

Base URL: `http://localhost:8000/api/v1`  
Full contract: Swagger at http://127.0.0.1:8000/docs

## Route overview

| Prefix | Notes |
|--------|-------|
| `/auth` | Login / OAuth / session |
| `/projects` | Project CRUD |
| `/plaza` | Plaza feed / submissions / likes |
| `/chat` · `/chat-sessions` | Agent chat and sessions |
| `/uploads` · `/fonts` | Uploads and fonts |
| `/image-tools` | Cutout and other vision tools |
| `/shares` · `/notices` · `/users` | Shares, notices, user directory |
| `/design/*` | Design Agent run (SSE), catalog, canvas-tools, scene feedback |
| `/import/*` | Image → Scene (sync or async job) |
| `/admin/*` | Admin (flows, dictionaries, models, plaza review, etc.; admin only) |

## Health

`GET /api/v1/health` → `{ "status": "ok"|"degraded", "checks": { … } }`

## Design Agent (summary)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/design/run` | SSE: auth → LangGraph agent (event stream) |
| POST | `/design/run/{taskId}/scene` | FE returns live canvas inventory (observe interrupt) |
| POST | `/design/run/{taskId}/pause` | Durable pause intent |
| POST | `/design/run/{taskId}/cancel` | Cancel + optional refund |
| POST | `/design/run/{taskId}/resume` | SSE resume from checkpoint |
| GET | `/design/catalog` | Public catalog |
| GET | `/design/canvas-tools` | Canvas op capability table |

Call chain, **LC/LG stack**, lifecycle / HITL: [design-agent-runtime.md](./design-agent-runtime.md).

## Import (summary)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/import/image` | Upload image |
| POST | `/import/jobs` | Async import job (`source_type=image`) |
| GET | `/import/jobs/{id}` | Job status |

Import pipeline details: [import-pipeline.md](./import-pipeline.md).
