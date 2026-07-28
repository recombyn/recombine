"""Long-term user memory — LangGraph Store (docs) + legacy MySQL table bridge."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from langchain.tools import ToolRuntime, tool

from services.agent_memory.text_embed import (
    cosine,
    get_text_embeddings,
    pack_vec,
    retrieve_mode,
    schedule_background,
    unpack_vec,
)
from services.db import connect, init_schema

logger = logging.getLogger(__name__)

_STORE_LOCK = threading.Lock()
_STORE: Any = None
_STORE_BACKEND: str = ""
_STORE_CONN: Any = None

# Namespace label for LangGraph Store (docs: namespace + key JSON docs).
LONG_TERM_NS = "long_term"


def _top_k(rules: dict[str, str]) -> int:
    try:
        return max(0, min(10, int(str(rules.get("memory.long.top_k") or "3").strip())))
    except ValueError:
        return 3


def _rule_on(rules: dict[str, str], key: str, default: str) -> bool:
    val = str(rules.get(key) if rules.get(key) is not None else default).strip().lower()
    return val in ("1", "true", "yes", "on")


def long_term_namespace(user_id: str) -> tuple[str, str]:
    """LangGraph Store namespace: ``(user_id, 'long_term')``."""
    return ((user_id or "").strip() or "anonymous", LONG_TERM_NS)


def _store_mysql_url() -> str:
    from config.settings import settings

    raw = (settings.langgraph_store_url or settings.database_url or "").strip()
    if not raw.startswith("mysql"):
        return ""
    return raw.replace("mysql+pymysql://", "mysql://", 1)


def _store_sqlite_path() -> Path:
    from config.settings import settings

    raw = (settings.langgraph_store_sqlite_path or "").strip()
    if not raw:
        raw = "storage/langgraph_store.db"
    p = Path(raw)
    if not p.is_absolute():
        p = Path(__file__).resolve().parents[2] / p
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _optional_sqlite_index() -> Any | None:
    """IndexConfig for Sqlite/InMemory semantic search (CLIP Embeddings)."""
    try:
        from langgraph.store.base import IndexConfig
        from services.design.aesthetics.clip_encoder import EMB_DIM

        return IndexConfig(
            embed=get_text_embeddings(),
            dims=int(EMB_DIM),
            fields=["text"],
        )
    except Exception:
        logger.debug("Store IndexConfig unavailable", exc_info=True)
        return None


def _build_mysql_store() -> Any | None:
    url = _store_mysql_url()
    if not url:
        return None
    import pymysql
    from langgraph.store.mysql.pymysql import PyMySQLStore

    global _STORE_CONN
    params = PyMySQLStore.parse_conn_string(url)
    conn = pymysql.connect(**params, autocommit=True)
    store = PyMySQLStore(conn)
    store.setup()
    _STORE_CONN = conn
    return store


def _build_sqlite_store() -> Any:
    import sqlite3

    from langgraph.store.sqlite import SqliteStore

    global _STORE_CONN
    path = str(_store_sqlite_path())
    conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
    index = _optional_sqlite_index()
    store = SqliteStore(conn, index=index) if index is not None else SqliteStore(conn)
    store.setup()
    _STORE_CONN = conn
    return store


def get_agent_store() -> Any:
    """
    Official LangGraph Store for long-term memory (docs).

    Priority: MySQL (``langgraph.store.mysql``) → SqliteStore (+ optional CLIP index)
    → InMemoryStore.
    """
    global _STORE, _STORE_BACKEND
    if _STORE is not None:
        return _STORE
    with _STORE_LOCK:
        if _STORE is not None:
            return _STORE
        try:
            store = _build_mysql_store()
            if store is not None:
                _STORE = store
                _STORE_BACKEND = "mysql"
                logger.info("LangGraph Store: MySQL (long-term memory)")
                return _STORE
        except Exception:
            logger.warning("MySQL Store unavailable; falling back", exc_info=True)
        try:
            _STORE = _build_sqlite_store()
            _STORE_BACKEND = "sqlite"
            logger.info("LangGraph Store: SqliteStore (%s)", _store_sqlite_path())
            return _STORE
        except Exception:
            logger.warning("Sqlite Store unavailable; using InMemoryStore", exc_info=True)
        from langgraph.store.memory import InMemoryStore

        index = _optional_sqlite_index()
        _STORE = InMemoryStore(index=index) if index is not None else InMemoryStore()
        _STORE_BACKEND = "memory"
        return _STORE


def store_backend() -> str:
    get_agent_store()
    return _STORE_BACKEND or "memory"


def put_long_term_store(
    user_id: str,
    *,
    key: str,
    kind: str,
    text: str,
    pinned: bool = False,
) -> str:
    """Write one memory document into the official Store."""
    store = get_agent_store()
    uid = (user_id or "").strip()
    mid = (key or "").strip() or f"alm_{uuid.uuid4().hex[:16]}"
    store.put(
        long_term_namespace(uid),
        mid,
        {
            "kind": (kind or "preference")[:32],
            "text": (text or "")[:2000],
            "pinned": bool(pinned),
        },
    )
    return mid


def search_long_term_store(
    user_id: str,
    *,
    query: str = "",
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Search Store namespace for this user (docs ``store.search``)."""
    store = get_agent_store()
    uid = (user_id or "").strip()
    if not uid:
        return []
    k = max(1, min(10, int(limit or 3)))
    try:
        items = store.search(
            long_term_namespace(uid),
            query=(query or "").strip() or None,
            limit=k,
        )
    except TypeError:
        items = store.search(long_term_namespace(uid), limit=k)
    except Exception:
        logger.debug("store.search failed", exc_info=True)
        return []
    out: list[dict[str, Any]] = []
    for it in items or []:
        val = getattr(it, "value", None) or {}
        if not isinstance(val, dict):
            continue
        text = str(val.get("text") or "").strip()
        if not text:
            continue
        score = getattr(it, "score", None)
        out.append(
            {
                "kind": str(val.get("kind") or "preference"),
                "text": text[:500],
                "score": float(score) if isinstance(score, (int, float)) else None,
                "retrieve": "store",
                "key": str(getattr(it, "key", "") or ""),
            }
        )
    return out


@dataclass
class AgentMemoryContext:
    """Passed to ``create_agent(..., context_schema=)`` for ToolRuntime tools."""

    user_id: str = ""


def long_term_store_tools() -> list[Any]:
    """
    Official long-term memory tools (docs: read/write via ``runtime.store``).

    Requires ``create_agent(..., store=get_agent_store(), context_schema=AgentMemoryContext)``
    and invoke with ``context=AgentMemoryContext(user_id=...)``.
    """

    @tool
    def recall_long_term_memory(
        query: str,
        runtime: ToolRuntime[AgentMemoryContext],
    ) -> str:
        """Search saved user preferences and long-term notes across sessions."""
        store = runtime.store
        if store is None:
            return "Long-term memory store unavailable."
        user_id = ""
        try:
            user_id = str(getattr(runtime.context, "user_id", "") or "")
        except Exception:
            user_id = ""
        if not user_id:
            return "Unknown user — cannot recall long-term memory."
        hits = search_long_term_store(user_id, query=query or "", limit=5)
        if not hits:
            return "No long-term memories found."
        lines = [f"- ({h.get('kind')}) {h.get('text')}" for h in hits]
        return "Long-term memories:\n" + "\n".join(lines)

    @tool
    def remember_long_term_memory(
        text: str,
        kind: str = "preference",
        runtime: ToolRuntime[AgentMemoryContext] = None,  # type: ignore[assignment]
    ) -> str:
        """Save a lasting preference or fact about the user for future sessions."""
        store = getattr(runtime, "store", None) if runtime is not None else None
        if store is None:
            store = get_agent_store()
        user_id = ""
        if runtime is not None:
            try:
                user_id = str(getattr(runtime.context, "user_id", "") or "")
            except Exception:
                user_id = ""
        body = (text or "").strip()
        if not body:
            return "Empty memory — nothing saved."
        if not user_id:
            return "Unknown user — cannot save long-term memory."
        mid = insert_long_memory(
            user_id, kind=(kind or "preference").strip() or "preference", text=body
        )
        return f"Saved long-term memory ({mid}): {body[:200]}"

    return [recall_long_term_memory, remember_long_term_memory]


_LONG_TERM_TOOL_NAMES = frozenset(
    {"recall_long_term_memory", "remember_long_term_memory"}
)


def is_long_term_tool(name: str) -> bool:
    return str(name or "").strip() in _LONG_TERM_TOOL_NAMES


def run_long_term_tool_call(
    *,
    name: str,
    arguments: str | dict[str, Any],
    user_id: str,
) -> str:
    """Execute a long-term Store tool outside ToolNode (interrupt_before path)."""
    import json as _json

    args: dict[str, Any]
    if isinstance(arguments, dict):
        args = arguments
    else:
        try:
            args = _json.loads(arguments or "{}")
        except Exception:
            args = {}
    if not isinstance(args, dict):
        args = {}
    uid = (user_id or "").strip()
    if name == "recall_long_term_memory":
        hits = search_long_term_store(
            uid, query=str(args.get("query") or ""), limit=5
        )
        if not hits:
            return "No long-term memories found."
        lines = [f"- ({h.get('kind')}) {h.get('text')}" for h in hits]
        return "Long-term memories:\n" + "\n".join(lines)
    if name == "remember_long_term_memory":
        body = str(args.get("text") or "").strip()
        kind = str(args.get("kind") or "preference").strip() or "preference"
        if not body:
            return "Empty memory — nothing saved."
        if not uid:
            return "Unknown user — cannot save long-term memory."
        mid = insert_long_memory(uid, kind=kind, text=body)
        return f"Saved long-term memory ({mid}): {body[:200]}"
    return f"Unknown long-term tool: {name}"


def embed_long_memory(memory_id: str) -> bool:
    mid = (memory_id or "").strip()
    if not mid:
        return False
    try:
        init_schema()
        with connect() as conn:
            row = conn.execute(
                "SELECT text FROM agent_long_memory WHERE id=?",
                (mid,),
            ).fetchone()
            if not row:
                return False
            vec = get_text_embeddings().embed_query_raw(str(row["text"] or ""))
            if vec is None:
                conn.execute(
                    """
                    UPDATE agent_long_memory
                    SET embed_status='failed', updated_at=?
                    WHERE id=?
                    """,
                    (time.time(), mid),
                )
                conn.commit()
                return False
            from services.design.aesthetics.clip_encoder import EMB_DIM, MODEL_ID

            conn.execute(
                """
                UPDATE agent_long_memory
                SET emb=?, emb_dim=?, emb_model=?, embed_status='ready',
                    score=1.0, updated_at=?
                WHERE id=?
                """,
                (pack_vec(vec), int(EMB_DIM), MODEL_ID, time.time(), mid),
            )
            conn.commit()
        return True
    except Exception:
        logger.exception("embed_long_memory failed id=%s", mid)
        return False


def schedule_embed_long_memory(memory_id: str) -> None:
    mid = (memory_id or "").strip()
    if not mid:
        return
    schedule_background(f"long-embed-{mid[:12]}", lambda: embed_long_memory(mid))


def list_long_hits(
    user_id: str,
    *,
    rules: dict[str, str],
    query: str = "",
) -> list[dict[str, Any]]:
    if not _rule_on(rules, "memory.long.enabled", "1"):
        return []
    k = _top_k(rules)
    if k <= 0:
        return []
    uid = (user_id or "").strip()
    if not uid:
        return []

    # Official LangGraph Store first (cross-thread long-term memory).
    store_hits = search_long_term_store(uid, query=query or "", limit=k)
    if len(store_hits) >= k:
        return store_hits[:k]

    init_schema()
    mode = retrieve_mode(rules, "memory.long.retrieve", "embedding")
    legacy: list[dict[str, Any]] = []
    if mode == "embedding" and (query or "").strip():
        got = _list_long_by_embedding(uid, query.strip(), k)
        if got is not None:
            legacy = got
    if not legacy:
        legacy = _list_long_recency(uid, k)

    # Prefer store docs, then fill from legacy table (dedupe by text).
    seen = {str(h.get("text") or "") for h in store_hits}
    out = list(store_hits)
    for h in legacy:
        t = str(h.get("text") or "")
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(h)
        if len(out) >= k:
            break
    return out[:k]


def _list_long_recency(uid: str, k: int) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT kind, text, score, updated_at, pinned
            FROM agent_long_memory
            WHERE user_id = ? AND status = 'active'
            ORDER BY pinned DESC, updated_at DESC
            LIMIT ?
            """,
            (uid, k),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        text = str(r["text"] or "").strip()
        if not text:
            continue
        out.append(
            {
                "kind": str(r["kind"] or "preference"),
                "text": text[:500],
                "score": float(r["score"]) if r["score"] is not None else None,
                "retrieve": "recency",
            }
        )
    return out


def _list_long_by_embedding(
    uid: str, query: str, k: int
) -> list[dict[str, Any]] | None:
    qvec = get_text_embeddings().embed_query_raw(query)
    if qvec is None:
        return None
    with connect() as conn:
        # Pinned always preferred; then rank ready embeddings.
        rows = conn.execute(
            """
            SELECT id, kind, text, score, updated_at, pinned, emb, embed_status
            FROM agent_long_memory
            WHERE user_id = ? AND status = 'active'
            ORDER BY pinned DESC, updated_at DESC
            LIMIT 200
            """,
            (uid,),
        ).fetchall()

    pinned: list[dict[str, Any]] = []
    scored: list[tuple[float, Any]] = []
    pending: list[str] = []
    for r in rows:
        text = str(r["text"] or "").strip()
        if not text:
            continue
        if int(r["pinned"] or 0):
            pinned.append(
                {
                    "kind": str(r["kind"] or "preference"),
                    "text": text[:500],
                    "score": 1.0,
                    "retrieve": "pinned",
                }
            )
            continue
        status = str(r["embed_status"] or "")
        vec = unpack_vec(r["emb"]) if status == "ready" else None
        if vec is None:
            if status in ("pending", "", "failed"):
                pending.append(str(r["id"] or ""))
            continue
        scored.append((cosine(qvec, vec), r))

    for mid in pending[:3]:
        schedule_embed_long_memory(mid)

    if not scored and not pinned:
        return None

    scored.sort(key=lambda x: -x[0])
    out = list(pinned[:k])
    for sim, r in scored:
        if len(out) >= k:
            break
        text = str(r["text"] or "").strip()
        out.append(
            {
                "kind": str(r["kind"] or "preference"),
                "text": text[:500],
                "score": round(float(sim), 4),
                "retrieve": "embedding",
            }
        )
    return out


def insert_long_memory(
    user_id: str,
    *,
    kind: str,
    text: str,
    pinned: bool = False,
) -> str:
    init_schema()
    mid = f"alm_{uuid.uuid4().hex[:16]}"
    now = time.time()
    uid = (user_id or "").strip()
    body = (text or "")[:2000]
    kind_s = (kind or "preference")[:32]
    with connect() as conn:
        # emb cols may be missing on very old DBs until init_schema alters them.
        try:
            conn.execute(
                """
                INSERT INTO agent_long_memory (
                    id, user_id, kind, text, status, pinned, score,
                    emb, emb_dim, emb_model, embed_status,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'active', ?, 1.0, NULL, 0, '', 'pending', ?, ?)
                """,
                (mid, uid, kind_s, body, 1 if pinned else 0, now, now),
            )
        except Exception:
            conn.execute(
                """
                INSERT INTO agent_long_memory (
                    id, user_id, kind, text, status, pinned, score, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'active', ?, 1.0, ?, ?)
                """,
                (mid, uid, kind_s, body, 1 if pinned else 0, now, now),
            )
        conn.commit()
    schedule_embed_long_memory(mid)
    # Official Store mirror (docs long-term memory).
    try:
        put_long_term_store(
            uid, key=mid, kind=kind_s, text=body, pinned=pinned
        )
    except Exception:
        logger.warning("Store put failed for %s", mid, exc_info=True)
    return mid
