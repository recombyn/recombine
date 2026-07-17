"""User projects — metadata in DB, large documents in COS when enabled."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from services.db import connect, init_schema
from services.storage import get_storage, put_bytes, get_bytes, delete_object

_MAX_INLINE_BYTES = 512 * 1024  # store in DB if small; else COS


def list_projects(user_id: str) -> list[dict[str, Any]]:
    init_schema()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, name, thumbnail_key, document_key, document_json, updated_at, created_at
            FROM projects
            WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT 200
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "thumbnailUrl": _url(r["thumbnail_key"]),
            "updatedAt": int(float(r["updated_at"]) * 1000),
            "createdAt": int(float(r["created_at"]) * 1000),
            "hasDocument": bool(r["document_key"] or r["document_json"]),
        }
        for r in rows
    ]


def get_project(user_id: str, project_id: str) -> dict[str, Any] | None:
    init_schema()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, name, thumbnail_key, document_key, document_json, updated_at, created_at
            FROM projects WHERE id = ? AND user_id = ?
            """,
            (project_id, user_id),
        ).fetchone()
    if not row:
        return None
    document = None
    if row["document_json"]:
        try:
            document = json.loads(row["document_json"])
        except json.JSONDecodeError:
            document = None
    elif row["document_key"]:
        raw = get_bytes(row["document_key"])
        if raw:
            try:
                document = json.loads(raw.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                document = None
    return {
        "id": row["id"],
        "name": row["name"],
        "thumbnailUrl": _url(row["thumbnail_key"]),
        "document": document,
        "updatedAt": int(float(row["updated_at"]) * 1000),
        "createdAt": int(float(row["created_at"]) * 1000),
    }


def upsert_project(
    user_id: str,
    *,
    project_id: str | None,
    name: str,
    document: dict[str, Any] | None,
    thumbnail_data_url: str | None = None,
) -> dict[str, Any]:
    init_schema()
    pid = (project_id or "").strip() or f"proj_{uuid.uuid4().hex[:16]}"
    name_n = (name or "").strip()[:255] or "Untitled"
    now = time.time()
    storage = get_storage()

    doc_json: str | None = None
    doc_key: str | None = None
    if document is not None:
        raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
        encoded = raw.encode("utf-8")
        if storage.enabled_remote() and len(encoded) > _MAX_INLINE_BYTES:
            doc_key = f"projects/{user_id}/{pid}/document.json"
            put_bytes(doc_key, encoded, content_type="application/json")
            doc_json = None
        else:
            doc_json = raw
            doc_key = None

    thumb_key: str | None = None
    if thumbnail_data_url and thumbnail_data_url.startswith("data:image/"):
        try:
            import base64

            header, b64 = thumbnail_data_url.split(",", 1)
            ext = "png" if "png" in header else "jpg"
            blob = base64.b64decode(b64)
            thumb_key = f"projects/{user_id}/{pid}/thumb.{ext}"
            put_bytes(thumb_key, blob, content_type=f"image/{ext}")
        except Exception:
            thumb_key = None

    with connect() as conn:
        existing = conn.execute(
            "SELECT id, created_at, document_key, thumbnail_key FROM projects WHERE id = ? AND user_id = ?",
            (pid, user_id),
        ).fetchone()
        if existing:
            # Keep previous keys if not replaced
            next_doc_key = doc_key if document is not None else existing["document_key"]
            next_doc_json = doc_json if document is not None else None
            if document is not None and doc_json is not None:
                next_doc_key = None
            next_thumb = thumb_key or existing["thumbnail_key"]
            # Drop stale COS object when switching to inline
            if (
                document is not None
                and existing["document_key"]
                and existing["document_key"] != next_doc_key
            ):
                delete_object(existing["document_key"])
            conn.execute(
                """
                UPDATE projects
                SET name = ?, thumbnail_key = ?, document_key = ?,
                    document_json = COALESCE(?, document_json), updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (
                    name_n,
                    next_thumb,
                    next_doc_key,
                    next_doc_json if document is not None else None,
                    now,
                    pid,
                    user_id,
                ),
            )
            # If we store in COS, clear inline json
            if document is not None and next_doc_key:
                conn.execute(
                    "UPDATE projects SET document_json = NULL WHERE id = ?",
                    (pid,),
                )
            elif document is not None and next_doc_json is not None:
                conn.execute(
                    "UPDATE projects SET document_json = ?, document_key = NULL WHERE id = ?",
                    (next_doc_json, pid),
                )
            created = float(existing["created_at"])
        else:
            conn.execute(
                """
                INSERT INTO projects (
                    id, user_id, name, thumbnail_key, document_key, document_json,
                    updated_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (pid, user_id, name_n, thumb_key, doc_key, doc_json, now, now),
            )
            created = now

    return {
        "id": pid,
        "name": name_n,
        "thumbnailUrl": _url(thumb_key),
        "updatedAt": int(now * 1000),
        "createdAt": int(created * 1000),
    }


def delete_project(user_id: str, project_id: str) -> bool:
    init_schema()
    with connect() as conn:
        row = conn.execute(
            "SELECT document_key, thumbnail_key FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
    if row["document_key"]:
        delete_object(row["document_key"])
    if row["thumbnail_key"]:
        delete_object(row["thumbnail_key"])
    return True


def _url(key: str | None) -> str | None:
    if not key:
        return None
    return get_storage().url_for(key)
