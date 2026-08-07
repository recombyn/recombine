# Self-hosting Recombyn

Run the full product on your own machine or server with Docker Compose (or local npm + SQLite).

For the **native desktop window** (Tauri) wrapping the same web UI, see **[desktop.md](./desktop.md)** — that path still talks to this API stack locally or remotely.

## What you get

| Piece | Default |
|-------|---------|
| Web editor | http://localhost:3000 |
| API | http://localhost:8000 (`/docs`) |
| Collab (Yjs WS) | compose `collab` · browser via `ws://localhost:3000/collab/…` (prod: `wss://`) |
| Agent seeds | prompt packs + **5 core skills** from `apps/api/data/` |
| **MySQL 8** | compose service + volume `mysql_data` |
| Redis | Celery / queues |

Default DB URL inside compose:

`mysql://recombyn:recombyn@mysql:3306/recombyn`

Host tools can reach MySQL at `127.0.0.1:3306` (same user/password). Change via `MYSQL_PASSWORD` / `DATABASE_URL` before first boot.

**Dev without Docker MySQL:** leave `DATABASE_URL` empty → SQLite at `storage/recombyn.db`.

Default config loads from seed JSON under `apps/api/data/` on first API start.

| Seed | Shipped in `apps/api/data/` | Notes |
|------|------------------------------|--------|
| Prompt packs | Full product set (~95 kinds) in `data/design_prompt_packs/` | Ask / paint / decide / aesthetics — `_index.json` + per-kind `.md` |
| Skills (core) | 5 core playbooks | `design_methodology` / `vision_extract` / `aesthetics_align` / `canvas_edit` / `image_gen` |
| Skills (ext) | Optional packs + repo `.agents/skills/` | e.g. `ui_ux_pro_max`, `garden_style` — add more via Admin / zip / folders |
| Knowledge / tokens / models | Shipped | Expand further via Admin after install |
| Canvas actions, fonts, dicts, stages | Shipped | |
| Aesthetics corpus | **Not** in seed | Upload quality samples in Admin for CLIP RAG; thin corpus → fail-open |

See [data/README.md](../apps/api/data/README.md) and [design_skills/README.md](../apps/api/data/design_skills/README.md) (namespaces `core` / `ext` / `user`, ACL, hot reload).

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

### First login (no mail provider)

Self-host only (`AUTH_CONSOLE_LOGIN_CODE=true`, set by default in `docker-compose.yml`).  
When SES is unset, email login prints the OTP to API logs — **do not enable this on Cloud / public production**.

1. Open the web UI → sign in with any email you control.
2. Request a code — the UI says to check API logs.
3. Read `LOGIN CODE (AUTH_CONSOLE_LOGIN_CODE) … code=######` in the API container / `npm run dev:api` terminal.
4. Enter that 6-digit code in the UI.

Dev without compose: set `AUTH_CONSOLE_LOGIN_CODE=true` in `apps/api/.env`.  
Configure SES (`TENCENT_SECRET_*`, `SES_FROM_EMAIL`, `SES_TEMPLATE_ID`, …) for real email. Google OAuth is optional (`GOOGLE_CLIENT_ID`).

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

**Public HTTPS:** terminate TLS in front of port 3000 (Caddy / cloud LB). Example: [deploy/caddy/Caddyfile.example](../deploy/caddy/Caddyfile.example). Then set:

```bash
COLLAB_TOKEN_SECRET='…strong…'
COLLAB_PUBLIC_WS_URL=wss://your.domain/collab
```

Rebuild web if you change `VITE_COLLAB_ENABLED`. Dev without Docker: `npm run dev:collab` + API `COLLAB_PUBLIC_WS_URL=ws://127.0.0.1:1234`.

## Public HTTPS (Caddy)

Compose web listens on `:3000` (nginx already proxies `/api/` and `/collab/`).  
For a public host, terminate TLS in front — example: [deploy/caddy/Caddyfile.example](../deploy/caddy/Caddyfile.example).

```bash
# after compose is up, and DNS points here:
export COLLAB_TOKEN_SECRET='…strong…'
export COLLAB_PUBLIC_WS_URL=wss://your.domain/collab
docker compose up -d  # recreate api/collab with the new env
caddy run --config deploy/caddy/Caddyfile.example
```

## Public host checklist

Do this **before** exposing port 3000 / 8000 to the internet:

1. Never commit `apps/api/.env`.
2. Replace `CARD_KEY_SALT` / `CARD_KEY_OPS_PASSWORD` placeholders.
3. Set `BYOK_AES_KEY` (dedicated AES key for user LLM vaults).
4. Override `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_BOOTSTRAP_PASSWORD` (defaults are for local bootstrap only).
5. Change `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` (and matching `DATABASE_URL`).
6. Set a long random `COLLAB_TOKEN_SECRET` (same value for api + collab).
7. Set `COLLAB_PUBLIC_WS_URL=wss://your.domain/collab` (not `ws://`).
8. Restrict CORS (`CORS_ORIGINS`) to your real origins.
9. Confirm Redis/MySQL are host-only (`127.0.0.1:…` in compose — do not publish them publicly).
10. Confirm DB backups (`DB_BACKUP_*`) or cloud automated backups.
11. Set `AUTH_CONSOLE_LOGIN_CODE=false` (or unset) once SES/Google auth is configured — never leave log OTPs on a public host.

API startup logs **warnings** if admin password, collab secret, default MySQL password, card salt, or BYOK key look like local defaults.

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
- [Design skills packs](../apps/api/data/design_skills/README.md)
