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
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="docs/self-hosting.md"><img src="https://img.shields.io/badge/self--host-Docker%20Compose-2496ED?logo=docker&logoColor=white" alt="Self-host" /></a>
  <a href="apps/web"><img src="https://img.shields.io/badge/web-React%20%2B%20TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="apps/api"><img src="https://img.shields.io/badge/api-FastAPI%20%2B%20Python-3776AB?logo=python&logoColor=white" alt="Python" /></a>
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/security-policy-green.svg" alt="Security" /></a>
</p>

**Recombyn** is an open-source **canvas editor + AI Design Agent**.  
Create and edit visual designs on an infinite canvas, talk to an agent that can plan and apply canvas operations, and run everything on your own machine.

Self-host in minutes with Docker Compose (MySQL + Redis + web + API). Optional [Langfuse](https://langfuse.com) for Agent tracing. Proudly built as a MIT-licensed monorepo.

---

## Why Recombyn?

| | |
|---|---|
| **Visual editor** | Frames, shapes, images, text — not just chat that dumps a single image. |
| **Agent that paints** | LangGraph design agent with tools, skills, and ask/confirm flows. |
| **Self-host first** | Same stack for local and server; your data stays yours. |
| **Composable** | Seed JSON for skills / flows / dicts — no private Admin console required to boot. |

## Core features

- **Visual editor** — selection, layers, fills, export, share
- **Design Agent** — create / edit / chat with streaming UI
- **Import pipeline** — PDF / DOCX / image → Scene JSON
- **Plaza & projects** — inspiration feed and saved work (API)
- **Observability** — optional local Langfuse traces (`metadata.task_id`)

## Quick start (self-host)

```bash
git clone <this-repo-url>
cd recombyn   # or your local folder name
cp apps/api/.env.example apps/api/.env   # add LLM_API_KEY / provider keys
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| MySQL | `127.0.0.1:3306` · `recombyn` / `recombyn` |

> Change default DB and bootstrap admin passwords before any public deploy.  
> Full guide: **[docs/self-hosting.md](docs/self-hosting.md)**

### Local development

```bash
docker compose up -d redis   # or: mysql redis
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api              # empty DATABASE_URL → SQLite
npm run dev:web
```

## Architecture (high level)

```mermaid
flowchart LR
  User[Browser] --> Web[apps/web]
  Web --> API[apps/api]
  API --> MySQL[(MySQL)]
  API --> Redis[(Redis)]
  API --> LLM[LLM providers]
  API -.-> LF[Langfuse optional]
```

## Repository layout

```
apps/web/          React canvas + Agent UI
apps/api/          FastAPI — Scene, Agent, plaza, wallet
apps/docs/         Help / legal site
packages/          Shared builders & schemas
docs/              Architecture + self-hosting
deploy/            Dockerfiles / Nginx
infra/langfuse/    Optional observability stack
e2e/               Playwright
```

Operator Admin is an **internal private console** (separate repo, **not published**). OSS self-host uses `apps/api/data/*.json` seeds only.

## Documentation

| Doc | Link |
|-----|------|
| Self-hosting | [docs/self-hosting.md](docs/self-hosting.md) |
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

[MIT](./LICENSE) © Recombyn contributors · [NOTICE](./NOTICE)

Individuals can self-host for free. We plan to offer **hosted Cloud** and enterprise support later — the MIT core stays open (same shape as many OSS + Cloud products).

---

<p align="center">
  <img src="docs/assets/recombyn-lockup-light.svg" alt="recombyn" height="40" />
</p>
