# API

Base: `http://localhost:8000/api/v1` · Swagger: http://127.0.0.1:8000/docs

架构 / Agent：[self-hosting.md](./self-hosting.md#architecture) · 用户文档：[recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/)

| Prefix | Notes |
|--------|-------|
| `/auth` | Login / OAuth / session |
| `/projects` | Project CRUD |
| `/plaza` | Feed / submissions / likes |
| `/chat` · `/chat-sessions` | Agent chat |
| `/uploads` · `/fonts` | Uploads / fonts |
| `/image-tools` | Vision tools |
| `/shares` · `/notices` · `/users` | Shares, notices, directory |
| `/design/*` | Design Agent SSE, catalog, scene |
| `/import/*` | Image → Scene |
| `/admin/*` | Admin only |

`GET /api/v1/health` → `{ "status": "ok"|"degraded", "checks": { … } }`
