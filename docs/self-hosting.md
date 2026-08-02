# Self-hosting Recombyn

Run the full product on your own machine or server with Docker Compose (or local npm + SQLite).

## What you get

| Piece | Default |
|-------|---------|
| Web editor | http://localhost:3000 |
| API | http://localhost:8000 (`/docs`) |
| Collab (Yjs WS) | compose `collab` · browser via `ws://localhost:3000/collab/…` (prod: `wss://`) |
| Agent seeds | prompt packs + **5 core skills** from `apps/api/data/public/` |
| **MySQL 8** | compose service + volume `mysql_data` |
| Redis | Celery / queues |

Default DB URL inside compose:

`mysql://recombyn:recombyn@mysql:3306/recombyn`

Host tools can reach MySQL at `127.0.0.1:3306` (same user/password). Change via `MYSQL_PASSWORD` / `DATABASE_URL` before first boot.

**Dev without Docker MySQL:** leave `DATABASE_URL` empty → SQLite at `storage/recombyn.db`.

Default config loads from seed JSON under `apps/api/data/public/` (optional `private/` overlay) on first API start.

| Seed | Public (git) | Notes |
|------|--------------|--------|
| Prompt packs | Minimal English baseline | Enough to avoid `missing prompt pack` on Agent; replace via Admin or `data/private/design_prompt_packs_seed.json` for production quality |
| Skills (core) | 5 core playbooks | `design_methodology` / `vision_extract` / `aesthetics_align` / `canvas_edit` / `image_gen` — Agent can create & edit out of the box |
| Knowledge / tokens / models / cases | Often stub or infra-only | Full product content → `data/private/` (gitignored) |
| Canvas actions, fonts, dicts, stages | Shipped in public | |

See [data/README.md](../apps/api/data/README.md) and [design_skills/README.md](../apps/api/data/public/design_skills/README.md) (namespaces `core` / `ext` / `user`, ACL, hot reload).

## Database options

| URL | Backend |
|-----|---------|
| empty | SQLite (WAL + busy timeout + process write lock) |
| `mysql://…` | MySQL pool; optional `DATABASE_READONLY_URL` |
| `postgresql://…` | psycopg pool — **migrate schema first**; see [postgres-switch.md](./postgres-switch.md) |

Periodic backups (default on): SQLite online copy under `DB_BACKUP_DIR` (`storage/backups/`); MySQL/Postgres write a dump hint. Celery beat: `run_db_backup_job`.

LangGraph checkpoints: [postgres-switch.md](./postgres-switch.md#langgraph-checkpointer-design-agent--create_agent).

## Design skills (Agent)

- **core** — seed skills in `design_skills_seed.json`
- **ext** — file packs under `data/design_skills/<key>/` (`_meta.json` + `SKILL.md`)
- **user** — Admin API (`user.<local>` keys; cannot claim core keys)

Env: `DESIGN_SKILLS_HOT_RELOAD` (default true), `DESIGN_SKILLS_HOT_RELOAD_INTERVAL_SEC`. Manual: Admin `POST /api/v1/admin/design/skills/resync`.

## BYOK / secrets

User OpenAI-compatible endpoints (custom LLM providers) store API keys encrypted (AES-GCM). Set a dedicated `BYOK_AES_KEY` (32+ chars) in production; empty falls back to a derive-from-`CARD_KEY_SALT` path for local only.

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

### Credits & membership (self-host)

The app includes a local credits / plan wallet (default free users get a small daily quota). This is **not** a Recombyn Cloud subscription — you control it on your instance:

- Raise or remove limits in code (`FREE_DAILY_LIMIT` in `services/wallet/db.py`)
- Issue card keys (admin + `CARD_KEY_SALT` / `CARD_KEY_OPS_PASSWORD`) to top up balances
- Or patch billing gates for an unlimited private deploy

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

## Canvas multiplayer (Yjs / WSS)

Compose runs `apps/collab` and nginx proxies `/collab/` → the WS server. Browsers connect with the URL from API `COLLAB_PUBLIC_WS_URL`.

| Env | Where | Example |
|-----|--------|---------|
| `COLLAB_TOKEN_SECRET` | api + collab (same value) | long random string |
| `COLLAB_PUBLIC_WS_URL` | api | local: `ws://localhost:3000/collab` · prod: `wss://your.domain/collab` |
| `VITE_COLLAB_ENABLED` | web **build arg** | `true` to ship Live UI |

**Local compose (HTTP):** leave defaults — Live uses `ws://localhost:3000/collab`.

**Public HTTPS:** terminate TLS in front of port 3000 (Caddy / cloud LB / extra nginx). Then set:

```bash
COLLAB_TOKEN_SECRET='…strong…'
COLLAB_PUBLIC_WS_URL=wss://your.domain/collab
```

Rebuild web if you change `VITE_COLLAB_ENABLED`. Dev without Docker: `npm run dev:collab` + API `COLLAB_PUBLIC_WS_URL=ws://127.0.0.1:1234`.

## Security checklist before public deploy

1. Never commit `apps/api/.env`.
2. Replace `CARD_KEY_SALT` / `CARD_KEY_OPS_PASSWORD` placeholders.
3. Set `BYOK_AES_KEY` (dedicated AES key for user LLM vaults).
4. Override `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_BOOTSTRAP_PASSWORD` (defaults are for local bootstrap only).
5. Change `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` (and matching `DATABASE_URL`).
6. Set strong secrets for Google / SES / S3 if enabled.
7. Restrict CORS (`CORS_ORIGINS`) to your real origins.
8. Put TLS in front (Nginx / Caddy); see `deploy/nginx/`. For collab, public URL must be `wss://…` and `COLLAB_TOKEN_SECRET` must not stay the dev default.
9. Confirm DB backups (`DB_BACKUP_*`) or cloud automated backups.

## License & commercial model

This repository uses the **Recombyn Source Available License v1.0** (see root `LICENSE`).

- **Individuals / private groups**: self-host free under the license.
- **Internal org deployment**: permitted (employees / contractors of that org).
- **Hosted / managed service** of Recombyn (or a substantially similar platform) to third parties — paid or free — requires **commercial / enterprise authorization** (`702680355@qq.com`).
- Hosted **Cloud**, support/SLA, and enterprise add-ons are separate commercial offerings.

Third-party images you may run alongside (Redis, MySQL, …) keep **their own** licenses.

## Related docs

- [Root README](../README.md)
- [API README](../apps/api/README.md)
- [Architecture](./architecture.md)
- [PostgreSQL switch](./postgres-switch.md)
- [Design skills packs](../apps/api/data/public/design_skills/README.md)
