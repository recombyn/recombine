# Self-hosting Recombyn

Run the full product on your own machine or server with Docker Compose (or local npm + SQLite).

## What you get

| Piece | Default |
|-------|---------|
| Web editor | http://localhost:3000 |
| API | http://localhost:8000 (`/docs`) |
| **MySQL 8** | compose service + volume `mysql_data` |
| Redis | Celery / queues |

Default DB URL inside compose:

`mysql://recombyn:recombyn@mysql:3306/recombyn`

Host tools can reach MySQL at `127.0.0.1:3306` (same user/password). Change via `MYSQL_PASSWORD` / `DATABASE_URL` before first boot.

**Dev without Docker MySQL:** leave `DATABASE_URL` empty → SQLite at `storage/recombyn.db`.

Default config (skills, flows, dicts, …) loads from seed JSON under `apps/api/data/` on first API start. See [design_skills/README.md](../apps/api/data/design_skills/README.md) for the skills layout.

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

## Security checklist before public deploy

1. Never commit `apps/api/.env`.
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

Third-party images you may run alongside (Redis, MySQL, …) keep **their own** licenses.

## Related docs

- [Root README](../README.md)
- [API README](../apps/api/README.md)
- [Architecture](./architecture.md)
