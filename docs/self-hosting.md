# Self-hosting Recombyn

Community / OSS build: run the full product on your own machine or server.
Optional observability uses [Langfuse](https://langfuse.com) (MIT core) — do not reinvent tracing UI.

## What you get

| Piece | Default |
|-------|---------|
| Web editor | http://localhost:3000 |
| API | http://localhost:8000 (`/docs`) |
| **MySQL 8** | compose service + volume `mysql_data` (like Langfuse’s Postgres) |
| Redis | Celery / queues |
| Langfuse | optional — http://127.0.0.1:3100 |

Default DB URL inside compose:

`mysql://recombyn:recombyn@mysql:3306/recombyn`

Host tools can reach MySQL at `127.0.0.1:3306` (same user/password). Change via `MYSQL_PASSWORD` / `DATABASE_URL` before first boot.

**Dev without Docker MySQL:** leave `DATABASE_URL` empty → SQLite at `storage/recombyn.db`.

Self-host boots from seed JSON under `apps/api/data/` (skills, flows, dicts). There is **no public Admin UI** in the OSS distribution — operator tooling stays in a private internal repo.

**Skills:** community baseline only (`design_skills_seed.json` + optional `design_skills/*/`). See [design_skills/README.md](../apps/api/data/design_skills/README.md). Richer playbooks can stay private.

## Quick path (Docker)

From the repo root:

```bash
cp apps/api/.env.example apps/api/.env
# fill LLM_API_KEY (or provider keys), CARD_KEY_SALT, etc.
# leave DATABASE_URL commented out — compose injects MySQL

docker compose up -d --build
```

- Web: http://localhost:3000  
- API: http://localhost:8000  
- MySQL: `127.0.0.1:3306` / db `recombyn`

On first API start, schema + seed data are applied automatically.

Bring your own LLM keys (DeepSeek / Doubao / OpenRouter / …). Without keys, Agent features will not call models.

### Optional: local Langfuse

```bash
# see infra/langfuse/README.md (Windows + WSL notes)
cd infra/langfuse
```

Wire API (`apps/api/.env`):

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://127.0.0.1:3100
LANGFUSE_TRACING=true
LANGFUSE_PROJECT_ID=recombyn-design
```

Restart API, run an Agent task, open Langfuse → Traces (filter `metadata.task_id`).

## Dev path (SQLite, no compose MySQL)

```bash
docker compose up -d redis
cp apps/api/.env.example apps/api/.env
# DATABASE_URL empty → SQLite
npm install
npm run dev:api
npm run dev:web
```

To use compose MySQL from host uvicorn:

```bash
docker compose up -d mysql redis
# apps/api/.env:
# DATABASE_URL=mysql://recombyn:recombyn@127.0.0.1:3306/recombyn
```

## Security checklist before public deploy

1. Never commit `apps/api/.env` or Langfuse `.env`.
2. Replace `CARD_KEY_SALT` / `CARD_KEY_OPS_PASSWORD` placeholders.
3. Override `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_BOOTSTRAP_PASSWORD` (defaults are for local bootstrap only).
4. Change `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` (and matching `DATABASE_URL`).
5. Set strong secrets for Google / SES / S3 if enabled.
6. Restrict CORS (`CORS_ORIGINS`) to your real origins.
7. Put TLS in front (Nginx / Caddy); see `deploy/nginx/`.

## License & commercial model

This repository is **MIT** (see root `LICENSE`). You may self-host freely.

How we intend to sustain the project (same shape as many OSS + Cloud products):

- **Individuals / community**: self-host free; Cloud may offer a free tier later.
- **Teams / enterprises**: paid **hosted Cloud**, support/SLA, and (later) optional enterprise add-ons — not a lock on the MIT core.

Third-party stacks you may run alongside (Langfuse, Redis, MySQL image, …) keep **their own** licenses.

## Related docs

- [Root README](../README.md)
- [API README](../apps/api/README.md)
- [Langfuse local](../infra/langfuse/README.md)
- [Architecture](./architecture.md)
