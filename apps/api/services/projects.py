"""User projects — metadata in DB, large documents in COS when enabled."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from services.db import connect, init_schema
from services.storage import get_storage, put_bytes, get_bytes, delete_object

_MAX_INLINE_BYTES = 512 * 1024  # store in DB if small; else COS

_CANVAS_META_KEYS = (
    "x",
    "y",
    "width",
    "height",
    "backgroundColor",
    "backgroundFillType",
    "backgroundGradient",
    "backgroundOpacity",
    "backgroundImageSrc",
    "backgroundImageFit",
    "backgroundImageRotate",
    "backgroundImageAdjust",
)


class ProjectConflictError(Exception):
    """Optimistic concurrency failure — client baseRevision != server revision."""

    def __init__(self, *, project_id: str, revision: int, updated_at_ms: int):
        super().__init__("project_revision_conflict")
        self.project_id = project_id
        self.revision = revision
        self.updated_at_ms = updated_at_ms


class ProjectNotFoundError(Exception):
    def __init__(self, project_id: str):
        super().__init__("project_not_found")
        self.project_id = project_id


def _decode_document_row(row: Any) -> dict[str, Any] | None:
    if row["document_json"]:
        try:
            doc = json.loads(row["document_json"])
            return doc if isinstance(doc, dict) else None
        except json.JSONDecodeError:
            return None
    if row["document_key"]:
        raw = get_bytes(row["document_key"])
        if raw:
            try:
                doc = json.loads(raw.decode("utf-8"))
                return doc if isinstance(doc, dict) else None
            except (json.JSONDecodeError, UnicodeDecodeError):
                return None
    return None


def _encode_document(
    user_id: str, project_id: str, document: dict[str, Any]
) -> tuple[str | None, str | None]:
    """Return (document_json, document_key) — one of them set."""
    storage = get_storage()
    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    encoded = raw.encode("utf-8")
    if storage.enabled_remote() and len(encoded) > _MAX_INLINE_BYTES:
        doc_key = f"projects/{user_id}/{project_id}/document.json"
        put_bytes(doc_key, encoded, content_type="application/json")
        return None, doc_key
    return raw, None


def _thumb_key_from_data_url(
    user_id: str, project_id: str, data_url: str | None, *, index: int = 0
) -> str | None:
    if not data_url or not data_url.startswith("data:image/"):
        return None
    try:
        import base64
        import time

        header, b64 = data_url.split(",", 1)
        h = header.lower()
        if "webp" in h:
            ext, content_type = "webp", "image/webp"
        elif "png" in h:
            ext, content_type = "png", "image/png"
        else:
            ext, content_type = "jpg", "image/jpeg"
        blob = base64.b64decode(b64)
        # Unique key per upload so CDN/browser never serve a stale thumb.webp.
        stamp = int(time.time() * 1000)
        suffix = f"-{index}" if index else ""
        thumb_key = f"projects/{user_id}/{project_id}/thumb-{stamp}{suffix}.{ext}"
        put_bytes(
            thumb_key,
            blob,
            content_type=content_type,
            cache_control="no-cache, max-age=0, must-revalidate",
        )
        return thumb_key
    except Exception:
        return None


def _row_thumb_custom(row: Any) -> bool:
    try:
        return bool(int(row["thumbnail_custom"] or 0))
    except (KeyError, TypeError, ValueError):
        return False


def _parse_thumb_entries(raw: str | None) -> list[str]:
    """Decode thumbnail_key — JSON array or legacy single COS key / URL."""
    text = (raw or "").strip()
    if not text:
        return []
    if text.startswith("["):
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, list):
            out: list[str] = []
            for item in parsed:
                s = str(item or "").strip()
                if s and s not in out:
                    out.append(s)
                if len(out) >= 4:
                    break
            return out
    return [text]


def _encode_thumb_entries(entries: list[str] | None) -> str | None:
    cleaned: list[str] = []
    for item in entries or []:
        s = str(item or "").strip()
        if s and s not in cleaned:
            cleaned.append(s)
        if len(cleaned) >= 4:
            break
    if not cleaned:
        return None
    if len(cleaned) == 1:
        return cleaned[0]
    return json.dumps(cleaned, ensure_ascii=False)


def _is_project_owned_thumb_key(entry: str) -> bool:
    text = (entry or "").strip()
    if not text or text.startswith("http://") or text.startswith("https://"):
        return False
    return text.startswith("projects/") and "/thumb" in text


def _delete_thumb_entries(raw: str | None) -> None:
    for entry in _parse_thumb_entries(raw):
        if _is_project_owned_thumb_key(entry):
            try:
                delete_object(entry)
            except Exception:
                pass


def _thumbnail_urls_out(raw: str | None) -> list[str]:
    """Public list of cover URLs (always an array for C-end collage)."""
    out: list[str] = []
    for entry in _parse_thumb_entries(raw):
        url = _url(entry)
        if url:
            out.append(url)
    return out


def _normalize_incoming_urls(urls: list[str] | None) -> list[str]:
    out: list[str] = []
    for item in urls or []:
        s = str(item or "").strip()
        if not s or s.startswith("data:"):
            continue
        if s not in out:
            out.append(s)
        if len(out) >= 4:
            break
    return out


def _next_thumbnail(
    user_id: str,
    project_id: str,
    thumbnail_data_url: str | None,
    existing_key: str | None,
    *,
    existing_custom: bool,
    mark_custom: bool | None,
    thumbnail_data_urls: list[str] | None = None,
    thumbnail_urls: list[str] | None = None,
) -> tuple[str | None, bool]:
    """Resolve next thumbnail_key (+ JSON array) and custom flag.

    Priority: hosted ``thumbnail_urls`` → raster ``thumbnail_data_urls`` /
    ``thumbnail_data_url`` → keep existing.
    """
    hosted = _normalize_incoming_urls(thumbnail_urls)
    if hosted:
        _delete_thumb_entries(existing_key)
        custom = True if mark_custom is True else False
        encoded = _encode_thumb_entries(hosted)
        print(
            f"[projects.thumb] urls ok project={project_id} "
            f"n={len(hosted)} custom={custom}",
            flush=True,
        )
        return encoded, custom

    data_list = [
        str(x).strip()
        for x in (thumbnail_data_urls or [])
        if str(x or "").strip().startswith("data:image/")
    ]
    if not data_list and thumbnail_data_url:
        one = str(thumbnail_data_url).strip()
        if one.startswith("data:image/"):
            data_list = [one]

    if data_list:
        uploaded: list[str] = []
        for i, data_url in enumerate(data_list[:4]):
            key = _thumb_key_from_data_url(user_id, project_id, data_url, index=i)
            if key:
                uploaded.append(key)
        if uploaded:
            _delete_thumb_entries(existing_key)
            custom = True if mark_custom is True else False
            encoded = _encode_thumb_entries(uploaded)
            print(
                f"[projects.thumb] upload ok project={project_id} "
                f"n={len(uploaded)} custom={custom} prev_custom={existing_custom}",
                flush=True,
            )
            return encoded, custom

    # No new bytes — keep key; explicit False clears the custom lock.
    if mark_custom is False:
        print(
            f"[projects.thumb] keep key, clear custom project={project_id} key={existing_key}",
            flush=True,
        )
        return existing_key, False
    if existing_custom and (thumbnail_data_url or thumbnail_data_urls or thumbnail_urls):
        print(
            f"[projects.thumb] payload rejected project={project_id} keep={existing_key}",
            flush=True,
        )
    return existing_key, bool(existing_custom)


def _ensure_delta_root(doc: dict[str, Any]) -> dict[str, Any]:
    delta = doc.get("deltaSetLike")
    if not isinstance(delta, dict):
        delta = {}
        doc["deltaSetLike"] = delta
    if "ROOT" not in delta or not isinstance(delta.get("ROOT"), dict):
        delta["ROOT"] = {"id": "ROOT", "key": "entry", "children": []}
    return delta


def _apply_remove_nodes(delta: dict[str, Any], remove_ids: Any) -> None:
    if not isinstance(remove_ids, list):
        return
    for nid in remove_ids:
        sid = str(nid or "").strip()
        if not sid or sid == "ROOT":
            continue
        delta.pop(sid, None)


def _apply_upsert_nodes(delta: dict[str, Any], upsert: Any) -> None:
    if not isinstance(upsert, dict):
        return
    for nid, node in upsert.items():
        sid = str(nid or "").strip()
        if not sid or sid == "ROOT":
            continue
        if isinstance(node, dict):
            delta[sid] = node


def _normalize_page_children(raw_children: Any, delta: dict[str, Any]) -> list[str]:
    children: list[str] = []
    if not isinstance(raw_children, list):
        return children
    seen: set[str] = set()
    for c in raw_children:
        cid = str(c or "").strip()
        if not cid or cid == "ROOT" or cid in seen or cid not in delta:
            continue
        seen.add(cid)
        children.append(cid)
    return children


def _apply_page_children(doc: dict[str, Any], delta: dict[str, Any], patch: dict[str, Any]) -> None:
    if "pageChildren" not in patch or patch["pageChildren"] is None:
        return
    children = _normalize_page_children(patch["pageChildren"], delta)
    pages = doc.get("pages")
    if not isinstance(pages, list) or not pages:
        pages = [{"id": "page_1", "children": children}]
        doc["pages"] = pages
    else:
        page0 = pages[0] if isinstance(pages[0], dict) else {"id": "page_1"}
        page0 = {**page0, "children": children}
        pages = [page0, *[p for p in pages[1:] if isinstance(p, dict)]]
        doc["pages"] = pages
    doc["activePageId"] = str(pages[0].get("id") or "page_1")
    root = delta.get("ROOT")
    if isinstance(root, dict):
        root["children"] = list(children)
        delta["ROOT"] = root


def _apply_frames_patch(doc: dict[str, Any], patch: dict[str, Any]) -> None:
    if "frames" in patch and patch["frames"] is not None:
        frames = patch["frames"]
        doc["frames"] = frames if isinstance(frames, list) else []
    if "activeFrameId" in patch:
        af = patch["activeFrameId"]
        doc["activeFrameId"] = None if af is None else str(af)


def _apply_canvas_meta(doc: dict[str, Any], patch: dict[str, Any]) -> None:
    canvas = patch.get("canvas")
    if not isinstance(canvas, dict):
        return
    for key in _CANVAS_META_KEYS:
        if key in canvas:
            doc[key] = canvas[key]


def apply_document_patch(base: dict[str, Any] | None, patch: dict[str, Any]) -> dict[str, Any]:
    """Merge node-level patch into a document dict (mutates a shallow copy tree)."""
    import copy

    doc: dict[str, Any] = copy.deepcopy(base) if isinstance(base, dict) else {}
    delta = _ensure_delta_root(doc)
    _apply_remove_nodes(delta, patch.get("removeNodeIds") or [])
    _apply_upsert_nodes(delta, patch.get("upsertNodes") or {})
    _apply_page_children(doc, delta, patch)
    _apply_frames_patch(doc, patch)
    _apply_canvas_meta(doc, patch)
    return doc


def patch_project(
    user_id: str,
    project_id: str,
    *,
    name: str | None = None,
    patch: dict[str, Any],
    thumbnail_data_url: str | None = None,
    thumbnail_data_urls: list[str] | None = None,
    thumbnail_urls: list[str] | None = None,
    thumbnail_custom: bool | None = None,
    base_revision: int | None = None,
) -> dict[str, Any]:
    """Apply incremental document patch under optimistic concurrency."""
    init_schema()
    pid = (project_id or "").strip()
    if not pid:
        raise ProjectNotFoundError("")
    now = time.time()

    with connect() as conn:
        existing = conn.execute(
            """
            SELECT id, name, created_at, document_key, document_json, thumbnail_key,
                   thumbnail_custom, revision, updated_at
            FROM projects WHERE id = ? AND user_id = ?
            """,
            (pid, user_id),
        ).fetchone()
        if not existing:
            raise ProjectNotFoundError(pid)

        cur_rev = int(existing["revision"] or 1)
        if base_revision is None or int(base_revision) != cur_rev:
            raise ProjectConflictError(
                project_id=pid,
                revision=cur_rev,
                updated_at_ms=int(float(existing["updated_at"]) * 1000),
            )

        base_doc = _decode_document_row(existing)
        # Never merge onto an empty shell when the row claims to have a document —
        # that would wipe the canvas (e.g. COS read blip). Force client full PUT.
        if base_doc is None and (existing["document_json"] or existing["document_key"]):
            raise ProjectConflictError(
                project_id=pid,
                revision=cur_rev,
                updated_at_ms=int(float(existing["updated_at"]) * 1000),
            )
        merged = apply_document_patch(base_doc, patch or {})
        doc_json, doc_key = _encode_document(user_id, pid, merged)
        next_rev = cur_rev + 1
        name_n = (
            (name or "").strip()[:255]
            if name is not None and str(name).strip()
            else str(existing["name"] or "Untitled")
        )
        thumb_key, thumb_custom = _next_thumbnail(
            user_id,
            pid,
            thumbnail_data_url,
            existing["thumbnail_key"],
            existing_custom=_row_thumb_custom(existing),
            mark_custom=thumbnail_custom,
            thumbnail_data_urls=thumbnail_data_urls,
            thumbnail_urls=thumbnail_urls,
        )
        old_key = existing["document_key"]
        created_at = float(existing["created_at"])

        updated = conn.execute(
            """
            UPDATE projects
            SET name = ?, thumbnail_key = ?, thumbnail_custom = ?, document_key = ?,
                document_json = ?, revision = ?, updated_at = ?
            WHERE id = ? AND user_id = ? AND revision = ?
            """,
            (
                name_n,
                thumb_key,
                1 if thumb_custom else 0,
                doc_key,
                doc_json,
                next_rev,
                now,
                pid,
                user_id,
                cur_rev,
            ),
        )
        if int(getattr(updated, "rowcount", 0) or 0) == 0:
            latest = conn.execute(
                """
                SELECT revision, updated_at FROM projects
                WHERE id = ? AND user_id = ?
                """,
                (pid, user_id),
            ).fetchone()
            raise ProjectConflictError(
                project_id=pid,
                revision=int((latest and latest["revision"]) or cur_rev),
                updated_at_ms=int(
                    float((latest and latest["updated_at"]) or existing["updated_at"]) * 1000
                ),
            )

    if old_key and old_key != doc_key:
        delete_object(old_key)

    return {
        "id": pid,
        "name": name_n,
        "thumbnailUrl": _thumbnail_urls_out(thumb_key),
        "thumbnailCustom": bool(thumb_custom),
        "revision": next_rev,
        "updatedAt": int(now * 1000),
        "createdAt": int(created_at * 1000),
    }


def list_projects(
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 24,
) -> dict[str, Any]:
    init_schema()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 24), 100))
    offset = (page_n - 1) * page_size_n
    with connect() as conn:
        total_row = conn.execute(
            "SELECT COUNT(*) AS c FROM projects WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            """
            SELECT id, name, thumbnail_key, thumbnail_custom, document_key, document_json,
                   revision, updated_at, created_at
            FROM projects
            WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, page_size_n, offset),
        ).fetchall()
    projects = [
        {
            "id": r["id"],
            "name": r["name"],
            "thumbnailUrl": _thumbnail_urls_out(r["thumbnail_key"]),
            "thumbnailCustom": _row_thumb_custom(r),
            "revision": int(r["revision"] or 1),
            "updatedAt": int(float(r["updated_at"]) * 1000),
            "createdAt": int(float(r["created_at"]) * 1000),
            "hasDocument": bool(r["document_key"] or r["document_json"]),
        }
        for r in rows
    ]
    return {
        "projects": projects,
        "page": page_n,
        "pageSize": page_size_n,
        "total": total,
        "hasMore": offset + len(projects) < total,
    }


def get_project(user_id: str, project_id: str) -> dict[str, Any] | None:
    init_schema()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, name, thumbnail_key, thumbnail_custom, document_key, document_json,
                   revision, updated_at, created_at
            FROM projects WHERE id = ? AND user_id = ?
            """,
            (project_id, user_id),
        ).fetchone()
    if not row:
        return None
    document = _decode_document_row(row)
    return {
        "id": row["id"],
        "name": row["name"],
        "thumbnailUrl": _thumbnail_urls_out(row["thumbnail_key"]),
        "thumbnailCustom": _row_thumb_custom(row),
        "document": document,
        "revision": int(row["revision"] or 1),
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
    thumbnail_data_urls: list[str] | None = None,
    thumbnail_urls: list[str] | None = None,
    thumbnail_custom: bool | None = None,
    base_revision: int | None = None,
) -> dict[str, Any]:
    init_schema()
    pid = (project_id or "").strip() or f"proj_{uuid.uuid4().hex[:16]}"
    name_n = (name or "").strip()[:255] or "Untitled"
    now = time.time()

    doc_json: str | None = None
    doc_key: str | None = None
    if document is not None:
        doc_json, doc_key = _encode_document(user_id, pid, document)

    with connect() as conn:
        existing = conn.execute(
            """
            SELECT id, created_at, document_key, thumbnail_key, thumbnail_custom,
                   revision, updated_at
            FROM projects WHERE id = ? AND user_id = ?
            """,
            (pid, user_id),
        ).fetchone()
        if existing:
            cur_rev = int(existing["revision"] or 1)
            # Optimistic lock: when client sends baseRevision, it must match.
            if base_revision is not None and int(base_revision) != cur_rev:
                raise ProjectConflictError(
                    project_id=pid,
                    revision=cur_rev,
                    updated_at_ms=int(float(existing["updated_at"]) * 1000),
                )
            next_rev = cur_rev + 1
            # Keep previous keys if not replaced
            next_doc_key = doc_key if document is not None else existing["document_key"]
            next_doc_json = doc_json if document is not None else None
            if document is not None and doc_json is not None:
                next_doc_key = None
            next_thumb, next_custom = _next_thumbnail(
                user_id,
                pid,
                thumbnail_data_url,
                existing["thumbnail_key"],
                existing_custom=_row_thumb_custom(existing),
                mark_custom=thumbnail_custom,
                thumbnail_data_urls=thumbnail_data_urls,
                thumbnail_urls=thumbnail_urls,
            )
            # Drop stale COS object when switching to inline
            if (
                document is not None
                and existing["document_key"]
                and existing["document_key"] != next_doc_key
            ):
                delete_object(existing["document_key"])
            # Atomic optimistic lock: bump only if revision still matches.
            updated = conn.execute(
                """
                UPDATE projects
                SET name = ?, thumbnail_key = ?, thumbnail_custom = ?, document_key = ?,
                    document_json = COALESCE(?, document_json),
                    revision = ?, updated_at = ?
                WHERE id = ? AND user_id = ? AND revision = ?
                """,
                (
                    name_n,
                    next_thumb,
                    1 if next_custom else 0,
                    next_doc_key,
                    next_doc_json if document is not None else None,
                    next_rev,
                    now,
                    pid,
                    user_id,
                    cur_rev,
                ),
            )
            if int(getattr(updated, "rowcount", 0) or 0) == 0:
                latest = conn.execute(
                    """
                    SELECT revision, updated_at FROM projects
                    WHERE id = ? AND user_id = ?
                    """,
                    (pid, user_id),
                ).fetchone()
                raise ProjectConflictError(
                    project_id=pid,
                    revision=int((latest and latest["revision"]) or cur_rev),
                    updated_at_ms=int(
                        float((latest and latest["updated_at"]) or existing["updated_at"])
                        * 1000
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
            revision = next_rev
            thumb_key = next_thumb
            thumb_custom = next_custom
        else:
            thumb_key, thumb_custom = _next_thumbnail(
                user_id,
                pid,
                thumbnail_data_url,
                None,
                existing_custom=False,
                mark_custom=thumbnail_custom,
                thumbnail_data_urls=thumbnail_data_urls,
                thumbnail_urls=thumbnail_urls,
            )
            conn.execute(
                """
                INSERT INTO projects (
                    id, user_id, name, thumbnail_key, thumbnail_custom, document_key, document_json,
                    revision, updated_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    pid,
                    user_id,
                    name_n,
                    thumb_key,
                    1 if thumb_custom else 0,
                    doc_key,
                    doc_json,
                    now,
                    now,
                ),
            )
            created = now
            revision = 1

    return {
        "id": pid,
        "name": name_n,
        "thumbnailUrl": _thumbnail_urls_out(thumb_key),
        "thumbnailCustom": bool(thumb_custom),
        "revision": revision,
        "updatedAt": int(now * 1000),
        "createdAt": int(created * 1000),
    }


def delete_project(user_id: str, project_id: str) -> bool:
    return delete_projects(user_id, [project_id]) > 0


def delete_projects(user_id: str, project_ids: list[str]) -> int:
    """Delete many projects owned by user. Returns number deleted."""
    init_schema()
    ids = [str(x).strip() for x in (project_ids or []) if str(x).strip()]
    # Dedupe while preserving order
    seen: set[str] = set()
    uniq: list[str] = []
    for pid in ids:
        if pid in seen:
            continue
        seen.add(pid)
        uniq.append(pid)
    if not uniq:
        return 0

    deleted = 0
    with connect() as conn:
        for pid in uniq:
            row = conn.execute(
                """
                SELECT document_key, thumbnail_key FROM projects
                WHERE id = ? AND user_id = ?
                """,
                (pid, user_id),
            ).fetchone()
            if not row:
                continue
            conn.execute(
                "DELETE FROM projects WHERE id = ? AND user_id = ?",
                (pid, user_id),
            )
            deleted += 1
            if row["document_key"]:
                delete_object(row["document_key"])
            _delete_thumb_entries(row["thumbnail_key"])
    return deleted


def _url(key: str | None) -> str | None:
    if not key:
        return None
    text = str(key).strip()
    if not text:
        return None
    # Already a public / absolute URL (image-node collage tiles).
    if text.startswith("http://") or text.startswith("https://") or text.startswith("/"):
        return text
    # JSON array stored by mistake in a single-key call site.
    if text.startswith("["):
        urls = _thumbnail_urls_out(text)
        return urls[0] if urls else None
    storage = get_storage()
    # Local disk keys need the authenticated download route (not a bare relative path).
    if not storage.enabled_remote():
        return f"/api/v1/uploads/files/{text}"
    return storage.url_for(text)
