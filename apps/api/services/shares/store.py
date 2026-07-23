"""Document shares — preview/edit links."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from services.db import connect, init_schema

_MAX_DOC_BYTES = 12 * 1024 * 1024
_PERMISSIONS = frozenset({"preview", "edit"})


class ShareError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _row_to_share(row: Any, *, include_document: bool = True) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row["id"],
        "ownerId": row["owner_id"],
        "name": row["name"],
        "permission": row["permission"],
        "sourceProjectId": row["source_project_id"],
        "createdAt": int(float(row["created_at"]) * 1000),
        "updatedAt": int(float(row["updated_at"]) * 1000),
    }
    if include_document:
        try:
            out["document"] = json.loads(row["document_json"])
        except (TypeError, json.JSONDecodeError):
            out["document"] = None
    return out


def create_share(
    *,
    owner_id: str,
    name: str,
    permission: str,
    document: dict[str, Any],
    source_project_id: str | None = None,
) -> dict[str, Any]:
    init_schema()
    uid = (owner_id or "").strip()
    if not uid:
        raise ShareError("invalid_owner", "owner is required")
    perm = (permission or "preview").strip().lower()
    if perm not in _PERMISSIONS:
        raise ShareError("invalid_permission", "permission must be preview or edit")
    if not isinstance(document, dict):
        raise ShareError("invalid_document", "document must be an object")
    title = (name or "").strip() or "Untitled"
    if len(title) > 255:
        title = title[:255]
    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    if len(raw.encode("utf-8")) > _MAX_DOC_BYTES:
        raise ShareError("document_too_large", "Document is too large to share")
    src = (source_project_id or "").strip() or None
    now = time.time()
    sid = f"share_{uuid.uuid4().hex[:16]}"
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO document_shares (
                id, owner_id, name, permission, document_json,
                source_project_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (sid, uid, title, perm, raw, src, now, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM document_shares WHERE id = ?",
            (sid,),
        ).fetchone()
    return _row_to_share(row)


def get_share(share_id: str) -> dict[str, Any] | None:
    init_schema()
    sid = (share_id or "").strip()
    if not sid:
        return None
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM document_shares WHERE id = ?",
            (sid,),
        ).fetchone()
    if not row:
        return None
    return _row_to_share(row)


def update_share_document(
    share_id: str,
    document: dict[str, Any],
    *,
    actor_user_id: str | None = None,
) -> dict[str, Any]:
    """
    Update shared document.
    - permission=edit: signed-in user required (any account with the link)
    - permission=preview: owner only
    """
    init_schema()
    sid = (share_id or "").strip()
    if not sid:
        raise ShareError("not_found", "Share not found")
    if not isinstance(document, dict):
        raise ShareError("invalid_document", "document must be an object")
    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    if len(raw.encode("utf-8")) > _MAX_DOC_BYTES:
        raise ShareError("document_too_large", "Document is too large")
    now = time.time()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM document_shares WHERE id = ?",
            (sid,),
        ).fetchone()
        if not row:
            raise ShareError("not_found", "Share not found")
        perm = (row["permission"] or "preview").strip().lower()
        owner_id = str(row["owner_id"] or "")
        actor = (actor_user_id or "").strip()
        if perm == "edit":
            if not actor:
                raise ShareError("unauthorized", "Sign in required to edit this share")
        else:
            if not actor or actor != owner_id:
                raise ShareError("forbidden", "Only the owner can update this share")
        conn.execute(
            """
            UPDATE document_shares
            SET document_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (raw, now, sid),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM document_shares WHERE id = ?",
            (sid,),
        ).fetchone()
    return _row_to_share(row)
