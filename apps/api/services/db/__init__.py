"""Unified DB backend — Tencent LighthouseDB (MySQL) or local SQLite fallback."""

from __future__ import annotations

import re
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Literal
from urllib.parse import unquote, urlparse

from config.settings import settings

Dialect = Literal["mysql", "sqlite"]

_LOCK = threading.Lock()
_MYSQL_POOL: Any = None
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


def _mysql_connect():
    import pymysql
    from pymysql.cursors import DictCursor

    global _MYSQL_POOL
    cfg = _parse_mysql_url(settings.database_url.strip())
    cfg["cursorclass"] = DictCursor
    # One connection per call is fine for FastAPI sync handlers; pool later if needed.
    return pymysql.connect(**{k: v for k, v in cfg.items() if k != "cursorclass"}, cursorclass=DictCursor)


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
    # SQLite UPSERT → MySQL
    out = re.sub(
        r"ON CONFLICT\((\w+)\)\s+DO UPDATE SET",
        r"ON DUPLICATE KEY UPDATE",
        out,
        flags=re.IGNORECASE,
    )
    # excluded.col → VALUES(col) for MySQL upsert
    out = re.sub(r"excluded\.(\w+)", r"VALUES(\1)", out, flags=re.IGNORECASE)
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
    if dialect() == "mysql":
        raw = _mysql_connect()
        conn = ConnectionWrapper(raw, "mysql")
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

        CREATE TABLE IF NOT EXISTS card_keys (
            id {pk_int},
            key_hash VARCHAR(128) NOT NULL UNIQUE,
            tokens INTEGER NOT NULL,
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
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            reject_reason {text},
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
            created_at DOUBLE NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session
            ON chat_messages(session_id, sort_order);
        """

        # MySQL does not support "CREATE UNIQUE INDEX IF NOT EXISTS" on all versions the same way;
        # use CREATE TABLE + separate index creation with ignore errors.
        with connect() as conn:
            if mysql:
                _init_mysql_schema(conn)
            else:
                conn.executescript(ddl)
        _SCHEMA_READY = True


def _init_mysql_schema(conn: ConnectionWrapper) -> None:
    statements = [
        """
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            email VARCHAR(320) NOT NULL,
            name VARCHAR(255) NOT NULL,
            avatar LONGTEXT,
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
        CREATE TABLE IF NOT EXISTS card_keys (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            key_hash VARCHAR(128) NOT NULL,
            tokens INTEGER NOT NULL,
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
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            reject_reason LONGTEXT,
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
            created_at DOUBLE NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            KEY idx_chat_messages_session (session_id, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
    ]
    for stmt in statements:
        conn.execute(stmt)
