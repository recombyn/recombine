"""Unified DB backend — Tencent LighthouseDB (MySQL) or local SQLite fallback."""

from __future__ import annotations

import re
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Literal
from urllib.parse import unquote, urlparse

from config.settings import settings

Dialect = Literal["mysql", "sqlite"]

# RLock: init_schema holds this while calling connect() → pool checkout.
_LOCK = threading.RLock()
_MYSQL_POOL: Any = None  # queue.Queue of live pymysql connections
_MYSQL_POOL_SIZE = 8
_SCHEMA_READY = False

_SQLITE_FALLBACK = Path(__file__).resolve().parents[2] / "storage" / "recombyn.db"


def dialect() -> Dialect:
    url = (settings.database_url or "").strip()
    if url.startswith("mysql"):
        return "mysql"
    return "sqlite"


def _parse_mysql_url(url: str) -> dict[str, Any]:
    """
    Accept:
      mysql://user:pass@host:3306/dbname
      mysql+pymysql://user:pass@host:3306/dbname
    """
    raw = url.replace("mysql+pymysql://", "mysql://", 1)
    parsed = urlparse(raw)
    if parsed.scheme != "mysql":
        raise ValueError(f"Unsupported DATABASE_URL scheme: {parsed.scheme}")
    db = (parsed.path or "/").lstrip("/") or "recombyn"
    return {
        "host": parsed.hostname or "127.0.0.1",
        "port": int(parsed.port or 3306),
        "user": unquote(parsed.username or "root"),
        "password": unquote(parsed.password or ""),
        "database": db,
        "charset": "utf8mb4",
        "autocommit": False,
        "cursorclass": None,  # set after import
    }


def _mysql_connect_new():
    import pymysql
    from pymysql.cursors import DictCursor

    cfg = _parse_mysql_url(settings.database_url.strip())
    cfg["cursorclass"] = DictCursor
    cfg["connect_timeout"] = 10
    cfg["read_timeout"] = 60
    cfg["write_timeout"] = 60
    return pymysql.connect(**{k: v for k, v in cfg.items() if k != "cursorclass"}, cursorclass=DictCursor)


def _mysql_pool_get():
    """Borrow a pooled connection; create up to _MYSQL_POOL_SIZE."""
    import queue

    global _MYSQL_POOL
    with _LOCK:
        if _MYSQL_POOL is None:
            _MYSQL_POOL = queue.Queue(maxsize=_MYSQL_POOL_SIZE)
            _MYSQL_POOL._opened = 0  # type: ignore[attr-defined]

    pool = _MYSQL_POOL

    def _mark_pooled(conn: Any) -> Any:
        setattr(conn, "_rcb_pooled", True)
        return conn

    try:
        raw = pool.get_nowait()
    except queue.Empty:
        raw = None

    if raw is not None:
        try:
            raw.ping(reconnect=True)
            return _mark_pooled(raw)
        except Exception:
            try:
                raw.close()
            except Exception:
                pass
            with _LOCK:
                pool._opened = max(0, int(getattr(pool, "_opened", 1)) - 1)  # type: ignore[attr-defined]

    create = False
    with _LOCK:
        opened = int(getattr(pool, "_opened", 0))
        if opened < _MYSQL_POOL_SIZE:
            pool._opened = opened + 1  # type: ignore[attr-defined]
            create = True

    if create:
        try:
            return _mark_pooled(_mysql_connect_new())
        except Exception:
            with _LOCK:
                pool._opened = max(0, int(getattr(pool, "_opened", 1)) - 1)  # type: ignore[attr-defined]
            raise

    # Pool exhausted — wait for a recycled connection (do not open uncapped).
    deadline = time.monotonic() + 15.0
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("MySQL connection pool exhausted")
        try:
            raw = pool.get(timeout=remaining)
        except queue.Empty:
            raise TimeoutError("MySQL connection pool exhausted") from None
        try:
            raw.ping(reconnect=True)
            return _mark_pooled(raw)
        except Exception:
            try:
                raw.close()
            except Exception:
                pass
            with _LOCK:
                pool._opened = max(0, int(getattr(pool, "_opened", 1)) - 1)  # type: ignore[attr-defined]


def _mysql_pool_put(raw: Any) -> None:
    pool = _MYSQL_POOL
    if pool is None or not getattr(raw, "_rcb_pooled", False):
        try:
            raw.close()
        except Exception:
            pass
        return
    try:
        # Drop dirty transactions before reuse.
        try:
            raw.rollback()
        except Exception:
            pass
        pool.put_nowait(raw)
    except Exception:
        try:
            raw.close()
        except Exception:
            pass
        with _LOCK:
            if hasattr(pool, "_opened"):
                pool._opened = max(0, int(pool._opened) - 1)  # type: ignore[attr-defined]


def _sqlite_path() -> Path:
    raw = (settings.sqlite_db_path or "").strip()
    if raw:
        path = Path(raw)
        if not path.is_absolute():
            path = Path(__file__).resolve().parents[2] / path
    else:
        path = _SQLITE_FALLBACK
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _adapt_sql(sql: str) -> str:
    """Normalize SQLite-oriented SQL for the active dialect."""
    if dialect() == "sqlite":
        return sql
    out = sql
    out = out.replace("COLLATE NOCASE", "")
    out = out.replace("AUTOINCREMENT", "AUTO_INCREMENT")
    # SQLite last_insert_rowid() → MySQL LAST_INSERT_ID()
    out = re.sub(
        r"\blast_insert_rowid\s*\(\s*\)",
        "LAST_INSERT_ID()",
        out,
        flags=re.IGNORECASE,
    )
    # SQLite UPSERT → MySQL
    out = re.sub(
        r"ON CONFLICT\((\w+)\)\s+DO UPDATE SET",
        r"ON DUPLICATE KEY UPDATE",
        out,
        flags=re.IGNORECASE,
    )
    # excluded.col → VALUES(col) for MySQL upsert
    out = re.sub(r"excluded\.(\w+)", r"VALUES(\1)", out, flags=re.IGNORECASE)
    # pymysql uses %s placeholders; escape literal % (e.g. LIKE '%x%') first.
    out = out.replace("%", "%%")
    out = out.replace("?", "%s")
    return out


class CursorWrapper:
    def __init__(self, cur: Any, dialect_name: Dialect):
        self._cur = cur
        self._dialect = dialect_name

    def execute(self, sql: str, params: Any = ()):
        adapted = _adapt_sql(sql)
        if params is None:
            params = ()
        self._cur.execute(adapted, params)
        return self

    def executemany(self, sql: str, seq: Any):
        adapted = _adapt_sql(sql)
        self._cur.executemany(adapted, seq)
        return self

    def executescript(self, script: str):
        if self._dialect == "sqlite":
            self._cur.executescript(script)
            return self
        # MySQL: split on semicolons carefully
        for stmt in _split_sql(script):
            stmt = stmt.strip()
            if not stmt:
                continue
            self._cur.execute(_adapt_sql(stmt))
        return self

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        if self._dialect == "sqlite":
            return row
        return _DictRow(row)

    def fetchall(self):
        rows = self._cur.fetchall()
        if self._dialect == "sqlite":
            return rows
        return [_DictRow(r) for r in rows]

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    @property
    def rowcount(self):
        return self._cur.rowcount


class _DictRow(dict):
    """sqlite3.Row-like access for MySQL dict rows."""

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class ConnectionWrapper:
    def __init__(self, conn: Any, dialect_name: Dialect):
        self._conn = conn
        self.dialect = dialect_name

    def execute(self, sql: str, params: Any = ()):
        cur = self._conn.cursor()
        wrapper = CursorWrapper(cur, self.dialect)
        wrapper.execute(sql, params)
        return wrapper

    def executemany(self, sql: str, seq: Any):
        cur = self._conn.cursor()
        wrapper = CursorWrapper(cur, self.dialect)
        wrapper.executemany(sql, seq)
        return wrapper

    def executescript(self, script: str):
        cur = self._conn.cursor()
        wrapper = CursorWrapper(cur, self.dialect)
        wrapper.executescript(script)
        return wrapper

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


def _split_sql(script: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    in_str = False
    quote = ""
    for ch in script:
        if in_str:
            buf.append(ch)
            if ch == quote:
                in_str = False
            continue
        if ch in ("'", '"'):
            in_str = True
            quote = ch
            buf.append(ch)
            continue
        if ch == ";":
            parts.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    if buf:
        parts.append("".join(buf))
    return parts


@contextmanager
def connect() -> Iterator[ConnectionWrapper]:
    """Yield a connection; commits on success, rolls back on error."""
    pooled = False
    if dialect() == "mysql":
        raw = _mysql_pool_get()
        conn = ConnectionWrapper(raw, "mysql")
        pooled = True
    else:
        raw = sqlite3.connect(str(_sqlite_path()), check_same_thread=False)
        raw.row_factory = sqlite3.Row
        raw.execute("PRAGMA foreign_keys = ON")
        conn = ConnectionWrapper(raw, "sqlite")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        if pooled:
            _mysql_pool_put(raw)
        else:
            conn.close()


def init_schema() -> None:
    """Create all application tables (idempotent)."""
    global _SCHEMA_READY
    with _LOCK:
        if _SCHEMA_READY:
            return
        mysql = dialect() == "mysql"
        pk_int = "BIGINT AUTO_INCREMENT PRIMARY KEY" if mysql else "INTEGER PRIMARY KEY AUTOINCREMENT"
        text = "TEXT" if not mysql else "LONGTEXT"
        # emails: case-insensitive via collation on MySQL
        email_col = (
            "VARCHAR(320) NOT NULL"
            if mysql
            else "TEXT NOT NULL COLLATE NOCASE"
        )
        email_pk = (
            "VARCHAR(320) PRIMARY KEY"
            if mysql
            else "TEXT PRIMARY KEY COLLATE NOCASE"
        )

        ddl = f"""
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            email {email_col},
            name VARCHAR(255) NOT NULL,
            avatar {text},
            default_avatar {text},
            bio {text},
            provider VARCHAR(32) NOT NULL DEFAULT 'email',
            google_sub VARCHAR(128),
            password_hash VARCHAR(128),
            password_salt VARCHAR(64),
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);

        CREATE TABLE IF NOT EXISTS auth_sessions (
            token VARCHAR(128) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            expires_at DOUBLE NOT NULL,
            created_at DOUBLE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON auth_sessions(expires_at);

        CREATE TABLE IF NOT EXISTS email_codes (
            email {email_pk},
            code_hash VARCHAR(128) NOT NULL,
            expires_at DOUBLE NOT NULL,
            sent_at DOUBLE NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS email_tickets (
            ticket VARCHAR(128) PRIMARY KEY,
            email {email_col},
            expires_at DOUBLE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS email_activate_tokens (
            token_id VARCHAR(64) PRIMARY KEY,
            email {email_col},
            expires_at DOUBLE NOT NULL,
            created_at DOUBLE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_email_activate_expires ON email_activate_tokens(expires_at);

        CREATE TABLE IF NOT EXISTS card_keys (
            id {pk_int},
            key_hash VARCHAR(128) NOT NULL UNIQUE,
            tokens INTEGER NOT NULL,
            kind VARCHAR(16) NOT NULL DEFAULT 'token',
            plan_id VARCHAR(16),
            status VARCHAR(16) NOT NULL DEFAULT 'unused',
            expires_at DOUBLE,
            created_at DOUBLE NOT NULL,
            redeemed_by VARCHAR(64),
            redeemed_at DOUBLE
        );
        CREATE INDEX IF NOT EXISTS idx_card_keys_status ON card_keys(status);

        CREATE TABLE IF NOT EXISTS user_balances (
            user_id VARCHAR(64) PRIMARY KEY,
            tokens INTEGER NOT NULL DEFAULT 0,
            image_credits INTEGER NOT NULL DEFAULT 0,
            plan_id VARCHAR(16) NOT NULL DEFAULT 'free',
            plan_expires_at DOUBLE,
            updated_at DOUBLE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wallet_ledger (
            id {pk_int},
            user_id VARCHAR(64) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            amount INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            detail {text},
            card_key_id BIGINT,
            created_at DOUBLE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ledger_user ON wallet_ledger(user_id, created_at);

        CREATE TABLE IF NOT EXISTS plaza_submissions (
            id VARCHAR(64) PRIMARY KEY,
            project_id VARCHAR(64) NOT NULL,
            user_id VARCHAR(64) NOT NULL,
            author_name VARCHAR(255) NOT NULL,
            author_avatar {text},
            title VARCHAR(255) NOT NULL,
            category VARCHAR(32) NOT NULL DEFAULT 'resume',
            document_json {text} NOT NULL,
            document_key VARCHAR(512),
            cover_json {text},
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            reject_reason {text},
            like_count INTEGER NOT NULL DEFAULT 0,
            use_count INTEGER NOT NULL DEFAULT 0,
            is_visible INTEGER NOT NULL DEFAULT 1,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL,
            reviewed_at DOUBLE,
            reviewed_by VARCHAR(64)
        );
        CREATE INDEX IF NOT EXISTS idx_plaza_status_updated ON plaza_submissions(status, updated_at);
        CREATE INDEX IF NOT EXISTS idx_plaza_user_project ON plaza_submissions(user_id, project_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_plaza_user_status ON plaza_submissions(user_id, status, updated_at);

        CREATE TABLE IF NOT EXISTS projects (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            name VARCHAR(255) NOT NULL,
            thumbnail_key VARCHAR(512),
            document_key VARCHAR(512),
            document_json {text},
            revision INTEGER NOT NULL DEFAULT 1,
            updated_at DOUBLE NOT NULL,
            created_at DOUBLE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at);

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            project_id VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL DEFAULT '',
            updated_at DOUBLE NOT NULL,
            created_at DOUBLE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_scope
            ON chat_sessions(user_id, project_id, updated_at);

        CREATE TABLE IF NOT EXISTS chat_messages (
            id VARCHAR(64) PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            role VARCHAR(16) NOT NULL,
            content {text} NOT NULL,
            thinking {text},
            meta_json {text},
            created_at DOUBLE NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session
            ON chat_messages(session_id, sort_order);

        CREATE TABLE IF NOT EXISTS fonts (
            id VARCHAR(64) PRIMARY KEY,
            family VARCHAR(255) NOT NULL,
            display_name VARCHAR(255) NOT NULL,
            faces_json {text} NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DOUBLE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_fonts_sort ON fonts(sort_order);

        CREATE TABLE IF NOT EXISTS assets (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            object_key VARCHAR(512),
            url {text} NOT NULL,
            mime VARCHAR(128),
            width INTEGER,
            height INTEGER,
            source VARCHAR(32) NOT NULL DEFAULT 'ai_image',
            prompt {text},
            meta_json {text},
            created_at DOUBLE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id, created_at);

        CREATE TABLE IF NOT EXISTS plaza_likes (
            user_id VARCHAR(64) NOT NULL,
            submission_id VARCHAR(64) NOT NULL,
            created_at DOUBLE NOT NULL,
            PRIMARY KEY (user_id, submission_id)
        );
        CREATE INDEX IF NOT EXISTS idx_plaza_likes_user ON plaza_likes(user_id, created_at);

        CREATE TABLE IF NOT EXISTS user_follows (
            user_id VARCHAR(64) NOT NULL,
            followee_id VARCHAR(64) NOT NULL,
            followee_name VARCHAR(255) NOT NULL DEFAULT '',
            followee_avatar {text},
            created_at DOUBLE NOT NULL,
            PRIMARY KEY (user_id, followee_id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_follows_user ON user_follows(user_id, created_at);

        CREATE TABLE IF NOT EXISTS document_shares (
            id VARCHAR(64) PRIMARY KEY,
            owner_id VARCHAR(64) NOT NULL,
            name VARCHAR(255) NOT NULL,
            permission VARCHAR(16) NOT NULL,
            document_json {text} NOT NULL,
            source_project_id VARCHAR(64),
            editor_user_ids {text},
            viewer_user_ids {text},
            link_enabled INTEGER NOT NULL DEFAULT 1,
            link_public INTEGER NOT NULL DEFAULT 0,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_document_shares_owner ON document_shares(owner_id, updated_at);

        CREATE TABLE IF NOT EXISTS notices (
            id VARCHAR(64) PRIMARY KEY,
            kind VARCHAR(16) NOT NULL DEFAULT 'announcement',
            title VARCHAR(255) NOT NULL,
            body {text} NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'draft',
            published_at DOUBLE,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notices_kind_status ON notices(kind, status, published_at);
        """

        # MySQL does not support "CREATE UNIQUE INDEX IF NOT EXISTS" on all versions the same way;
        # use CREATE TABLE + separate index creation with ignore errors.
        with connect() as conn:
            if mysql:
                _init_mysql_schema(conn)
            else:
                conn.executescript(ddl)
            _ensure_plaza_cover_json(conn, mysql=mysql)
            _ensure_plaza_panel_urls_json(conn, mysql=mysql)
            _ensure_plaza_cover_image_url(conn, mysql=mysql)
            _ensure_plaza_custom_cover_image_url(conn, mysql=mysql)
            _ensure_plaza_likes(conn, mysql=mysql)
            _ensure_user_follows(conn, mysql=mysql)
            _ensure_plaza_engagement_counts(conn, mysql=mysql)
            _ensure_plaza_is_visible(conn, mysql=mysql)
            _ensure_document_shares(conn, mysql=mysql)
            _ensure_document_shares_columns(conn, mysql=mysql)
            _ensure_notices_table(conn, mysql=mysql)
            _ensure_users_admin_columns(conn, mysql=mysql)
            _ensure_users_default_avatar(conn, mysql=mysql)
            _ensure_chat_messages_meta_json(conn, mysql=mysql)
            _ensure_chat_sessions_meta_json(conn, mysql=mysql)
            _ensure_wallet_plan_columns(conn, mysql=mysql)
            _ensure_projects_revision(conn, mysql=mysql)
            _ensure_projects_thumbnail_custom(conn, mysql=mysql)
            _ensure_projects_thumbnail_key_wide(conn, mysql=mysql)
            _ensure_agent_memory_tables(conn, mysql=mysql)
            from services.design.schema import ensure_design_tables
            from services.llm.catalog_store import ensure_llm_models_table
            from services.llm.usage_log import ensure_model_usage_table

            ensure_design_tables(conn, mysql=mysql)
            ensure_llm_models_table(conn, mysql=mysql)
            ensure_model_usage_table(conn, mysql=mysql)
        _SCHEMA_READY = True
        try:
            from services.design.seed import seed_design_catalog_if_empty

            seed_design_catalog_if_empty()
        except Exception:
            pass


def _ensure_projects_revision(conn: Any, *, mysql: bool) -> None:
    """projects.revision for optimistic concurrency (If-Match / baseRevision)."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'projects'
                  AND COLUMN_NAME = 'revision'
                """,
            ).fetchone()
            if int((row or {}).get("c") or 0) == 0:
                conn.execute(
                    "ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT 1"
                )
        else:
            cols = {
                str(r["name"]) for r in conn.execute("PRAGMA table_info(projects)").fetchall()
            }
            if "revision" not in cols:
                conn.execute(
                    "ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT 1"
                )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_projects_thumbnail_custom(conn: Any, *, mysql: bool) -> None:
    """projects.thumbnail_custom — user cover must not be overwritten by auto thumbs."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'projects'
                  AND COLUMN_NAME = 'thumbnail_custom'
                """,
            ).fetchone()
            if int((row or {}).get("c") or 0) == 0:
                conn.execute(
                    "ALTER TABLE projects ADD COLUMN thumbnail_custom TINYINT NOT NULL DEFAULT 0"
                )
        else:
            cols = {
                str(r["name"]) for r in conn.execute("PRAGMA table_info(projects)").fetchall()
            }
            if "thumbnail_custom" not in cols:
                conn.execute(
                    "ALTER TABLE projects ADD COLUMN thumbnail_custom INTEGER NOT NULL DEFAULT 0"
                )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_projects_thumbnail_key_wide(conn: Any, *, mysql: bool) -> None:
    """Widen thumbnail_key so JSON arrays of up to 4 cover URLs fit."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT DATA_TYPE AS t, CHARACTER_MAXIMUM_LENGTH AS n
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'projects'
                  AND COLUMN_NAME = 'thumbnail_key'
                """,
            ).fetchone()
            dtype = str((row or {}).get("t") or "").lower()
            maxlen = int((row or {}).get("n") or 0)
            if dtype in ("varchar", "char") and (maxlen == 0 or maxlen < 2000):
                conn.execute(
                    "ALTER TABLE projects MODIFY COLUMN thumbnail_key VARCHAR(2000) NULL"
                )
        # SQLite ignores VARCHAR length — JSON arrays already fit in TEXT affinity.
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_users_default_avatar(conn: Any, *, mysql: bool) -> None:
    """users.default_avatar — OAuth/system default; users.avatar stays custom upload."""
    col_type = "LONGTEXT" if mysql else "TEXT"
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'users'
                  AND COLUMN_NAME = 'default_avatar'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) == 0:
                conn.execute(
                    f"ALTER TABLE users ADD COLUMN default_avatar {col_type} NULL"
                )
        else:
            cols = {
                str(r["name"]) for r in conn.execute("PRAGMA table_info(users)").fetchall()
            }
            if "default_avatar" not in cols:
                conn.execute(
                    f"ALTER TABLE users ADD COLUMN default_avatar {col_type}"
                )
        # Legacy: Google CDN URLs lived in avatar — move to default_avatar.
        conn.execute(
            """
            UPDATE users
            SET default_avatar = avatar,
                avatar = NULL
            WHERE (default_avatar IS NULL OR default_avatar = '')
              AND avatar IS NOT NULL
              AND avatar != ''
              AND (
                avatar LIKE '%googleusercontent.com%'
                OR avatar LIKE '%ggpht.com%'
              )
            """
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_users_admin_columns(conn: Any, *, mysql: bool) -> None:
    """users.role / users.status for admin console (idempotent)."""
    columns = (
        ("role", "VARCHAR(16) NOT NULL DEFAULT 'user'"),
        ("status", "VARCHAR(16) NOT NULL DEFAULT 'active'"),
    )
    try:
        if mysql:
            for name, col_def in columns:
                row = conn.execute(
                    """
                    SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'users'
                      AND COLUMN_NAME = ?
                    """,
                    (name,),
                ).fetchone()
                if int((row or {}).get("c") or 0) > 0:
                    continue
                conn.execute(f"ALTER TABLE users ADD COLUMN {name} {col_def}")
            conn.execute(
                """
                UPDATE users
                SET role = 'admin', status = 'active'
                WHERE id = 'user_super_admin'
                   OR email = 'admin@recombyn.com'
                """
            )
        else:
            cols = {
                str(r["name"]) for r in conn.execute("PRAGMA table_info(users)").fetchall()
            }
            for name, col_def in columns:
                if name in cols:
                    continue
                conn.execute(f"ALTER TABLE users ADD COLUMN {name} {col_def}")
            conn.execute(
                """
                UPDATE users
                SET role = 'admin', status = 'active'
                WHERE id = 'user_super_admin'
                   OR email = 'admin@recombyn.com'
                """
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_chat_sessions_meta_json(conn: Any, *, mysql: bool) -> None:
    """chat_sessions.meta_json for agent task_state (idempotent)."""
    col_type = "LONGTEXT" if mysql else "TEXT"
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'chat_sessions'
                  AND COLUMN_NAME = 'meta_json'
                """,
            ).fetchone()
            if int((row or {}).get("c") or 0) == 0:
                conn.execute(f"ALTER TABLE chat_sessions ADD COLUMN meta_json {col_type} NULL")
        else:
            cols = {
                str(r["name"]) for r in conn.execute("PRAGMA table_info(chat_sessions)").fetchall()
            }
            if "meta_json" not in cols:
                conn.execute(f"ALTER TABLE chat_sessions ADD COLUMN meta_json {col_type}")
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_agent_memory_tables(conn: Any, *, mysql: bool) -> None:
    """agent_session_snapshot + agent_long_memory (idempotent)."""
    text = "LONGTEXT" if mysql else "TEXT"
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'agent_session_snapshot'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) == 0:
                conn.execute(
                    f"""
                    CREATE TABLE agent_session_snapshot (
                        session_id VARCHAR(64) PRIMARY KEY,
                        user_id VARCHAR(64) NOT NULL,
                        project_id VARCHAR(64) NOT NULL,
                        task_state_json {text} NOT NULL,
                        updated_at DOUBLE NOT NULL,
                        created_at DOUBLE NOT NULL,
                        KEY idx_agent_snapshot_user (user_id, updated_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                )
            row2 = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'agent_long_memory'
                """
            ).fetchone()
            if int((row2 or {}).get("c") or 0) == 0:
                conn.execute(
                    f"""
                    CREATE TABLE agent_long_memory (
                        id VARCHAR(64) PRIMARY KEY,
                        user_id VARCHAR(64) NOT NULL,
                        kind VARCHAR(32) NOT NULL,
                        text {text} NOT NULL,
                        status VARCHAR(16) NOT NULL DEFAULT 'active',
                        pinned INTEGER NOT NULL DEFAULT 0,
                        score DOUBLE NOT NULL DEFAULT 1.0,
                        created_at DOUBLE NOT NULL,
                        updated_at DOUBLE NOT NULL,
                        KEY idx_agent_long_user (user_id, status, updated_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                )
        else:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS agent_session_snapshot (
                    session_id VARCHAR(64) PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    project_id VARCHAR(64) NOT NULL,
                    task_state_json {text} NOT NULL,
                    updated_at DOUBLE NOT NULL,
                    created_at DOUBLE NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agent_snapshot_user ON agent_session_snapshot(user_id, updated_at)"
            )
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS agent_long_memory (
                    id VARCHAR(64) PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    kind VARCHAR(32) NOT NULL,
                    text {text} NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'active',
                    pinned INTEGER NOT NULL DEFAULT 0,
                    score REAL NOT NULL DEFAULT 1.0,
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agent_long_user ON agent_long_memory(user_id, status, updated_at)"
            )
        _ensure_agent_episode_table(conn, mysql=mysql, text=text)
        _ensure_long_memory_emb_cols(conn, mysql=mysql)
        _ensure_agent_kg_table(conn, mysql=mysql, text=text)
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_agent_kg_table(conn: Any, *, mysql: bool, text: str) -> None:
    """P3 lightweight SPO triples (idempotent)."""
    if mysql:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'agent_kg_triple'
            """
        ).fetchone()
        if int((row or {}).get("c") or 0) == 0:
            conn.execute(
                f"""
                CREATE TABLE agent_kg_triple (
                    id VARCHAR(64) PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    subject VARCHAR(128) NOT NULL,
                    predicate VARCHAR(64) NOT NULL,
                    object {text} NOT NULL,
                    weight DOUBLE NOT NULL DEFAULT 1.0,
                    source VARCHAR(32) NOT NULL DEFAULT 'episode',
                    status VARCHAR(16) NOT NULL DEFAULT 'active',
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL,
                    KEY idx_kg_user (user_id, status, weight),
                    KEY idx_kg_spo (user_id, subject, predicate, status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        return
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS agent_kg_triple (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            subject VARCHAR(128) NOT NULL,
            predicate VARCHAR(64) NOT NULL,
            object {text} NOT NULL,
            weight REAL NOT NULL DEFAULT 1.0,
            source VARCHAR(32) NOT NULL DEFAULT 'episode',
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_kg_user ON agent_kg_triple(user_id, status, weight)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_kg_spo "
        "ON agent_kg_triple(user_id, subject, predicate, status)"
    )


def _ensure_long_memory_emb_cols(conn: Any, *, mysql: bool) -> None:
    """Add emb columns to agent_long_memory for P1b vector retrieve (idempotent)."""
    blob = "LONGBLOB" if mysql else "BLOB"
    cols_needed = (
        ("emb", blob),
        ("emb_dim", "INTEGER NOT NULL DEFAULT 0"),
        ("emb_model", "VARCHAR(64) NOT NULL DEFAULT ''"),
        ("embed_status", "VARCHAR(16) NOT NULL DEFAULT 'pending'"),
    )
    if mysql:
        for name, col_type in cols_needed:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'agent_long_memory'
                  AND COLUMN_NAME = ?
                """,
                (name,),
            ).fetchone()
            if int((row or {}).get("c") or 0) == 0:
                conn.execute(
                    f"ALTER TABLE agent_long_memory ADD COLUMN {name} {col_type}"
                )
        return
    cols = {
        str(r["name"]) for r in conn.execute("PRAGMA table_info(agent_long_memory)").fetchall()
    }
    for name, col_type in cols_needed:
        if name not in cols:
            conn.execute(f"ALTER TABLE agent_long_memory ADD COLUMN {name} {col_type}")


def _ensure_agent_episode_table(conn: Any, *, mysql: bool, text: str) -> None:
    """Design-run episodes for experience RAG (P1). Idempotent."""
    blob = "LONGBLOB" if mysql else "BLOB"
    if mysql:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'agent_episode'
            """
        ).fetchone()
        if int((row or {}).get("c") or 0) == 0:
            conn.execute(
                f"""
                CREATE TABLE agent_episode (
                    id VARCHAR(64) PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    session_id VARCHAR(64) NOT NULL DEFAULT '',
                    project_id VARCHAR(64) NOT NULL DEFAULT '',
                    task_id VARCHAR(64) NOT NULL DEFAULT '',
                    scene VARCHAR(32) NOT NULL DEFAULT '',
                    goal {text} NOT NULL,
                    summary {text} NOT NULL,
                    actions_json {text} NULL,
                    observe_json {text} NULL,
                    outcome VARCHAR(16) NOT NULL DEFAULT 'success',
                    emb {blob} NULL,
                    emb_dim INTEGER NOT NULL DEFAULT 0,
                    emb_model VARCHAR(64) NOT NULL DEFAULT '',
                    embed_status VARCHAR(16) NOT NULL DEFAULT 'pending',
                    status VARCHAR(16) NOT NULL DEFAULT 'active',
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL,
                    KEY idx_agent_ep_user (user_id, status, created_at),
                    KEY idx_agent_ep_embed (user_id, embed_status, status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        return

    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS agent_episode (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            session_id VARCHAR(64) NOT NULL DEFAULT '',
            project_id VARCHAR(64) NOT NULL DEFAULT '',
            task_id VARCHAR(64) NOT NULL DEFAULT '',
            scene VARCHAR(32) NOT NULL DEFAULT '',
            goal {text} NOT NULL,
            summary {text} NOT NULL,
            actions_json {text} NULL,
            observe_json {text} NULL,
            outcome VARCHAR(16) NOT NULL DEFAULT 'success',
            emb {blob} NULL,
            emb_dim INTEGER NOT NULL DEFAULT 0,
            emb_model VARCHAR(64) NOT NULL DEFAULT '',
            embed_status VARCHAR(16) NOT NULL DEFAULT 'pending',
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_ep_user "
        "ON agent_episode(user_id, status, created_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_ep_embed "
        "ON agent_episode(user_id, embed_status, status)"
    )


def _ensure_chat_messages_meta_json(conn: Any, *, mysql: bool) -> None:
    """chat_messages.meta_json for duration/intent/steps (idempotent)."""
    col_type = "LONGTEXT" if mysql else "TEXT"
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'chat_messages'
                  AND COLUMN_NAME = 'meta_json'
                """,
            ).fetchone()
            if int((row or {}).get("c") or 0) == 0:
                conn.execute(f"ALTER TABLE chat_messages ADD COLUMN meta_json {col_type} NULL")
        else:
            cols = {
                str(r["name"]) for r in conn.execute("PRAGMA table_info(chat_messages)").fetchall()
            }
            if "meta_json" not in cols:
                conn.execute(f"ALTER TABLE chat_messages ADD COLUMN meta_json {col_type}")
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_plaza_cover_json(conn: Any, *, mysql: bool) -> None:
    """Plaza list cover snapshot column (idempotent)."""
    col_type = "LONGTEXT" if mysql else "TEXT"
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'plaza_submissions'
                  AND COLUMN_NAME = 'cover_json'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(f"ALTER TABLE plaza_submissions ADD COLUMN cover_json {col_type} NULL")
        else:
            cols = {
                str(r["name"])
                for r in conn.execute("PRAGMA table_info(plaza_submissions)").fetchall()
            }
            if "cover_json" in cols:
                return
            conn.execute(f"ALTER TABLE plaza_submissions ADD COLUMN cover_json {col_type}")
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_plaza_panel_urls_json(conn: Any, *, mysql: bool) -> None:
    """HD PNG panel URLs written on approve (idempotent)."""
    col_type = "LONGTEXT" if mysql else "TEXT"
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'plaza_submissions'
                  AND COLUMN_NAME = 'panel_urls_json'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(
                f"ALTER TABLE plaza_submissions ADD COLUMN panel_urls_json {col_type} NULL"
            )
        else:
            cols = {
                str(r["name"])
                for r in conn.execute("PRAGMA table_info(plaza_submissions)").fetchall()
            }
            if "panel_urls_json" in cols:
                return
            conn.execute(
                f"ALTER TABLE plaza_submissions ADD COLUMN panel_urls_json {col_type}"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_plaza_cover_image_url(conn: Any, *, mysql: bool) -> None:
    """Default list-cover URL (project thumb snapshot on submit)."""
    col_type = "VARCHAR(1024)" if mysql else "TEXT"
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'plaza_submissions'
                  AND COLUMN_NAME = 'cover_image_url'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(
                f"ALTER TABLE plaza_submissions ADD COLUMN cover_image_url {col_type} NULL"
            )
        else:
            cols = {
                str(r["name"])
                for r in conn.execute("PRAGMA table_info(plaza_submissions)").fetchall()
            }
            if "cover_image_url" in cols:
                return
            conn.execute(
                f"ALTER TABLE plaza_submissions ADD COLUMN cover_image_url {col_type}"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_plaza_custom_cover_image_url(conn: Any, *, mysql: bool) -> None:
    """Admin-uploaded list cover (overrides default when set)."""
    col_type = "VARCHAR(1024)" if mysql else "TEXT"
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'plaza_submissions'
                  AND COLUMN_NAME = 'custom_cover_image_url'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(
                f"ALTER TABLE plaza_submissions ADD COLUMN custom_cover_image_url {col_type} NULL"
            )
        else:
            cols = {
                str(r["name"])
                for r in conn.execute("PRAGMA table_info(plaza_submissions)").fetchall()
            }
            if "custom_cover_image_url" in cols:
                return
            conn.execute(
                f"ALTER TABLE plaza_submissions ADD COLUMN custom_cover_image_url {col_type}"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_plaza_likes(conn: Any, *, mysql: bool) -> None:
    """Me liked plaza items table (idempotent)."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'plaza_likes'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(
                """
                CREATE TABLE plaza_likes (
                    user_id VARCHAR(64) NOT NULL,
                    submission_id VARCHAR(64) NOT NULL,
                    created_at DOUBLE NOT NULL,
                    PRIMARY KEY (user_id, submission_id),
                    KEY idx_plaza_likes_user (user_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        else:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS plaza_likes (
                    user_id VARCHAR(64) NOT NULL,
                    submission_id VARCHAR(64) NOT NULL,
                    created_at DOUBLE NOT NULL,
                    PRIMARY KEY (user_id, submission_id)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_plaza_likes_user ON plaza_likes(user_id, created_at)"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_user_follows(conn: Any, *, mysql: bool) -> None:
    """Me followed creators table (idempotent)."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'user_follows'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(
                """
                CREATE TABLE user_follows (
                    user_id VARCHAR(64) NOT NULL,
                    followee_id VARCHAR(64) NOT NULL,
                    followee_name VARCHAR(255) NOT NULL DEFAULT '',
                    followee_avatar LONGTEXT NULL,
                    created_at DOUBLE NOT NULL,
                    PRIMARY KEY (user_id, followee_id),
                    KEY idx_user_follows_user (user_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        else:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_follows (
                    user_id VARCHAR(64) NOT NULL,
                    followee_id VARCHAR(64) NOT NULL,
                    followee_name VARCHAR(255) NOT NULL DEFAULT '',
                    followee_avatar TEXT,
                    created_at DOUBLE NOT NULL,
                    PRIMARY KEY (user_id, followee_id)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_follows_user ON user_follows(user_id, created_at)"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _init_mysql_schema(conn: ConnectionWrapper) -> None:
    statements = [
        """
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            email VARCHAR(320) NOT NULL,
            name VARCHAR(255) NOT NULL,
            avatar LONGTEXT,
            default_avatar LONGTEXT,
            bio LONGTEXT,
            provider VARCHAR(32) NOT NULL DEFAULT 'email',
            google_sub VARCHAR(128) NULL,
            password_hash VARCHAR(128) NULL,
            password_salt VARCHAR(64) NULL,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL,
            UNIQUE KEY uk_users_email (email),
            UNIQUE KEY uk_users_google_sub (google_sub)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS auth_sessions (
            token VARCHAR(128) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            expires_at DOUBLE NOT NULL,
            created_at DOUBLE NOT NULL,
            KEY idx_sessions_user (user_id),
            KEY idx_sessions_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS email_codes (
            email VARCHAR(320) PRIMARY KEY,
            code_hash VARCHAR(128) NOT NULL,
            expires_at DOUBLE NOT NULL,
            sent_at DOUBLE NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS email_tickets (
            ticket VARCHAR(128) PRIMARY KEY,
            email VARCHAR(320) NOT NULL,
            expires_at DOUBLE NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS email_activate_tokens (
            token_id VARCHAR(64) PRIMARY KEY,
            email VARCHAR(320) NOT NULL,
            expires_at DOUBLE NOT NULL,
            created_at DOUBLE NOT NULL,
            KEY idx_email_activate_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS card_keys (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            key_hash VARCHAR(128) NOT NULL,
            tokens INTEGER NOT NULL,
            kind VARCHAR(16) NOT NULL DEFAULT 'token',
            plan_id VARCHAR(16) NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'unused',
            expires_at DOUBLE NULL,
            created_at DOUBLE NOT NULL,
            redeemed_by VARCHAR(64) NULL,
            redeemed_at DOUBLE NULL,
            UNIQUE KEY uk_card_key_hash (key_hash),
            KEY idx_card_keys_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS user_balances (
            user_id VARCHAR(64) PRIMARY KEY,
            tokens INTEGER NOT NULL DEFAULT 0,
            image_credits INTEGER NOT NULL DEFAULT 0,
            plan_id VARCHAR(16) NOT NULL DEFAULT 'free',
            plan_expires_at DOUBLE NULL,
            updated_at DOUBLE NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS wallet_ledger (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            amount INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            detail LONGTEXT,
            card_key_id BIGINT NULL,
            created_at DOUBLE NOT NULL,
            KEY idx_ledger_user (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS plaza_submissions (
            id VARCHAR(64) PRIMARY KEY,
            project_id VARCHAR(64) NOT NULL,
            user_id VARCHAR(64) NOT NULL,
            author_name VARCHAR(255) NOT NULL,
            author_avatar LONGTEXT,
            title VARCHAR(255) NOT NULL,
            category VARCHAR(32) NOT NULL DEFAULT 'resume',
            document_json LONGTEXT NOT NULL,
            document_key VARCHAR(512) NULL,
            cover_json LONGTEXT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            reject_reason LONGTEXT,
            like_count INTEGER NOT NULL DEFAULT 0,
            use_count INTEGER NOT NULL DEFAULT 0,
            is_visible INTEGER NOT NULL DEFAULT 1,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL,
            reviewed_at DOUBLE NULL,
            reviewed_by VARCHAR(64) NULL,
            KEY idx_plaza_status_updated (status, updated_at),
            KEY idx_plaza_user_project (user_id, project_id, updated_at),
            KEY idx_plaza_user_status (user_id, status, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS projects (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            name VARCHAR(255) NOT NULL,
            thumbnail_key VARCHAR(512) NULL,
            document_key VARCHAR(512) NULL,
            document_json LONGTEXT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            updated_at DOUBLE NOT NULL,
            created_at DOUBLE NOT NULL,
            KEY idx_projects_user (user_id, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            project_id VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL DEFAULT '',
            updated_at DOUBLE NOT NULL,
            created_at DOUBLE NOT NULL,
            KEY idx_chat_sessions_scope (user_id, project_id, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id VARCHAR(64) PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            role VARCHAR(16) NOT NULL,
            content LONGTEXT NOT NULL,
            thinking LONGTEXT NULL,
            meta_json LONGTEXT NULL,
            created_at DOUBLE NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            KEY idx_chat_messages_session (session_id, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS fonts (
            id VARCHAR(64) PRIMARY KEY,
            family VARCHAR(255) NOT NULL,
            display_name VARCHAR(255) NOT NULL,
            faces_json LONGTEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DOUBLE NOT NULL,
            KEY idx_fonts_sort (sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS assets (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            object_key VARCHAR(512) NULL,
            url LONGTEXT NOT NULL,
            mime VARCHAR(128) NULL,
            width INTEGER NULL,
            height INTEGER NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'ai_image',
            prompt LONGTEXT NULL,
            meta_json LONGTEXT NULL,
            created_at DOUBLE NOT NULL,
            KEY idx_assets_user (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS plaza_likes (
            user_id VARCHAR(64) NOT NULL,
            submission_id VARCHAR(64) NOT NULL,
            created_at DOUBLE NOT NULL,
            PRIMARY KEY (user_id, submission_id),
            KEY idx_plaza_likes_user (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS user_follows (
            user_id VARCHAR(64) NOT NULL,
            followee_id VARCHAR(64) NOT NULL,
            followee_name VARCHAR(255) NOT NULL DEFAULT '',
            followee_avatar LONGTEXT NULL,
            created_at DOUBLE NOT NULL,
            PRIMARY KEY (user_id, followee_id),
            KEY idx_user_follows_user (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS document_shares (
            id VARCHAR(64) PRIMARY KEY,
            owner_id VARCHAR(64) NOT NULL,
            name VARCHAR(255) NOT NULL,
            permission VARCHAR(16) NOT NULL,
            document_json LONGTEXT NOT NULL,
            source_project_id VARCHAR(64) NULL,
            editor_user_ids LONGTEXT NULL,
            viewer_user_ids LONGTEXT NULL,
            link_enabled TINYINT NOT NULL DEFAULT 1,
            link_public TINYINT NOT NULL DEFAULT 0,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL,
            KEY idx_document_shares_owner (owner_id, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS notices (
            id VARCHAR(64) PRIMARY KEY,
            kind VARCHAR(16) NOT NULL DEFAULT 'announcement',
            title VARCHAR(255) NOT NULL,
            body LONGTEXT NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'draft',
            published_at DOUBLE NULL,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL,
            KEY idx_notices_kind_status (kind, status, published_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
    ]
    for stmt in statements:
        conn.execute(stmt)



def _ensure_notices_table(conn: Any, *, mysql: bool) -> None:
    """Product notices inbox (idempotent)."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notices'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(
                """
                CREATE TABLE notices (
                    id VARCHAR(64) PRIMARY KEY,
                    kind VARCHAR(16) NOT NULL DEFAULT 'announcement',
                    title VARCHAR(255) NOT NULL,
                    body LONGTEXT NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'draft',
                    published_at DOUBLE NULL,
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL,
                    KEY idx_notices_kind_status (kind, status, published_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        else:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS notices (
                    id VARCHAR(64) PRIMARY KEY,
                    kind VARCHAR(16) NOT NULL DEFAULT 'announcement',
                    title VARCHAR(255) NOT NULL,
                    body TEXT NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'draft',
                    published_at DOUBLE,
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_notices_kind_status ON notices(kind, status, published_at)"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_plaza_is_visible(conn: Any, *, mysql: bool) -> None:
    """is_visible on plaza_submissions (idempotent). Default 1 = show on C-end."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'plaza_submissions'
                  AND COLUMN_NAME = 'is_visible'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(
                "ALTER TABLE plaza_submissions ADD COLUMN is_visible INTEGER NOT NULL DEFAULT 1"
            )
        else:
            cols = {
                str(r["name"])
                for r in conn.execute("PRAGMA table_info(plaza_submissions)").fetchall()
            }
            if "is_visible" in cols:
                return
            conn.execute(
                "ALTER TABLE plaza_submissions ADD COLUMN is_visible INTEGER NOT NULL DEFAULT 1"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_plaza_engagement_counts(conn: Any, *, mysql: bool) -> None:
    """like_count / use_count on plaza_submissions (idempotent)."""
    for col in ("like_count", "use_count"):
        try:
            if mysql:
                row = conn.execute(
                    """
                    SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'plaza_submissions'
                      AND COLUMN_NAME = ?
                    """,
                    (col,),
                ).fetchone()
                if int((row or {}).get("c") or 0) > 0:
                    continue
                conn.execute(
                    f"ALTER TABLE plaza_submissions ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0"
                )
            else:
                cols = {
                    str(r["name"])
                    for r in conn.execute("PRAGMA table_info(plaza_submissions)").fetchall()
                }
                if col in cols:
                    continue
                conn.execute(
                    f"ALTER TABLE plaza_submissions ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0"
                )
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass


def _ensure_document_shares(conn: Any, *, mysql: bool) -> None:
    """Shared documents table (idempotent)."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'document_shares'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(
                """
                CREATE TABLE document_shares (
                    id VARCHAR(64) PRIMARY KEY,
                    owner_id VARCHAR(64) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    permission VARCHAR(16) NOT NULL,
                    document_json LONGTEXT NOT NULL,
                    source_project_id VARCHAR(64) NULL,
                    editor_user_ids LONGTEXT NULL,
                    viewer_user_ids LONGTEXT NULL,
                    link_enabled TINYINT NOT NULL DEFAULT 1,
                    link_public TINYINT NOT NULL DEFAULT 0,
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL,
                    KEY idx_document_shares_owner (owner_id, updated_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        else:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS document_shares (
                    id VARCHAR(64) PRIMARY KEY,
                    owner_id VARCHAR(64) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    permission VARCHAR(16) NOT NULL,
                    document_json TEXT NOT NULL,
                    source_project_id VARCHAR(64),
                    editor_user_ids TEXT,
                    viewer_user_ids TEXT,
                    link_enabled INTEGER NOT NULL DEFAULT 1,
                    link_public INTEGER NOT NULL DEFAULT 0,
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_document_shares_owner ON document_shares(owner_id, updated_at)"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_document_shares_columns(conn: Any, *, mysql: bool) -> None:
    """document_shares ACL / link columns (idempotent)."""
    columns = (
        ("editor_user_ids", "LONGTEXT NULL" if mysql else "TEXT"),
        ("viewer_user_ids", "LONGTEXT NULL" if mysql else "TEXT"),
        ("link_enabled", "TINYINT NOT NULL DEFAULT 1" if mysql else "INTEGER NOT NULL DEFAULT 1"),
        ("link_public", "TINYINT NOT NULL DEFAULT 0" if mysql else "INTEGER NOT NULL DEFAULT 0"),
    )
    try:
        if mysql:
            for name, col_def in columns:
                row = conn.execute(
                    """
                    SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'document_shares'
                      AND COLUMN_NAME = ?
                    """,
                    (name,),
                ).fetchone()
                if int((row or {}).get("c") or 0) > 0:
                    continue
                conn.execute(f"ALTER TABLE document_shares ADD COLUMN {name} {col_def}")
        else:
            cols = {
                str(r["name"]) for r in conn.execute("PRAGMA table_info(document_shares)").fetchall()
            }
            for name, col_def in columns:
                if name in cols:
                    continue
                conn.execute(f"ALTER TABLE document_shares ADD COLUMN {name} {col_def}")
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_wallet_plan_columns(conn: Any, *, mysql: bool) -> None:
    """card_keys.kind/plan_id + user_balances.plan_id (idempotent)."""
    card_cols = (
        ("kind", "VARCHAR(16) NOT NULL DEFAULT 'token'"),
        ("plan_id", "VARCHAR(16) NULL"),
    )
    balance_cols = (
        ("plan_id", "VARCHAR(16) NOT NULL DEFAULT 'free'"),
        ("plan_expires_at", "DOUBLE NULL"),
        ("image_credits", "INTEGER NOT NULL DEFAULT 0"),
    )
    try:
        if mysql:
            for table, columns in (("card_keys", card_cols), ("user_balances", balance_cols)):
                for name, col_def in columns:
                    row = conn.execute(
                        """
                        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = ?
                          AND COLUMN_NAME = ?
                        """,
                        (table, name),
                    ).fetchone()
                    if int((row or {}).get("c") or 0) > 0:
                        continue
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {col_def}")
        else:
            for table, columns in (("card_keys", card_cols), ("user_balances", balance_cols)):
                cols = {
                    str(r["name"])
                    for r in conn.execute(f"PRAGMA table_info({table})").fetchall()
                }
                for name, col_def in columns:
                    if name in cols:
                        continue
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {col_def}")
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass

