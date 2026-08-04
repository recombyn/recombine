<p align="center">
  <img src="docs/assets/readme-hero.png" alt="Recombyn — open source canvas + AI design agent" width="100%" />
</p>

<p align="center">
  <a href="docs/self-hosting.md"><strong>Self Host</strong></a> ·
  <a href="https://recombyn.com"><strong>Cloud</strong></a> ·
  <a href="apps/docs"><strong>Docs</strong></a>
</p>

<p align="center">
  <a href="#readme">English</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Source--Available-orange.svg" alt="Recombyn Source Available License" /></a>
  <a href="docs/self-hosting.md"><img src="https://img.shields.io/badge/self--host-Docker%20Compose-2496ED?logo=docker&logoColor=white" alt="Self-host" /></a>
  <a href="apps/web"><img src="https://img.shields.io/badge/web-React%20%2B%20TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="apps/api"><img src="https://img.shields.io/badge/api-FastAPI%20%2B%20Python-3776AB?logo=python&logoColor=white" alt="Python" /></a>
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/security-policy-green.svg" alt="Security" /></a>
</p>

**Recombyn** is a **canvas editor + AI Design Agent** (source-available).  
Design on an infinite canvas; a LangGraph agent edits layers, shapes, text, and layout through conversation.

Self-host in minutes with Docker Compose (default **MySQL** + Redis + web + API + **Yjs collab**). Local dev can use **SQLite** (empty `DATABASE_URL`), or **PostgreSQL** — see [docs/postgres-switch.md](docs/postgres-switch.md).

---

## Why Recombyn?

- **Real canvas editing** — Frames, shapes, images, video, text; export and share
- **Live multiplayer** — Yjs sync for the same project (cursors, selection, undo); share view-only or edit
- **Agent that paints** — Conversation plans and applies canvas ops
- **Self-host first** — Same stack locally or on a server
- **Composable** — Infra seeds + prompt packs + **5 core Agent skills** under `apps/api/data/public/`

## Core features

- **Visual editor** — selection, layers, fills, export, share
- **Realtime collab** — Yjs WebSocket room (`apps/collab`); Live bar in the editor; WSS via nginx `/collab/`
- **Design Agent** — LangGraph tools / skills; create, edit, and chat with streaming UI
- **Image import** — local images → editable canvas nodes
- **Plaza & projects** — inspiration feed and saved work (API)

## Quick start (self-host)

```bash
git clone https://github.com/recombyn/recombine.git
cd recombine
cp apps/api/.env.example apps/api/.env   # add LLM_API_KEY / provider keys
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| MySQL | `127.0.0.1:3306` · `recombyn` / `recombyn` |

More options (env, LLM keys, production hardening): **[docs/self-hosting.md](docs/self-hosting.md)** · Postgres: **[docs/postgres-switch.md](docs/postgres-switch.md)**

### Local development

```bash
docker compose up -d redis   # or: mysql redis
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api              # empty DATABASE_URL → SQLite
npm run dev:collab           # Yjs WS on :1234 (optional; Vite DEV defaults collab on)
npm run dev:web
```

Canvas Live / WSS setup: **[docs/self-hosting.md § Canvas multiplayer](docs/self-hosting.md#canvas-multiplayer-yjs--wss)** · [apps/collab/README.md](apps/collab/README.md)

## Repository layout

```
apps/web/          React canvas + Agent UI + Yjs client
apps/api/          FastAPI — Scene, Agent, plaza, wallet, collab tokens
apps/collab/       Yjs WebSocket server (y-websocket)
apps/docs/         Help / legal site
packages/          Shared builders & schemas
docs/              Architecture + self-hosting
deploy/            Dockerfiles / Nginx
e2e/               Playwright
```

## Documentation

| Doc | Link |
|-----|------|
| Self-hosting | [docs/self-hosting.md](docs/self-hosting.md) |
| PostgreSQL switch | [docs/postgres-switch.md](docs/postgres-switch.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Security | [SECURITY.md](SECURITY.md) |
| Code of Conduct | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Maintainer OSS checklist | [docs/open-source-checklist.md](docs/open-source-checklist.md) |

## Community

- **Issues** — bug & feature templates under `.github/ISSUE_TEMPLATE/`
- **PRs** — see [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security** — report privately per [SECURITY.md](SECURITY.md)

## License & model

[Recombyn Source Available License v1.0](./LICENSE) © Recombyn contributors · [NOTICE](./NOTICE)

Source-available terms (not OSI open source):

- **Personal / private self-host** — free
- **Internal org use** — permitted
- **Hosted / managed service** of Recombyn to third parties (paid or free) — **requires commercial authorization** (`702680355@qq.com`)

See [LICENSE](./LICENSE) for the full text.

## Star us on GitHub ⭐

Open source takes time. If Recombyn helps your work, please hit **⭐ Star** in the top-right of the GitHub repo — your support is the best fuel for making it better.

→ [https://github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)
