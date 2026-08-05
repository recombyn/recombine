# API backend layout

Package layout under `apps/api/app/` (FastAPI official-style `app` package).

## Tree

```text
apps/api/
  app/
    main.py                        # FastAPI() + lifespan + middleware
    api/
      deps.py                      # CurrentUser / AdminUser / OptionalUser / SessionDep
      main.py                      # api_router aggregator
      routes/                      # HTTP handlers only
        admin/                     # admin users/content/catalog/design/fonts
    core/
      config.py                    # Settings (pydantic-settings)
      db.py                        # SQLModel engine + Session
    models.py                      # API response models + table=True ORM
    crud.py                        # session-based data access (`*, session=`)
    services/                      # Domain services
    schemas/                       # Import job response models
  worker/                          # Celery
  tests/
  data/ · storage/
  main.py                          # thin re-export: from app.main import app
  pyproject.toml
```

## Run

```bash
cd apps/api
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# or: npm run dev:api
```

## Import rules

| Use | Not |
|-----|-----|
| `from app.core.config import settings` | `from config.settings` |
| `from app.api.deps import CurrentUser` | per-file `_bearer` / `_require_user` |
| `from app.services.…` | bare `from services.…` |
| `user: CurrentUser` as first params | `authorization: Header` + manual session |
| `with Session(engine) as session:` + `crud.…` | ad-hoc SQL in routes |

## Auth status codes

| Case | Status | Where |
|------|--------|--------|
| Missing `Authorization: Bearer` | **401** `Not authenticated` | `OAuth2PasswordBearer` |
| Invalid / expired / revoked token | **403** `Could not validate credentials` | `get_current_user` |
| Disabled account | **400** `Inactive user` | `get_current_user` |
| Not admin | **403** | `get_current_active_superuser` |

Frontend: treat **401** as “no session / re-login”; **403** as “forbidden or bad token”.

## Notes

- URL prefix remains `/api/v1` (product contract). Settings: `API_V1_STR`, `PROJECT_NAME`. Env `DATABASE_URL` maps to `settings.database_url`.
- `/import/*` requires login (`CurrentUser`).
- Design Agent stays under `app/services/design/` — see [design-agent-runtime.md](./design-agent-runtime.md).

## Data: SQL vs JSON files

| What you see | Role |
|--------------|------|
| SQLite/MySQL tables (`users`, `projects`, `design_*`, …) | **Runtime source of truth** — API reads/writes via SQLModel |
| `apps/api/data/**/*.json` | **Seed / fixture source** only — loaded once into SQL on startup (`ensure_*`); Admin edits stay in DB |
| Columns like `meta_json` / `document_json` | Document payloads stored **as TEXT in SQL** (not a separate JSON DB) |

## SQLModel (done)

| Piece | Path |
|-------|------|
| Engine + `Session` | `app/core/db.py` |
| `SessionDep` / `get_db` | `app/api/deps.py` |
| Tables (`table=True`) | `app/models.py` |
| CRUD (`*, session=`) | `app/crud.py` |
| Domain call sites | `app/services/**` — `with Session(engine) as session: crud.…` |

**Access pattern**

```python
from sqlmodel import Session
from app import crud
from app.core.db import engine

with Session(engine) as session:
    row = crud.get_design_task(session=session, task_id=tid)
```

**DDL (intentional legacy `connect`)**

| Entry | Role |
|-------|------|
| `app.services.db.init_schema` | Full product schema (MySQL / SQLite dual) |
| `ensure_design_tables_boot` | Idempotent design-table ensure + prompt_pack column alters |

Runtime reads/writes no longer use `connect()`. Alembic is optional later (Postgres path notes: [postgres-switch.md](./postgres-switch.md)).

**In-file helpers:** prefer named functions in the same module; do not invent one-off `*Utils` / `*_helpers` satellites (see workspace rule).
