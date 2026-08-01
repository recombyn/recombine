"""Aesthetic quality samples for CLIP RAG (MySQL BLOB embeddings + WebP thumbs)."""

from __future__ import annotations

import base64
import json
import threading
import time
from typing import Any

from services.db import connect
from services.design.admin.blob_codec import (
    make_webp_thumb,
    origin_key_from_url,
    pack_emb_blob,
    thumb_data_url,
    unpack_emb_blob,
)
from services.design.readpath.catalog import ensure_design_catalog

SCENES = frozenset({"website", "mobile", "image", "poster", "drawing"})
GRADES = frozenset({"good", "ok", "bad"})
EMBED_STATUSES = frozenset({"pending", "ready", "failed", "skipped"})
# Minimum ready+good samples recommended per scene for pre-draw aesthetics.
MIN_GOOD_READY_PER_SCENE = 2
# When exact scene corpus is empty, borrow from these scenes (order = preference).
SCENE_FALLBACK: dict[str, tuple[str, ...]] = {
    "website": ("mobile", "poster", "image", "drawing"),
    "mobile": ("website", "poster", "image", "drawing"),
    "poster": ("mobile", "website", "image", "drawing"),
    "image": ("poster", "mobile", "website", "drawing"),
    "drawing": ("image", "poster", "mobile", "website"),
}

_CORE_COLS = (
    "id, name, scene, grade, tags, comment_text, image_url, "
    "layout_emb, color_emb, aesthetic_emb, emb_dim, emb_model, "
    "embed_status, embed_error, enabled, meta_json, created_at, updated_at"
)
_MEDIA_COLS = "origin_path, thumb_webp"
_READY_CORE_COLS = (
    "id, name, scene, grade, tags, comment_text, image_url, "
    "layout_emb, color_emb, aesthetic_emb, emb_dim"
)

# Process-level cache for list_ready_embeddings (invalidated on writes).
_CORPUS_TTL_SEC = 180.0
_corpus_lock = threading.Lock()
_corpus_cache: dict[tuple[Any, ...], tuple[float, list[dict[str, Any]]]] = {}
# None = unknown; True/False after first successful/failed SELECT with media cols.
_media_cols_ok: bool | None = None


def invalidate_embedding_corpus_cache() -> None:
    with _corpus_lock:
        _corpus_cache.clear()


def _mark_media_cols(ok: bool) -> None:
    global _media_cols_ok
    _media_cols_ok = ok


def _select_cols(*, with_media: bool | None = None) -> str:
    use = _media_cols_ok if with_media is None else with_media
    if use is False:
        return _CORE_COLS
    if use is True:
        return f"{_CORE_COLS}, {_MEDIA_COLS}"
    # Unknown: prefer media cols; caller falls back on error.
    return f"{_CORE_COLS}, {_MEDIA_COLS}"


def _row_get(r: Any, key: str, default: Any = None) -> Any:
    try:
        return r[key]
    except (KeyError, IndexError, TypeError):
        return default


def _nonempty(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, (bytes, bytearray, memoryview)):
        return len(v) > 0
    return bool(str(v).strip())


def _decode_bytes_field(v: Any) -> bytes | None:
    if v is None:
        return None
    if isinstance(v, memoryview):
        v = v.tobytes()
    if isinstance(v, (bytes, bytearray)):
        return bytes(v) if v else None
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        if s.startswith("data:"):
            _, _, b64 = s.partition(",")
            try:
                return base64.b64decode(b64)
            except Exception:
                return None
        try:
            return base64.b64decode(s)
        except Exception:
            return None
    return None


def _prepare_media(payload: dict[str, Any], image_url: str) -> tuple[str | None, bytes | None]:
    """Resolve origin_path + thumb_webp from payload / URL / image bytes."""
    origin = payload.get("originPath")
    if origin is None:
        origin = payload.get("origin_path")
    if origin is None or (isinstance(origin, str) and not origin.strip()):
        origin = origin_key_from_url(image_url)
    else:
        origin = str(origin).strip() or None

    thumb = _decode_bytes_field(
        payload.get("thumbWebp")
        if "thumbWebp" in payload
        else payload.get("thumb_webp")
    )
    if thumb is None:
        raw = _decode_bytes_field(
            payload.get("imageBytes")
            if "imageBytes" in payload
            else payload.get("image_bytes")
        )
        if raw is None:
            try:
                from services.design.aesthetics.embed_job import fetch_image_bytes

                raw = fetch_image_bytes(image_url)
            except Exception:
                raw = None
        if raw:
            try:
                thumb = make_webp_thumb(raw)
            except Exception:
                thumb = None
    return origin, thumb


def _pub(r: Any, *, include_thumb: bool = False) -> dict[str, Any]:
    meta = None
    if _row_get(r, "meta_json"):
        try:
            meta = json.loads(r["meta_json"])
        except Exception:
            meta = None

    has_emb = (
        _nonempty(_row_get(r, "layout_emb"))
        or _nonempty(_row_get(r, "color_emb"))
        or _nonempty(_row_get(r, "aesthetic_emb"))
    )
    thumb_blob = _row_get(r, "thumb_webp")
    has_thumb = _nonempty(thumb_blob)
    sid = int(r["id"])
    out: dict[str, Any] = {
        "id": sid,
        "name": r["name"] or "",
        "scene": r["scene"] or "website",
        "grade": r["grade"] or "good",
        "tags": r["tags"] or "",
        "comment": r["comment_text"] or "",
        "imageUrl": r["image_url"] or "",
        "originPath": (_row_get(r, "origin_path") or "") or "",
        "hasThumb": has_thumb,
        "aestheticVecId": sid if has_emb else None,
        "embDim": int(_row_get(r, "emb_dim") or 512),
        "embModel": _row_get(r, "emb_model") or "openclip-vit-b-32",
        "embedStatus": _row_get(r, "embed_status") or "pending",
        "embedError": _row_get(r, "embed_error") or "",
        "hasEmbedding": has_emb,
        "enabled": bool(int(_row_get(r, "enabled") or 0)),
        "meta": meta,
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
        "createdAt": int(float(r["created_at"]) * 1000) if r["created_at"] else None,
    }
    if include_thumb:
        out["thumbDataUrl"] = thumb_data_url(
            bytes(thumb_blob) if _nonempty(thumb_blob) else None
        )
    return out


def _fetch_one(sample_id: int, *, include_thumb: bool = False) -> dict[str, Any] | None:
    sql_media = f"""
        SELECT {_select_cols(with_media=True)}
        FROM design_quality_sample WHERE id = ?
    """
    sql_core = f"""
        SELECT {_select_cols(with_media=False)}
        FROM design_quality_sample WHERE id = ?
    """
    with connect() as conn:
        if _media_cols_ok is not False:
            try:
                row = conn.execute(sql_media, (int(sample_id),)).fetchone()
                _mark_media_cols(True)
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                _mark_media_cols(False)
                row = conn.execute(sql_core, (int(sample_id),)).fetchone()
        else:
            row = conn.execute(sql_core, (int(sample_id),)).fetchone()
    return _pub(row, include_thumb=include_thumb) if row else None


def list_quality_samples(
    *,
    scene: str | None = None,
    grade: str | None = None,
    q: str | None = None,
    enabled: bool | None = None,
    embed_status: str | None = None,
    page: int = 1,
    page_size: int = 24,
) -> dict[str, Any]:
    ensure_design_catalog()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 24), 100))
    offset = (page_n - 1) * page_size_n
    where = ["1=1"]
    params: list[Any] = []
    if scene and scene.strip() and scene.strip() != "all":
        where.append("scene = ?")
        params.append(scene.strip().lower())
    if grade and grade.strip() and grade.strip() != "all":
        where.append("grade = ?")
        params.append(grade.strip().lower())
    if enabled is True:
        where.append("enabled = 1")
    elif enabled is False:
        where.append("enabled = 0")
    if embed_status and embed_status.strip() and embed_status.strip() != "all":
        where.append("embed_status = ?")
        params.append(embed_status.strip().lower())
    if q and q.strip():
        like = f"%{q.strip()}%"
        where.append("(name LIKE ? OR tags LIKE ? OR comment_text LIKE ?)")
        params.extend([like, like, like])
    where_sql = " AND ".join(where)

    def _run(with_media: bool) -> tuple[int, list[Any]]:
        cols = _select_cols(with_media=with_media)
        with connect() as conn:
            total_row = conn.execute(
                f"SELECT COUNT(*) AS c FROM design_quality_sample WHERE {where_sql}",
                tuple(params),
            ).fetchone()
            total = int(total_row["c"] if total_row else 0)
            rows = conn.execute(
                f"""
                SELECT {cols}
                FROM design_quality_sample
                WHERE {where_sql}
                ORDER BY updated_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                tuple(params + [page_size_n, offset]),
            ).fetchall()
        return total, rows

    try:
        if _media_cols_ok is False:
            total, rows = _run(False)
        else:
            total, rows = _run(True)
            _mark_media_cols(True)
    except Exception:
        _mark_media_cols(False)
        total, rows = _run(False)

    return {
        "items": [_pub(r, include_thumb=True) for r in rows],
        "total": total,
        "page": page_n,
        "pageSize": page_size_n,
    }


def get_quality_sample(
    sample_id: int,
    *,
    include_thumb: bool = False,
) -> dict[str, Any] | None:
    ensure_design_catalog()
    return _fetch_one(int(sample_id), include_thumb=include_thumb)


def get_quality_sample_thumb(sample_id: int) -> bytes | None:
    """Return stored WebP thumb bytes, or None."""
    ensure_design_catalog()
    with connect() as conn:
        try:
            row = conn.execute(
                "SELECT thumb_webp FROM design_quality_sample WHERE id=?",
                (int(sample_id),),
            ).fetchone()
            _mark_media_cols(True)
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            _mark_media_cols(False)
            return None
    if not row:
        return None
    blob = _row_get(row, "thumb_webp")
    if not _nonempty(blob):
        return None
    return bytes(blob)


def upsert_quality_sample(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_catalog()
    now = time.time()
    sid = payload.get("id")
    name = str(payload.get("name") or "").strip()[:128]
    scene = str(payload.get("scene") or "website").strip().lower()
    if scene not in SCENES:
        raise ValueError(f"invalid scene: {scene}")
    grade = str(payload.get("grade") or "good").strip().lower()
    if grade not in GRADES:
        raise ValueError(f"invalid grade: {grade}")
    image_url = str(payload.get("imageUrl") or payload.get("image_url") or "").strip()
    if not image_url:
        raise ValueError("imageUrl required")
    tags = str(payload.get("tags") or "").strip()[:512]
    comment = str(payload.get("comment") or payload.get("comment_text") or "").strip()
    enabled = 1 if payload.get("enabled", True) else 0
    meta = payload.get("meta")
    if not isinstance(meta, dict):
        meta = None
    # Default: auto-extract DESIGN_TOKENS into meta on save (Admin edits in ``meta`` win).
    extract_tokens = payload.get("extractTokens")
    if extract_tokens is None:
        extract_tokens = True
    if extract_tokens:
        try:
            from services.design.aesthetics.token_extract import (
                extract_design_tokens_meta,
                merge_design_token_meta,
            )

            extracted = extract_design_tokens_meta(
                image_url=image_url,
                name=name,
                grade=grade,
                tags=tags,
                comment=comment,
            )
            meta = merge_design_token_meta(extracted, meta)
        except Exception as exc:
            # Keep Admin save alive if PIL/fetch fails — still store user meta.
            import logging

            logging.getLogger(__name__).warning(
                "quality sample token extract failed: %s", exc
            )
    meta_json = json.dumps(meta, ensure_ascii=False) if isinstance(meta, dict) else None
    if not name:
        name = f"{scene}-{grade}"

    origin_path, thumb_webp = _prepare_media(payload, image_url)
    use_media = _media_cols_ok is not False

    with connect() as conn:
        should_embed = True

        def _exec_media(sql: str, args: tuple[Any, ...]) -> Any:
            nonlocal use_media
            if not use_media:
                raise RuntimeError("media columns disabled")
            try:
                cur = conn.execute(sql, args)
                _mark_media_cols(True)
                return cur
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                _mark_media_cols(False)
                use_media = False
                raise

        if sid:
            row = conn.execute(
                "SELECT id, image_url FROM design_quality_sample WHERE id = ?",
                (int(sid),),
            ).fetchone()
            if not row:
                raise ValueError("sample not found")
            old_url = str(row["image_url"] or "").strip()
            should_embed = image_url != old_url
            if should_embed:
                updated = False
                if use_media:
                    try:
                        # Image changed: refresh media; clear thumb if none provided.
                        _exec_media(
                            """
                            UPDATE design_quality_sample SET
                                name=?, scene=?, grade=?, tags=?, comment_text=?, image_url=?,
                                origin_path=?, thumb_webp=?,
                                enabled=?, meta_json=?, embed_status=?, embed_error='',
                                layout_emb=NULL, color_emb=NULL, aesthetic_emb=NULL,
                                updated_at=?
                            WHERE id=?
                            """,
                            (
                                name,
                                scene,
                                grade,
                                tags,
                                comment,
                                image_url,
                                origin_path,
                                thumb_webp,
                                enabled,
                                meta_json,
                                "pending",
                                now,
                                int(sid),
                            ),
                        )
                        updated = True
                    except Exception:
                        updated = False
                if not updated:
                    conn.execute(
                        """
                        UPDATE design_quality_sample SET
                            name=?, scene=?, grade=?, tags=?, comment_text=?, image_url=?,
                            enabled=?, meta_json=?, embed_status=?, embed_error='',
                            layout_emb=NULL, color_emb=NULL, aesthetic_emb=NULL,
                            updated_at=?
                        WHERE id=?
                        """,
                        (
                            name,
                            scene,
                            grade,
                            tags,
                            comment,
                            image_url,
                            enabled,
                            meta_json,
                            "pending",
                            now,
                            int(sid),
                        ),
                    )
            else:
                updated = False
                if use_media:
                    try:
                        if thumb_webp is not None:
                            _exec_media(
                                """
                                UPDATE design_quality_sample SET
                                    name=?, scene=?, grade=?, tags=?, comment_text=?, image_url=?,
                                    origin_path=?, thumb_webp=?,
                                    enabled=?, meta_json=?, updated_at=?
                                WHERE id=?
                                """,
                                (
                                    name,
                                    scene,
                                    grade,
                                    tags,
                                    comment,
                                    image_url,
                                    origin_path,
                                    thumb_webp,
                                    enabled,
                                    meta_json,
                                    now,
                                    int(sid),
                                ),
                            )
                        else:
                            _exec_media(
                                """
                                UPDATE design_quality_sample SET
                                    name=?, scene=?, grade=?, tags=?, comment_text=?, image_url=?,
                                    origin_path=?,
                                    enabled=?, meta_json=?, updated_at=?
                                WHERE id=?
                                """,
                                (
                                    name,
                                    scene,
                                    grade,
                                    tags,
                                    comment,
                                    image_url,
                                    origin_path,
                                    enabled,
                                    meta_json,
                                    now,
                                    int(sid),
                                ),
                            )
                        updated = True
                    except Exception:
                        updated = False
                if not updated:
                    conn.execute(
                        """
                        UPDATE design_quality_sample SET
                            name=?, scene=?, grade=?, tags=?, comment_text=?, image_url=?,
                            enabled=?, meta_json=?, updated_at=?
                        WHERE id=?
                        """,
                        (
                            name,
                            scene,
                            grade,
                            tags,
                            comment,
                            image_url,
                            enabled,
                            meta_json,
                            now,
                            int(sid),
                        ),
                    )
            conn.commit()
            out_id = int(sid)
        else:
            existing = conn.execute(
                """
                SELECT id, image_url FROM design_quality_sample
                WHERE image_url=? AND enabled=1
                ORDER BY id DESC LIMIT 1
                """,
                (image_url,),
            ).fetchone()
            if existing:
                out_id = int(existing["id"])
                row_st = conn.execute(
                    "SELECT embed_status FROM design_quality_sample WHERE id=?",
                    (out_id,),
                ).fetchone()
                st = ((row_st["embed_status"] if row_st else "") or "").strip().lower()
                should_embed = st != "ready"
                updated = False
                if use_media:
                    try:
                        if thumb_webp is not None:
                            _exec_media(
                                """
                                UPDATE design_quality_sample SET
                                    name=?, scene=?, grade=?, tags=?, comment_text=?,
                                    origin_path=?, thumb_webp=?,
                                    enabled=?, meta_json=?,
                                    embed_status=CASE WHEN embed_status='ready' THEN embed_status ELSE 'pending' END,
                                    updated_at=?
                                WHERE id=?
                                """,
                                (
                                    name,
                                    scene,
                                    grade,
                                    tags,
                                    comment,
                                    origin_path,
                                    thumb_webp,
                                    enabled,
                                    meta_json,
                                    now,
                                    out_id,
                                ),
                            )
                        else:
                            _exec_media(
                                """
                                UPDATE design_quality_sample SET
                                    name=?, scene=?, grade=?, tags=?, comment_text=?,
                                    origin_path=?,
                                    enabled=?, meta_json=?,
                                    embed_status=CASE WHEN embed_status='ready' THEN embed_status ELSE 'pending' END,
                                    updated_at=?
                                WHERE id=?
                                """,
                                (
                                    name,
                                    scene,
                                    grade,
                                    tags,
                                    comment,
                                    origin_path,
                                    enabled,
                                    meta_json,
                                    now,
                                    out_id,
                                ),
                            )
                        updated = True
                    except Exception:
                        updated = False
                if not updated:
                    conn.execute(
                        """
                        UPDATE design_quality_sample SET
                            name=?, scene=?, grade=?, tags=?, comment_text=?,
                            enabled=?, meta_json=?,
                            embed_status=CASE WHEN embed_status='ready' THEN embed_status ELSE 'pending' END,
                            updated_at=?
                        WHERE id=?
                        """,
                        (
                            name,
                            scene,
                            grade,
                            tags,
                            comment,
                            enabled,
                            meta_json,
                            now,
                            out_id,
                        ),
                    )
                conn.commit()
            else:
                inserted = False
                if use_media:
                    try:
                        cur = _exec_media(
                            """
                            INSERT INTO design_quality_sample (
                                name, scene, grade, tags, comment_text, image_url,
                                origin_path, thumb_webp,
                                emb_dim, emb_model, embed_status, embed_error, enabled, meta_json,
                                created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 512, 'openclip-vit-b-32', 'pending', '', ?, ?, ?, ?)
                            """,
                            (
                                name,
                                scene,
                                grade,
                                tags,
                                comment,
                                image_url,
                                origin_path,
                                thumb_webp,
                                enabled,
                                meta_json,
                                now,
                                now,
                            ),
                        )
                        inserted = True
                    except Exception:
                        inserted = False
                        cur = None
                if not inserted:
                    cur = conn.execute(
                        """
                        INSERT INTO design_quality_sample (
                            name, scene, grade, tags, comment_text, image_url,
                            emb_dim, emb_model, embed_status, embed_error, enabled, meta_json,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, 512, 'openclip-vit-b-32', 'pending', '', ?, ?, ?, ?)
                        """,
                        (
                            name,
                            scene,
                            grade,
                            tags,
                            comment,
                            image_url,
                            enabled,
                            meta_json,
                            now,
                            now,
                        ),
                    )
                conn.commit()
                out_id = int(getattr(cur, "lastrowid", None) or 0)
                if not out_id:
                    row = conn.execute(
                        "SELECT id FROM design_quality_sample WHERE image_url=? ORDER BY id DESC LIMIT 1",
                        (image_url,),
                    ).fetchone()
                    out_id = int(row["id"]) if row else 0
                should_embed = True

    invalidate_embedding_corpus_cache()
    item = get_quality_sample(out_id)
    if not item:
        raise ValueError("upsert failed")
    if should_embed:
        try:
            from services.design.aesthetics.embed_job import schedule_embed

            schedule_embed(out_id)
        except Exception as exc:
            try:
                set_embed_status(out_id, "failed", error=str(exc)[:2000])
            except Exception:
                pass
    return get_quality_sample(out_id) or item


def set_grade(sample_id: int, grade: str) -> dict[str, Any] | None:
    g = (grade or "").strip().lower()
    if g not in GRADES:
        raise ValueError(f"invalid grade: {grade}")
    ensure_design_catalog()
    now = time.time()
    with connect() as conn:
        cur = conn.execute(
            "UPDATE design_quality_sample SET grade=?, updated_at=? WHERE id=?",
            (g, now, int(sample_id)),
        )
        conn.commit()
        if getattr(cur, "rowcount", 1) == 0:
            row = conn.execute(
                "SELECT id FROM design_quality_sample WHERE id=?",
                (int(sample_id),),
            ).fetchone()
            if not row:
                return None
    invalidate_embedding_corpus_cache()
    return get_quality_sample(int(sample_id))


def soft_delete_quality_sample(sample_id: int) -> bool:
    ensure_design_catalog()
    now = time.time()
    with connect() as conn:
        cur = conn.execute(
            "UPDATE design_quality_sample SET enabled=0, updated_at=? WHERE id=?",
            (now, int(sample_id)),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id FROM design_quality_sample WHERE id=?",
            (int(sample_id),),
        ).fetchone()
        ok = bool(row) or getattr(cur, "rowcount", 0) > 0
    if ok:
        invalidate_embedding_corpus_cache()
    return ok


def hard_delete_quality_sample(sample_id: int) -> bool:
    ensure_design_catalog()
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM design_quality_sample WHERE id=?",
            (int(sample_id),),
        )
        conn.commit()
        ok = getattr(cur, "rowcount", 0) > 0
    if ok:
        invalidate_embedding_corpus_cache()
    return ok


def mark_embed_pending(sample_id: int) -> dict[str, Any] | None:
    """Clear vectors and mark pending (caller should schedule_embed)."""
    ensure_design_catalog()
    now = time.time()
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE design_quality_sample SET
                embed_status='pending', embed_error='',
                layout_emb=NULL, color_emb=NULL, aesthetic_emb=NULL,
                updated_at=?
            WHERE id=?
            """,
            (now, int(sample_id)),
        )
        conn.commit()
        if getattr(cur, "rowcount", 1) == 0:
            row = conn.execute(
                "SELECT id FROM design_quality_sample WHERE id=?",
                (int(sample_id),),
            ).fetchone()
            if not row:
                return None
    invalidate_embedding_corpus_cache()
    return get_quality_sample(int(sample_id))


def set_embed_status(
    sample_id: int,
    status: str,
    *,
    error: str = "",
) -> None:
    st = (status or "pending").strip().lower()
    if st not in EMBED_STATUSES:
        st = "failed"
    ensure_design_catalog()
    now = time.time()
    with connect() as conn:
        conn.execute(
            """
            UPDATE design_quality_sample SET
                embed_status=?, embed_error=?, updated_at=?
            WHERE id=?
            """,
            (st, (error or "")[:2000], now, int(sample_id)),
        )
        conn.commit()
    invalidate_embedding_corpus_cache()


def save_embeddings(
    sample_id: int,
    *,
    layout_emb: bytes,
    color_emb: bytes,
    aesthetic_emb: bytes,
    emb_dim: int = 512,
    emb_model: str = "openclip-vit-b-32",
) -> None:
    ensure_design_catalog()
    now = time.time()
    packed_layout = pack_emb_blob(layout_emb or b"")
    packed_color = pack_emb_blob(color_emb or b"")
    packed_aes = pack_emb_blob(aesthetic_emb or b"")
    with connect() as conn:
        conn.execute(
            """
            UPDATE design_quality_sample SET
                layout_emb=?, color_emb=?, aesthetic_emb=?,
                emb_dim=?, emb_model=?,
                embed_status='ready', embed_error='',
                updated_at=?
            WHERE id=?
            """,
            (
                packed_layout,
                packed_color,
                packed_aes,
                int(emb_dim),
                (emb_model or "openclip-vit-b-32")[:64],
                now,
                int(sample_id),
            ),
        )
        conn.commit()
    invalidate_embedding_corpus_cache()


def get_embedding_blobs(
    sample_id: int,
) -> tuple[bytes | None, bytes | None, bytes | None] | None:
    ensure_design_catalog()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT layout_emb, color_emb, aesthetic_emb
            FROM design_quality_sample WHERE id=?
            """,
            (int(sample_id),),
        ).fetchone()
    if not row:
        return None

    def _u(v: Any) -> bytes | None:
        if v is None:
            return None
        raw = unpack_emb_blob(v)
        return raw if raw else None

    return _u(row["layout_emb"]), _u(row["color_emb"]), _u(row["aesthetic_emb"])


def list_ready_embeddings(
    *,
    scene: str,
    grade: str = "good",
    limit: int = 500,
    fallback_scenes: bool = False,
) -> list[dict[str, Any]]:
    """Rows with ready vectors for RAG search (includes unpacked blob fields).

    When fallback_scenes=True and the exact scene has no rows, borrow ready
    grade samples from related scenes so pre-draw vision is not empty.
    """
    ensure_design_catalog()
    sc = (scene or "website").strip().lower() or "website"
    gr = (grade or "good").strip().lower()
    lim = max(1, min(int(limit or 500), 2000))
    cache_key = (sc, gr, lim, bool(fallback_scenes))
    now = time.time()
    with _corpus_lock:
        hit = _corpus_cache.get(cache_key)
        if hit is not None and (now - hit[0]) < _CORPUS_TTL_SEC:
            return [dict(r) for r in hit[1]]

    def _query(scene_key: str, take: int) -> list[dict[str, Any]]:
        with connect() as conn:
            rows = conn.execute(
                f"""
                SELECT {_READY_CORE_COLS}
                FROM design_quality_sample
                WHERE enabled=1 AND embed_status='ready' AND scene=? AND grade=?
                  AND aesthetic_emb IS NOT NULL
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (scene_key, gr, take),
            ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": int(r["id"]),
                    "name": r["name"] or "",
                    "scene": r["scene"],
                    "grade": r["grade"],
                    "tags": r["tags"] or "",
                    "comment": r["comment_text"] or "",
                    "imageUrl": r["image_url"] or "",
                    "layout_emb": unpack_emb_blob(r["layout_emb"]),
                    "color_emb": unpack_emb_blob(r["color_emb"]),
                    "aesthetic_emb": unpack_emb_blob(r["aesthetic_emb"]),
                    "emb_dim": int(r["emb_dim"] or 512),
                }
            )
        return out

    primary = _query(sc, lim)
    if not fallback_scenes:
        result = primary
    elif len(primary) >= MIN_GOOD_READY_PER_SCENE:
        result = primary
    else:
        seen: set[int] = {int(r["id"]) for r in primary}
        merged: list[dict[str, Any]] = list(primary)
        for alt in SCENE_FALLBACK.get(sc, ("mobile", "website", "poster", "image")):
            if alt == sc:
                continue
            for row in _query(alt, lim):
                rid = int(row["id"])
                if rid in seen:
                    continue
                seen.add(rid)
                merged.append({**row, "fallbackFrom": alt})
                if len(merged) >= lim:
                    break
            if len(merged) >= lim:
                break
        result = merged

    with _corpus_lock:
        _corpus_cache[cache_key] = (time.time(), [dict(r) for r in result])
    return result


def count_ready_good_by_scene() -> dict[str, Any]:
    """Coverage report: ready+good counts per scene + deficits vs MIN_GOOD_READY_PER_SCENE."""
    ensure_design_catalog()
    counts = {s: 0 for s in sorted(SCENES)}
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT scene, COUNT(*) AS c
            FROM design_quality_sample
            WHERE enabled=1 AND embed_status='ready' AND grade='good'
              AND aesthetic_emb IS NOT NULL
            GROUP BY scene
            """
        ).fetchall()
    for r in rows:
        sc = str(r["scene"] or "").strip().lower()
        if sc in counts:
            counts[sc] = int(r["c"] or 0)
    min_n = MIN_GOOD_READY_PER_SCENE
    deficits = {s: max(0, min_n - n) for s, n in counts.items()}
    return {
        "minReadyGood": min_n,
        "byScene": counts,
        "deficits": deficits,
        "ok": all(n >= min_n for n in counts.values()),
        "totalReadyGood": sum(counts.values()),
    }
