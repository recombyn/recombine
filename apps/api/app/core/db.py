"""SQLAlchemy / SQLModel engine and session factory."""

from __future__ import annotations

from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

_API_ROOT = Path(__file__).resolve().parents[2]


def sqlalchemy_database_uri() -> str:
    """
    Convert product DATABASE_URL into a SQLAlchemy URL.

    - empty → sqlite file under apps/api/storage
    - mysql:// → mysql+pymysql://
    - postgres:// → postgresql+psycopg://
    """
    raw = (settings.database_url or "").strip()
    if not raw:
        path = Path(settings.sqlite_db_path)
        if not path.is_absolute():
            path = _API_ROOT / path
        path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{path.as_posix()}"
    lower = raw.lower()
    if lower.startswith("mysql+pymysql://"):
        return raw
    if lower.startswith("mysql://"):
        return "mysql+pymysql://" + raw[len("mysql://") :]
    if lower.startswith("postgresql+psycopg://") or lower.startswith("postgresql+psycopg2://"):
        return raw
    if lower.startswith("postgres://"):
        return "postgresql+psycopg://" + raw[len("postgres://") :]
    if lower.startswith("postgresql://"):
        return "postgresql+psycopg://" + raw[len("postgresql://") :]
    if lower.startswith("sqlite:"):
        return raw
    raise RuntimeError(f"Unsupported DATABASE_URL for SQLModel: {raw[:48]}…")


# Pool: SQLite needs check_same_thread=False for FastAPI; MySQL uses default pool.
_uri = sqlalchemy_database_uri()
_connect_args: dict = {}
_engine_kwargs: dict = {"echo": False}
if _uri.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
else:
    _engine_kwargs["pool_pre_ping"] = True

engine = create_engine(_uri, connect_args=_connect_args, **_engine_kwargs)


def reset_engine() -> None:
    """Dispose and rebuild ``engine`` after tests change SQLITE_DB_PATH / DATABASE_URL."""
    global engine, _uri, _connect_args, _engine_kwargs
    try:
        engine.dispose()
    except Exception:
        pass
    _uri = sqlalchemy_database_uri()
    _connect_args = {}
    _engine_kwargs = {"echo": False}
    if _uri.startswith("sqlite"):
        _connect_args["check_same_thread"] = False
    else:
        _engine_kwargs["pool_pre_ping"] = True
    engine = create_engine(_uri, connect_args=_connect_args, **_engine_kwargs)


def init_db() -> None:
    """
    Register metadata. Product DDL still lives in ``app.services.db.init_schema``
    (MySQL/SQLite dual + migrations). SQLModel maps existing tables; do not
    ``create_all`` over the whole schema here.
    """
    # Import models so table metadata is registered for Session/mappers.
    from app import models as _models  # noqa: F401

    _ = SQLModel.metadata


def get_session() -> Session:
    """Open a short-lived Session (callers should ``with`` / close)."""
    return Session(engine)
