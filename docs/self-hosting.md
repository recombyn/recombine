# Self-hosting Recombyn

Run the full product on your own machine or server with Docker Compose (or local npm + SQLite).

Desktop (Tauri): **[desktop.md](./desktop.md)** — **Local** (sidecar + SQLite) / **Cloud** (hosted API).

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
| Prompt packs | `design_prompt_packs/` (`_index.json` + `*.md`) | `type=system` ≈25 stage protocols; `type=template` ≈70 inject lines |
| Skills (core) | 5 playbooks in `design_skills_seed.json` | `design_methodology` / `vision_extract` / `aesthetics_align` / `canvas_edit` / `image_gen` |
| Skills (ext) | `design_skills/<key>/` + repo `.agents/skills/` | e.g. `brush_ops`, `motion_lottie`, `ui_ux_pro_max` — also Admin zip / folders |
| Knowledge / tokens / models | Shipped | Expand further via Admin after install |
| Canvas actions, fonts, dicts, stages | Shipped | |
| Aesthetics corpus | **Not** in seed | Upload quality samples in Admin for CLIP RAG; thin corpus → fail-open |

Layout of files under `apps/api/data/`: [data/README.md](../apps/api/data/README.md) (file map only).

## Architecture

### Repository

| Path | Role |
|------|------|
| `apps/web` | React editor, home, Agent chat, Yjs collab client |
| `apps/web/src-tauri` | Tauri v2 desktop shell |
| `apps/api` | FastAPI: import, projects/plaza, Design Agent, collab tokens |
| `apps/collab` | Yjs WebSocket (`/collab/`) |
| `packages/scene-schema` · `packages/scene-builder-py` | Scene JSON protocol / builders |

Desktop flavors: [desktop.md](./desktop.md). Postgres switch: [postgres-switch.md](./postgres-switch.md).

### API layers

```text
HTTP     app/api/routes/* + deps.py
Domain   app/services/*          (design / plaza / wallet / …)
Data     models.py + crud.py     SQLModel Session
DDL      app/services/db         init_schema / ensure_*
Seeds    apps/api/data/**        INSERT missing on boot (do not overwrite Admin rows)
Design   services.design.runtime → design_stream → LangGraph
         services.design.prompts → Skill / prompt pack / knowledge
         services.design.ops     → tool_ops contract
```

```text
apps/api/app/
  main.py · api/ · core/ · models.py · crud.py · services/ · schemas/
  worker/   # Celery
```

| Auth case | Status |
|-----------|--------|
| Missing Bearer | **401** |
| Bad / revoked token | **403** |
| Not admin | **403** |

URL prefix: `/api/v1`. `/import/*` requires login.

### Design Agent — call chain

```text
POST /api/v1/design/run
  → orchestrator.run_design_job          # auth, hold, BYOK, rules
      → design_run.design_stream
          → graph.build.run_agent_graph  # LangGraph driver
              → bootstrap
                   ├─ apply_ops? → apply_confirm → observe → settle
                   └─ memory → intent → decide → paint_ops
                        ├─ Ask + ops → propose → settle    # Confirm = new run
                        └─ Agent → action → observe → settle
                             └─ critique fail → paint_ops (retry)
```

| HTTP | Role |
|------|------|
| `POST /design/run` | SSE main run |
| `POST /design/run/{taskId}/scene` | FE scene → resume interrupt |
| `POST …/pause` · `/cancel` · `/resume` | Durable lifecycle |
| `GET /design/catalog` · `/canvas-tools` | Catalogs |

### LC / LG stack (LangChain + LangGraph)

Two layers — do not mix product routing with model I/O:

| Layer | Library | Owns |
|-------|---------|------|
| **Outer graph** | **LangGraph** `StateGraph` | Node order, `Command(goto=…)`, checkpointer, `interrupt` / resume, run lease |
| **Inside nodes** | **LangChain** (+ optional `create_agent`) | Chat I/O, structured output, tool schemas |
| **Host** | `runtime/host/` | Assemble packs, validate ops, placement, lazy `need_*` |

```text
  HTTP / SSE     orchestrator → design_stream → run_agent_graph
                         │ astream + interrupt bridge
                         ▼
               LangGraph outer graph (checkpointer)
               bootstrap → … → paint → observe → settle
                         │ per-node
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   host.prompts/ops   LangChain LLM   scene_feedback
   (packs, validate)  (+ structured)  + interrupt()
```

Outer graph (dynamic `Command(goto=…)`):

```text
START → bootstrap
          ├─ apply_ops? → apply_confirm → observe → settle
          └─ memory → intent_classify → design_agent (decide)
                           ├─ chat / clarify only → settle
                           └─ needs paint → paint_ops
                                  ├─ Ask → propose → settle
                                  └─ Agent → action → observe
                                         ├─ critique fail → paint_ops
                                         └─ ok → settle → END
```

| Node | Role |
|------|------|
| `design_agent` | Decide: reply / `need_*` — **no** canvas ops |
| `paint_ops` | Structured `tool_ops` only |
| `observe` | Wait FE scene (`interrupt`); critique |
| `propose` | Ask preview → Confirm as **new** run |

Inside a node: assemble pack → LangChain stream/structured → validate ops → `Command(update, goto)`.  
`create_agent` is an **inner** helper; durable pause/resume is always the **outer** graph + checkpointer.

Lifecycle: `queued → running ⇄ waiting_client → success` (also `paused` / `error` / `cancelled`).  
Checkpointer: `thread_id = design:{task_id}` — prod refuses memory; see [postgres-switch.md](./postgres-switch.md#langgraph-checkpointer-design-agent--create_agent).

### Package map (design)

| Path | Role |
|------|------|
| `runtime/orchestrator.py` | Gate + `design_stream` |
| `runtime/graph/build.py` | StateGraph + lease + interrupt driver |
| `runtime/graph/nodes/` | bootstrap / decide / paint / observe / … |
| `runtime/host/` | prompts, placement, ops_gate, resources |
| `prompts/prompt_pack_store.py` · `skill_store/` | Packs + skills |
| `ops/tool_ops_contract.py` | Canvas tool registry |

Env knobs: `DESIGN_GRAPH_REQUIRE_DURABLE_CHECKPOINT`, `DESIGN_RUN_LEASE_TTL_SEC`, `DESIGN_CRITIQUE_*`, `DESIGN_AESTHETICS_*`.

## Database options

| URL | Backend |
|-----|---------|
| empty | SQLite (WAL + busy timeout + process write lock) |
| `mysql://…` | MySQL pool; optional `DATABASE_READONLY_URL` |
| `postgresql://…` | psycopg pool — **migrate schema first**; see [postgres-switch.md](./postgres-switch.md) |

Periodic backups (default on): SQLite online copy under `DB_BACKUP_DIR` (`storage/backups/`); MySQL/Postgres write a dump hint. Celery beat: `run_db_backup_job`.

LangGraph checkpoints: [postgres-switch.md](./postgres-switch.md#langgraph-checkpointer-design-agent--create_agent).

## Agent content: skills & prompt packs

**One line:** Prompt packs = engine **protocol**; Skills = job **playbooks**. Same rule in one place — packs **route**, skills **teach**.

LC/LG call chain: [Architecture · Design Agent](#design-agent--call-chain) above.

```text
User turn
  → Decide (react_system + need_tools_overlay)
      · intent / need_skills / need_tools — no long craft text
  → Lazy-load Skill bodies (SKILL_DETAILS)
  → Paint (paint_system)
      · tool_ops + FOCUS / size; craft from loaded skills only
```

| Layer | Owns | Does not own |
|-------|------|----------------|
| `type=system` packs | JSON contract, Ask/Agent gates, FOCUS/size, when to `need_*` | Poster layout, brush args, Lottie playbook |
| `type=template` packs | One-line inject strings (headers, empty states) | “How to use” / `format_*` / code-path notes |
| Skills | How a class of work is done | Stage JSON / HITL `choice_ui` |
| Knowledge | Numeric / encyclopedia detail | Execution protocol |

### Skills namespaces

| Namespace | Source | Notes |
|-----------|--------|--------|
| `core` | `design_skills_seed.json` | Bare keys (`design_methodology`); aliases `core.<key>` |
| `ext` | `data/design_skills/<key>/` (`_meta.json` + `SKILL.md`) | e.g. `brush_ops`, `motion_lottie`; also `.agents/skills/` encyclopedias |
| `user` | Admin API | Always `user.<local>`; cannot claim core keys |

Env: `DESIGN_SKILLS_HOT_RELOAD` (default true), `DESIGN_SKILLS_HOT_RELOAD_INTERVAL_SEC`. Manual: Admin `POST /api/v1/admin/design/skills/resync`.

Pack layout: `data/design_skills/<key>/_meta.json` + `SKILL.md` (copy `example_ext/` to add one).

### Prompt packs

- Seed: `data/design_prompt_packs/_index.json` + `<kind>.md` (filename = `kind`).
- `when_to_use` on **skills** → model catalog; on **templates** → Admin short label only (`注入模板 · …`).
- API start syncs seed `type` + `when_to_use` into DB; **body** / `used_by` stay Admin-owned after first insert (paint_system has a marker bump for stale OSS bodies).

### Where to edit

| Change | Edit |
|--------|------|
| Stage must-follow rules | `type=system` pack `.md` (e.g. `ask_system.md`, `paint_system.md`) |
| How a design job is done | Skill seed or `design_skills/<pack>/SKILL.md` |
| One inject line | `type=template` `.md` — keep short |

Do not duplicate craft into `paint_system` / `react_system`. Brush / Lottie → ext skills `brush_ops` / `motion_lottie`; core skills only route to them.

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

Platform credits are controlled by **`WALLET_BILLING_ENABLED`** (API env; **default off** in app settings and docker-compose):

| Value | Behavior |
|-------|----------|
| `false` (default) | No holds/charges. UI hides balance chip, Plans, redeem, Usage & billing, and send-button credit chips. Bring your own LLM keys. |
| `true` | SaaS-style wallet (plans, card keys, daily free quota, credit estimates in the editor). |

This is **not** a Recombyn Cloud subscription — you own the switch on your instance. Local desktop (`DESKTOP_LOCAL_AUTO_LOGIN`) always skips billing regardless of the env flag.

Cloud / SaaS deploys must set `WALLET_BILLING_ENABLED=true` explicitly.

Optional when billing is on:

- Raise or remove daily free quota (`FREE_DAILY_LIMIT` in `services/wallet/db.py`)
- Issue card keys (admin + `CARD_KEY_SALT` / `CARD_KEY_OPS_PASSWORD`)


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

## License

**Recombyn Source Available License v1.0** — full terms in root [`LICENSE`](../LICENSE); short notices in [`NOTICE`](../NOTICE).

Third-party images you may run alongside (Redis, MySQL, …) keep **their own** licenses. Hosted Cloud / support / enterprise add-ons are separate commercial offerings.

## Related

- [recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/) · [Desktop](./desktop.md) · [Postgres](./postgres-switch.md)
