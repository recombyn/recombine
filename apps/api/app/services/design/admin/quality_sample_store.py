"""Aesthetic quality samples for CLIP RAG (MySQL BLOB embeddings + WebP thumbs)."""

from __future__ import annotations

import base64
import json
import threading
import time
from typing import Any

from sqlmodel import Session

from app import crud
from app.core.db import engine
from app.models import DesignQualitySample
from app.services.design.admin.blob_codec import (
    make_webp_thumb,
    origin_key_from_url,
    pack_emb_blob,
    thumb_data_url,
    unpack_emb_blob,
)
from app.services.design.readpath.catalog import ensure_design_catalog

SCENES = frozenset({"website", "mobile", "image", "poster", "drawing"})
GRADES = frozenset({"good", "ok", "bad"})
EMBED_STATUSES = frozenset({"pending", "ready", "failed", "skipped"})


def min_good_ready_per_scene() -> int:
    try:
        from app.core.config import settings

        n = int(getattr(settings, "design_aesthetics_min_corpus", 2) or 2)
    except Exception:
        n = 2
    return max(1, min(n, 64))


# Back-compat alias for older imports / docs.
MIN_GOOD_READY_PER_SCENE = 2
# When exact scene corpus is empty, borrow from these scenes (order = preference).
SCENE_FALLBACK: dict[str, tuple[str, ...]] = {
    "website": ("mobile", "poster", "image", "drawing"),
    "mobile": ("website", "poster", "image", "drawing"),
    "poster": ("mobile", "website", "image", "drawing"),
    "image": ("poster", "mobile", "website", "drawing"),
    "drawing": ("image", "poster", "mobile", "website"),
}

# Process-level cache for list_ready_embeddings (invalidated on writes).
_CORPUS_TTL_SEC = 180.0
_corpus_lock = threading.Lock()
_corpus_cache: dict[tuple[Any, ...], tuple[float, list[dict[str, Any]]]] = {}


def invalidate_embedding_corpus_cache() -> None:
    with _corpus_lock:
        _corpus_cache.clear()


def _row_get(r: Any, key: str, default: Any = None) -> Any:
    if not isinstance(r, dict) and hasattr(r, key):
        try:
            return getattr(r, key)
        except Exception:
            return default
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
                from app.services.design.aesthetics.embed_job import fetch_image_bytes

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
    meta_raw = _row_get(r, "meta_json")
    if meta_raw:
        try:
            meta = json.loads(meta_raw)
        except Exception:
            meta = None

    has_emb = (
        _nonempty(_row_get(r, "layout_emb"))
        or _nonempty(_row_get(r, "color_emb"))
        or _nonempty(_row_get(r, "aesthetic_emb"))
    )
    thumb_blob = _row_get(r, "thumb_webp")
    has_thumb = _nonempty(thumb_blob)
    sid = int(_row_get(r, "id") or 0)
    updated = _row_get(r, "updated_at")
    created = _row_get(r, "created_at")
    out: dict[str, Any] = {
        "id": sid,
        "name": _row_get(r, "name") or "",
        "scene": _row_get(r, "scene") or "website",
        "grade": _row_get(r, "grade") or "good",
        "tags": _row_get(r, "tags") or "",
        "comment": _row_get(r, "comment_text") or "",
        "imageUrl": _row_get(r, "image_url") or "",
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
        "updatedAt": int(float(updated) * 1000) if updated else None,
        "createdAt": int(float(created) * 1000) if created else None,
    }
    if include_thumb:
        out["thumbDataUrl"] = thumb_data_url(
            bytes(thumb_blob) if _nonempty(thumb_blob) else None
        )
    return out


def _fetch_one(sample_id: int, *, include_thumb: bool = False) -> dict[str, Any] | None:
    with Session(engine) as session:
        row = crud.get_quality_sample(session=session, sample_id=int(sample_id))
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
    with Session(engine) as session:
        rows, total = crud.list_quality_samples(
            session=session,
            scene=scene,
            grade=grade,
            q=q,
            enabled=enabled,
            embed_status=embed_status,
            offset=offset,
            limit=page_size_n,
        )
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
    with Session(engine) as session:
        row = crud.get_quality_sample(session=session, sample_id=int(sample_id))
    if not row:
        return None
    blob = row.thumb_webp
    if not _nonempty(blob):
        return None
    return bytes(blob)


def _apply_sample_fields(
    row: DesignQualitySample,
    *,
    name: str,
    scene: str,
    grade: str,
    tags: str,
    comment: str,
    image_url: str,
    enabled: int,
    meta_json: str | None,
    origin_path: str | None,
    thumb_webp: bytes | None,
    set_thumb: bool,
    clear_embeddings: bool,
    embed_status: str | None,
    now: float,
) -> None:
    row.name = name
    row.scene = scene
    row.grade = grade
    row.tags = tags
    row.comment_text = comment
    row.image_url = image_url
    row.enabled = enabled
    row.meta_json = meta_json
    row.origin_path = origin_path
    if set_thumb:
        row.thumb_webp = thumb_webp
    if clear_embeddings:
        row.layout_emb = None
        row.color_emb = None
        row.aesthetic_emb = None
        row.embed_error = ""
    if embed_status is not None:
        row.embed_status = embed_status
    row.updated_at = now


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
    extract_tokens = payload.get("extractTokens")
    if extract_tokens is None:
        extract_tokens = True
    if extract_tokens:
        try:
            from app.services.design.aesthetics.token_extract import (
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
            import logging

            logging.getLogger(__name__).warning(
                "quality sample token extract failed: %s", exc
            )
    meta_json = json.dumps(meta, ensure_ascii=False) if isinstance(meta, dict) else None
    if not name:
        name = f"{scene}-{grade}"

    origin_path, thumb_webp = _prepare_media(payload, image_url)
    should_embed = True
    out_id = 0

    with Session(engine) as session:
        if sid:
            row = crud.get_quality_sample(session=session, sample_id=int(sid))
            if not row:
                raise ValueError("sample not found")
            old_url = str(row.image_url or "").strip()
            should_embed = image_url != old_url
            if should_embed:
                _apply_sample_fields(
                    row,
                    name=name,
                    scene=scene,
                    grade=grade,
                    tags=tags,
                    comment=comment,
                    image_url=image_url,
                    enabled=enabled,
                    meta_json=meta_json,
                    origin_path=origin_path,
                    thumb_webp=thumb_webp,
                    set_thumb=True,
                    clear_embeddings=True,
                    embed_status="pending",
                    now=now,
                )
            else:
                _apply_sample_fields(
                    row,
                    name=name,
                    scene=scene,
                    grade=grade,
                    tags=tags,
                    comment=comment,
                    image_url=image_url,
                    enabled=enabled,
                    meta_json=meta_json,
                    origin_path=origin_path,
                    thumb_webp=thumb_webp,
                    set_thumb=thumb_webp is not None,
                    clear_embeddings=False,
                    embed_status=None,
                    now=now,
                )
            session.add(row)
            session.commit()
            out_id = int(row.id or 0)
        else:
            existing = crud.find_enabled_quality_sample_by_url(
                session=session, image_url=image_url
            )
            if existing:
                out_id = int(existing.id or 0)
                st = (existing.embed_status or "").strip().lower()
                should_embed = st != "ready"
                next_status = existing.embed_status if st == "ready" else "pending"
                _apply_sample_fields(
                    existing,
                    name=name,
                    scene=scene,
                    grade=grade,
                    tags=tags,
                    comment=comment,
                    image_url=image_url,
                    enabled=enabled,
                    meta_json=meta_json,
                    origin_path=origin_path,
                    thumb_webp=thumb_webp,
                    set_thumb=thumb_webp is not None,
                    clear_embeddings=False,
                    embed_status=next_status,
                    now=now,
                )
                session.add(existing)
                session.commit()
            else:
                row = DesignQualitySample(
                    name=name,
                    scene=scene,
                    grade=grade,
                    tags=tags,
                    comment_text=comment,
                    image_url=image_url,
                    origin_path=origin_path,
                    thumb_webp=thumb_webp,
                    emb_dim=512,
                    emb_model="openclip-vit-b-32",
                    embed_status="pending",
                    embed_error="",
                    enabled=enabled,
                    meta_json=meta_json,
                    created_at=now,
                    updated_at=now,
                )
                session.add(row)
                session.commit()
                session.refresh(row)
                out_id = int(row.id or 0)
                should_embed = True

    invalidate_embedding_corpus_cache()
    item = get_quality_sample(out_id)
    if not item:
        raise ValueError("upsert failed")
    if should_embed:
        try:
            from app.services.design.aesthetics.embed_job import schedule_embed

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
    with Session(engine) as session:
        row = crud.get_quality_sample(session=session, sample_id=int(sample_id))
        if not row:
            return None
        row.grade = g
        row.updated_at = time.time()
        session.add(row)
        session.commit()
    invalidate_embedding_corpus_cache()
    return get_quality_sample(int(sample_id))


def soft_delete_quality_sample(sample_id: int) -> bool:
    ensure_design_catalog()
    with Session(engine) as session:
        row = crud.get_quality_sample(session=session, sample_id=int(sample_id))
        if not row:
            return False
        row.enabled = 0
        row.updated_at = time.time()
        session.add(row)
        session.commit()
    invalidate_embedding_corpus_cache()
    return True


def hard_delete_quality_sample(sample_id: int) -> bool:
    ensure_design_catalog()
    with Session(engine) as session:
        row = crud.get_quality_sample(session=session, sample_id=int(sample_id))
        if not row:
            return False
        session.delete(row)
        session.commit()
    invalidate_embedding_corpus_cache()
    return True


def mark_embed_pending(sample_id: int) -> dict[str, Any] | None:
    """Clear vectors and mark pending (caller should schedule_embed)."""
    ensure_design_catalog()
    with Session(engine) as session:
        row = crud.get_quality_sample(session=session, sample_id=int(sample_id))
        if not row:
            return None
        row.embed_status = "pending"
        row.embed_error = ""
        row.layout_emb = None
        row.color_emb = None
        row.aesthetic_emb = None
        row.updated_at = time.time()
        session.add(row)
        session.commit()
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
    with Session(engine) as session:
        row = crud.get_quality_sample(session=session, sample_id=int(sample_id))
        if not row:
            return
        row.embed_status = st
        row.embed_error = (error or "")[:2000]
        row.updated_at = time.time()
        session.add(row)
        session.commit()
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
    with Session(engine) as session:
        row = crud.get_quality_sample(session=session, sample_id=int(sample_id))
        if not row:
            return
        row.layout_emb = pack_emb_blob(layout_emb or b"")
        row.color_emb = pack_emb_blob(color_emb or b"")
        row.aesthetic_emb = pack_emb_blob(aesthetic_emb or b"")
        row.emb_dim = int(emb_dim)
        row.emb_model = (emb_model or "openclip-vit-b-32")[:64]
        row.embed_status = "ready"
        row.embed_error = ""
        row.updated_at = time.time()
        session.add(row)
        session.commit()
    invalidate_embedding_corpus_cache()


def get_embedding_blobs(
    sample_id: int,
) -> tuple[bytes | None, bytes | None, bytes | None] | None:
    ensure_design_catalog()
    with Session(engine) as session:
        row = crud.get_quality_sample(session=session, sample_id=int(sample_id))
    if not row:
        return None

    def _u(v: Any) -> bytes | None:
        if v is None:
            return None
        raw = unpack_emb_blob(v)
        return raw if raw else None

    return _u(row.layout_emb), _u(row.color_emb), _u(row.aesthetic_emb)


def _ready_row_out(r: DesignQualitySample) -> dict[str, Any]:
    return {
        "id": int(r.id or 0),
        "name": r.name or "",
        "scene": r.scene,
        "grade": r.grade,
        "tags": r.tags or "",
        "comment": r.comment_text or "",
        "imageUrl": r.image_url or "",
        "layout_emb": unpack_emb_blob(r.layout_emb),
        "color_emb": unpack_emb_blob(r.color_emb),
        "aesthetic_emb": unpack_emb_blob(r.aesthetic_emb),
        "emb_dim": int(r.emb_dim or 512),
    }


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
        with Session(engine) as session:
            rows = crud.list_ready_quality_embeddings(
                session=session, scene=scene_key, grade=gr, limit=take
            )
        return [_ready_row_out(r) for r in rows]

    primary = _query(sc, lim)
    min_ready = min_good_ready_per_scene()
    if not fallback_scenes:
        result = primary
    elif len(primary) >= min_ready:
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
    """Coverage report: ready+good counts per scene + deficits vs min_good_ready_per_scene()."""
    ensure_design_catalog()
    counts = {s: 0 for s in sorted(SCENES)}
    with Session(engine) as session:
        got = crud.count_ready_good_quality_by_scene(session=session)
    for sc, n in got.items():
        if sc in counts:
            counts[sc] = int(n)
    need = min_good_ready_per_scene()
    deficits = {s: max(0, need - counts[s]) for s in counts}
    return {
        "minReady": need,
        "counts": counts,
        "deficits": deficits,
        "ready": all(v >= need for v in counts.values()),
    }
