# Switch to PostgreSQL

Production today is **MySQL** (Tencent CynosDB / LighthouseDB) or local **SQLite**.
The API also accepts `postgresql://` / `postgres://` via `DATABASE_URL`.

## What the app does

| Dialect | How |
|---------|-----|
| Empty `DATABASE_URL` | SQLite at `SQLITE_DB_PATH` (WAL + busy_timeout + write lock) |
| `mysql://…` | Existing MySQL pool; optional `DATABASE_READONLY_URL` replica |
| `postgresql://…` | psycopg pool (`pip install 'psycopg[binary]>=3.1'`); schema **not** auto-created |

Postgres `init_schema()` only **checks** that `users` exists. Migrate DDL/data first.

## Smooth switch (MySQL → Postgres)

1. Install driver: `pip install 'psycopg[binary]>=3.1'` (or `pip install -e ".[postgres]"`).
2. Provision empty database.
3. Migrate schema + data (pick one):
   - [pgloader](https://pgloader.readthedocs.io/): `pgloader mysql://… postgresql://…`
   - `mysqldump` → edit types → `psql`
   - Cloud DMS / logical replication
4. Point env:

```env
DATABASE_URL=postgresql://user:pass@host:5432/recombyn
# optional read replica
DATABASE_READONLY_URL=postgresql://user:pass@replica:5432/recombyn
```

5. Restart API; startup verifies `SELECT 1 FROM users`.
6. Smoke: login, design run, wallet redeem/spend.

## SQLite → Postgres

Prefer **SQLite → MySQL (dev compose) → Postgres**, or use pgloader from SQLite if available.
Local WAL backups under `storage/backups/` can be kept as freeze points before cutover.

## Read / write split

```python
from services.db import connect

with connect(readonly=True) as conn:   # replica or SQLite mode=ro
    ...
with connect(immediate=True) as conn:  # wallet / critical writes
    ...
```

## Backups

- SQLite: online `Connection.backup` every `DB_BACKUP_INTERVAL_HOURS` (default 24h) → `DB_BACKUP_DIR`
- MySQL/Postgres: scheduler writes a `.hint.txt` with `mysqldump` / `pg_dump`; prefer cloud automated backups in production
- Celery beat task: `worker.tasks.run_db_backup_job`

## Not in scope yet

- Full dual DDL for every `CREATE TABLE` in Postgres (use migration tools)
- LangGraph checkpointer/store Postgres backends (still MySQL/SQLite paths)
