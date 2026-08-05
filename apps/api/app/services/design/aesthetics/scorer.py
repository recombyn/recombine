"""Score a canvas render against grade=good CLIP embeddings (MySQL RAG)."""

from __future__ import annotations

import logging
from typing import Any

from app.services.design.aesthetics.clip_encoder import (
    MODEL_ID,
    clip_available,
    clip_status,
    encode_towers,
)
from app.services.design.aesthetics.embed_job import fetch_image_bytes
from app.services.design.aesthetics.views import (
    aesthetic_view,
    color_view,
    layout_view,
    load_pil,
)
from app.services.design.admin.quality_sample_store import list_ready_embeddings

logger = logging.getLogger(__name__)

# Blended CLIP cosine vs nearest good sample. Calibrate in M4.
DEFAULT_THRESHOLD = 0.72
_LAYOUT_W = 0.4
_COLOR_W = 0.3
_AES_W = 0.3
# Hard visual gate: each tower must clear this fraction of the blend threshold.
_TOWER_HARD_RATIO = 0.92


def _aes_pack(key: str, **variables: Any) -> str:
    """Admin prompt pack → LangChain render. No hardcoded Chinese fallbacks."""
    try:
        from app.services.design.prompts.prompt_pack_store import render_prompt_body

        return render_prompt_body(key, **variables).strip()
    except Exception:
        logger.debug("aesthetic pack miss key=%s", key, exc_info=True)
        return ""


def _load_threshold() -> float:
    try:
        from app.core.config import settings

        override = float(getattr(settings, "design_aesthetics_score_threshold", 0) or 0)
        if override > 0:
            return max(0.4, min(0.95, override))
    except Exception:
        pass
    try:
        from app.services.design.admin.admin_store import list_global_rules

        rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
        raw = (rules.get("aesthetics.score_threshold") or "").strip()
        if raw:
            return max(0.4, min(0.95, float(raw)))
    except Exception:
        pass
    return DEFAULT_THRESHOLD


def _min_corpus_size() -> int:
    """Same floor as quality_sample_store coverage (settings.design_aesthetics_min_corpus)."""
    try:
        from app.services.design.admin.quality_sample_store import min_good_ready_per_scene

        return min_good_ready_per_scene()
    except Exception:
        return 2


def _bytes_to_vec(raw: bytes | None):
    import numpy as np

    from app.services.design.admin.blob_codec import unpack_emb_blob

    if not raw:
        return None
    data = unpack_emb_blob(raw)
    if not data:
        return None
    arr = np.frombuffer(data, dtype=np.float32)
    if arr.size == 0:
        return None
    return arr


def _cosine(a, b) -> float:
    import numpy as np

    if a is None or b is None:
        return 0.0
    n = min(int(a.shape[0]), int(b.shape[0]))
    if n <= 0:
        return 0.0
    aa = a[:n].astype(np.float64, copy=False)
    bb = b[:n].astype(np.float64, copy=False)
    na = float(np.dot(aa, aa))
    nb = float(np.dot(bb, bb))
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(max(0.0, min(1.0, np.dot(aa, bb) / ((na**0.5) * (nb**0.5)))))


def _blend(layout_sim: float, color_sim: float, aesthetic_sim: float) -> float:
    return layout_sim * _LAYOUT_W + color_sim * _COLOR_W + aesthetic_sim * _AES_W


def _tower_floor(threshold: float) -> float:
    return max(0.55, float(threshold) * _TOWER_HARD_RATIO)


def _gaps(
    *,
    layout_sim: float,
    color_sim: float,
    aesthetic_sim: float,
    score: float,
    threshold: float,
    nearest: dict[str, Any] | None,
) -> list[dict[str, str]]:
    comment = str((nearest or {}).get("comment") or "").strip()
    name = str(
        (nearest or {}).get("name") or f"#{(nearest or {}).get('id', '')}"
    ).strip()
    if comment:
        ref = _aes_pack(
            "agent.prompt.aesthetic_gap_ref_comment", name=name, comment=comment
        )
    else:
        ref = _aes_pack("agent.prompt.aesthetic_gap_ref", name=name)

    gaps: list[dict[str, str]] = []
    tower_thresh = _tower_floor(threshold)
    if layout_sim < tower_thresh:
        detail = _aes_pack(
            "agent.prompt.aesthetic_gap_layout_detail",
            layout_sim=f"{layout_sim:.2f}",
            tower_thresh=f"{tower_thresh:.2f}",
        )
        hint = _aes_pack("agent.prompt.aesthetic_gap_layout_hint", ref=ref)
        if detail or hint:
            gaps.append({"kind": "layout", "detail": detail, "hint": hint})
    if color_sim < tower_thresh:
        detail = _aes_pack(
            "agent.prompt.aesthetic_gap_color_detail",
            color_sim=f"{color_sim:.2f}",
            tower_thresh=f"{tower_thresh:.2f}",
        )
        hint = _aes_pack("agent.prompt.aesthetic_gap_color_hint", ref=ref)
        if detail or hint:
            gaps.append({"kind": "color", "detail": detail, "hint": hint})
    if aesthetic_sim < tower_thresh:
        detail = _aes_pack(
            "agent.prompt.aesthetic_gap_aesthetic_detail",
            aesthetic_sim=f"{aesthetic_sim:.2f}",
            tower_thresh=f"{tower_thresh:.2f}",
        )
        hint = _aes_pack("agent.prompt.aesthetic_gap_aesthetic_hint", ref=ref)
        if detail or hint:
            gaps.append({"kind": "aesthetic", "detail": detail, "hint": hint})
    if score < threshold and not gaps:
        detail = _aes_pack(
            "agent.prompt.aesthetic_gap_score_detail",
            score=f"{score:.2f}",
            threshold=f"{threshold:.2f}",
        )
        hint = _aes_pack("agent.prompt.aesthetic_gap_score_hint", ref=ref or "")
        if detail or hint:
            gaps.append({"kind": "aesthetic", "detail": detail, "hint": hint})
    return gaps[:6]


def score_design_image(
    *,
    image_url: str,
    scene: str = "website",
    threshold: float | None = None,
    top_k: int = 3,
) -> dict[str, Any]:
    """
    Encode query image with three towers; cosine RAG against grade=good samples.
    Skips (pass) when CLIP missing or no ready embeddings for the scene.
    """
    thr = float(threshold if threshold is not None else _load_threshold())
    thr = max(0.4, min(0.95, thr))
    sc = (scene or "website").strip().lower() or "website"
    top_k = max(1, min(int(top_k or 3), 8))

    base: dict[str, Any] = {
        "ok": True,
        "status": "scored",
        "pass": True,
        "threshold": thr,
        "score": 0.0,
        "layoutSim": 0.0,
        "colorSim": 0.0,
        "aestheticSim": 0.0,
        "nearest": None,
        "refs": [],
        "gaps": [],
        "clip": clip_status(),
        "model": MODEL_ID,
        "scene": sc,
        "corpusSize": 0,
    }

    if not clip_available():
        base["status"] = "unavailable"
        base["reason"] = base["clip"].get("hint") or "OpenCLIP not installed"
        base["pass"] = True  # do not block design when extras missing
        return base

    corpus = list_ready_embeddings(scene=sc, grade="good", limit=500, fallback_scenes=True)
    base["corpusSize"] = len(corpus)
    if not corpus:
        base["status"] = "skipped"
        base["reason"] = f"no ready grade=good samples for scene={sc} (incl. fallback)"
        base["pass"] = True
        return base
    min_n = _min_corpus_size()
    primary_n = sum(1 for r in corpus if str(r.get("scene") or "").lower() == sc)
    # Fail-open when corpus is thin, or only fallback scenes and still weak.
    thin = len(corpus) < min_n or (primary_n == 0 and len(corpus) < min_n * 2)
    if thin:
        base["status"] = "thin_corpus"
        base["reason"] = (
            f"corpusSize={len(corpus)} primary={primary_n} min={min_n} scene={sc}; "
            "fail-open until more grade=good samples are embedded"
        )
        base["pass"] = True
        base["primaryCorpusSize"] = primary_n
        return base

    try:
        raw = fetch_image_bytes(image_url)
        pil = load_pil(raw)
        blobs = encode_towers(
            layout_view(pil),
            color_view(pil),
            aesthetic_view(pil),
        )
    except Exception as exc:
        logger.exception("aesthetics encode failed")
        base["ok"] = False
        base["status"] = "error"
        base["reason"] = str(exc)[:500]
        base["pass"] = True  # fail-open for product UX
        return base

    q_layout = _bytes_to_vec(blobs["layout_emb"])
    q_color = _bytes_to_vec(blobs["color_emb"])
    q_aes = _bytes_to_vec(blobs["aesthetic_emb"])

    ranked: list[dict[str, Any]] = []
    for row in corpus:
        ls = _cosine(q_layout, _bytes_to_vec(row.get("layout_emb")))
        cs = _cosine(q_color, _bytes_to_vec(row.get("color_emb")))
        as_ = _cosine(q_aes, _bytes_to_vec(row.get("aesthetic_emb")))
        blended = _blend(ls, cs, as_)
        ranked.append(
            {
                "id": row["id"],
                "name": row.get("name") or "",
                "scene": row.get("scene") or sc,
                "comment": row.get("comment") or "",
                "imageUrl": row.get("imageUrl") or "",
                "tags": row.get("tags") or "",
                "layoutSim": round(ls, 4),
                "colorSim": round(cs, 4),
                "aestheticSim": round(as_, 4),
                "score": round(blended, 4),
            }
        )
    ranked.sort(key=lambda x: x["score"], reverse=True)
    nearest = ranked[0]
    refs = ranked[:top_k]

    layout_sim = float(nearest["layoutSim"])
    color_sim = float(nearest["colorSim"])
    aesthetic_sim = float(nearest["aestheticSim"])
    score = float(nearest["score"])
    tower_floor = _tower_floor(thr)
    # Hard gates: blend AND each tower must clear the floor (少而硬).
    passed = (
        score >= thr
        and layout_sim >= tower_floor
        and color_sim >= tower_floor
        and aesthetic_sim >= tower_floor
    )
    gaps = [] if passed else _gaps(
        layout_sim=layout_sim,
        color_sim=color_sim,
        aesthetic_sim=aesthetic_sim,
        score=score,
        threshold=thr,
        nearest=nearest,
    )

    base.update(
        {
            "status": "scored",
            "pass": passed,
            "score": score,
            "layoutSim": layout_sim,
            "colorSim": color_sim,
            "aestheticSim": aesthetic_sim,
            "towerFloor": round(tower_floor, 4),
            "nearest": nearest,
            "refs": refs,
            "gaps": gaps,
        }
    )
    return base


def _rank_aesthetic_rows(
    corpus: list[dict[str, Any]],
    *,
    prompt: str,
    top_k: int,
    grade: str,
) -> tuple[list[dict[str, Any]], bool]:
    """Rank ready samples by CLIP text↔aesthetic similarity; recency fallback."""
    top_k = max(0, min(int(top_k or 0), 4))
    if top_k <= 0 or not corpus:
        return [], False

    ranked: list[dict[str, Any]] = []
    used_clip = False
    if clip_available():
        try:
            from app.services.design.aesthetics.clip_encoder import encode_text

            q = encode_text(prompt or "")
            for row in corpus:
                sim = _cosine(q, _bytes_to_vec(row.get("aesthetic_emb")))
                ranked.append(
                    {
                        "id": row["id"],
                        "name": row.get("name") or "",
                        "scene": row.get("scene") or "",
                        "grade": grade,
                        "fallbackFrom": row.get("fallbackFrom") or "",
                        "comment": row.get("comment") or "",
                        "imageUrl": row.get("imageUrl") or "",
                        "tags": row.get("tags") or "",
                        "score": round(float(sim), 4),
                    }
                )
            ranked.sort(key=lambda x: x["score"], reverse=True)
            used_clip = True
        except Exception as exc:
            logger.exception("aesthetic rank failed grade=%s: %s", grade, exc)
            ranked = []

    if not ranked:
        for row in corpus[:top_k]:
            ranked.append(
                {
                    "id": row["id"],
                    "name": row.get("name") or "",
                    "scene": row.get("scene") or "",
                    "grade": grade,
                    "fallbackFrom": row.get("fallbackFrom") or "",
                    "comment": row.get("comment") or "",
                    "imageUrl": row.get("imageUrl") or "",
                    "tags": row.get("tags") or "",
                    "score": 0.0,
                }
            )
        return ranked[:top_k], False

    return ranked[:top_k], used_clip


def retrieve_aesthetic_refs(
    *,
    prompt: str,
    scene: str = "website",
    top_k: int = 2,
    ok_k: int = 1,
    bad_k: int = 1,
    canvas_w: int = 0,
    canvas_h: int = 0,
    user_ref_urls: list[str] | None = None,
    corpus_pool: int = 96,
    use_user_refs: bool = False,
) -> dict[str, Any]:
    """
    Pre-draw RAG: grade=good (imitate) + grade=ok (baseline) + grade=bad (avoid).

    use_user_refs=True: analyze attached images as PRIMARY style (user_primary).
    use_user_refs=False: corpus CLIP ladder even if caller passed user_ref_urls
    (attachments may still be visible to the model for content/placement only).

    Falls back to newest ready samples when CLIP/text encode is unavailable.
    """
    import time as _time

    t0 = _time.time()
    sc = (scene or "website").strip().lower() or "website"
    user_urls = (
        [
            str(u).strip()
            for u in (user_ref_urls or [])
            if isinstance(u, str) and str(u).strip()
        ][:4]
        if use_user_refs
        else []
    )
    has_user = bool(user_urls)
    # User refs → skip good/ok corpus; keep at most 1 bad as avoid hint.
    if has_user:
        good_k, mid_k, avoid_k = 0, 0, max(0, min(int(bad_k if bad_k is not None else 1), 1))
        mode = "user_primary"
    else:
        good_k = max(1, min(int(top_k or 2), 2))
        mid_k = max(0, min(int(ok_k if ok_k is not None else 1), 1))
        avoid_k = max(0, min(int(bad_k if bad_k is not None else 1), 1))
        mode = "corpus_clip"
    pool = max(16, min(int(corpus_pool or 96), 128))

    out: dict[str, Any] = {
        "ok": True,
        "status": "ok",
        "scene": sc,
        "mode": mode,
        "refs": [],
        "okRefs": [],
        "badRefs": [],
        "imageUrls": [],
        "guidance": "",
        "corpusSize": 0,
        "okCorpusSize": 0,
        "badCorpusSize": 0,
        "usedClip": False,
        "userRefCount": len(user_urls),
        "corpusIds": [],
        "ms": 0,
    }

    good_corpus: list[dict[str, Any]] = []
    mid_corpus: list[dict[str, Any]] = []
    bad_corpus: list[dict[str, Any]] = []
    if good_k > 0:
        good_corpus = list_ready_embeddings(
            scene=sc, grade="good", limit=pool, fallback_scenes=True
        )
    if mid_k > 0:
        mid_corpus = list_ready_embeddings(
            scene=sc, grade="ok", limit=pool, fallback_scenes=True
        )
    if avoid_k > 0:
        # Bad avoid-hints: smaller pool is enough.
        bad_corpus = list_ready_embeddings(
            scene=sc, grade="bad", limit=min(48, pool), fallback_scenes=True
        )

    out["corpusSize"] = len(good_corpus)
    out["okCorpusSize"] = len(mid_corpus)
    out["badCorpusSize"] = len(bad_corpus)
    out["usedFallback"] = any(
        bool(r.get("fallbackFrom"))
        for r in (*good_corpus, *mid_corpus, *bad_corpus)
    )

    # User-primary with no corpus needed for tokens — still OK if user urls exist.
    if not has_user and not good_corpus and not mid_corpus and not bad_corpus:
        out["status"] = "skipped"
        out["reason"] = f"no ready good/ok/bad samples for scene={sc} (incl. fallback)"
        out["ms"] = int((_time.time() - t0) * 1000)
        return out

    good_refs: list[dict[str, Any]] = []
    ok_refs: list[dict[str, Any]] = []
    bad_refs: list[dict[str, Any]] = []
    used_clip = False
    if good_k > 0 and good_corpus:
        good_refs, good_clip = _rank_aesthetic_rows(
            good_corpus, prompt=prompt, top_k=good_k, grade="good"
        )
        used_clip = used_clip or good_clip
    if mid_k > 0 and mid_corpus:
        ok_refs, ok_clip = _rank_aesthetic_rows(
            mid_corpus, prompt=prompt, top_k=mid_k, grade="ok"
        )
        used_clip = used_clip or ok_clip
    if avoid_k > 0 and bad_corpus:
        # With user refs: recency-only avoid hint (skip CLIP cost).
        if has_user:
            bad_refs = [
                {
                    "id": r["id"],
                    "name": r.get("name") or "",
                    "scene": r.get("scene") or "",
                    "grade": "bad",
                    "fallbackFrom": r.get("fallbackFrom") or "",
                    "comment": r.get("comment") or "",
                    "imageUrl": r.get("imageUrl") or "",
                    "tags": r.get("tags") or "",
                    "score": 0.0,
                }
                for r in bad_corpus[:avoid_k]
            ]
        else:
            bad_refs, bad_clip = _rank_aesthetic_rows(
                bad_corpus, prompt=prompt, top_k=avoid_k, grade="bad"
            )
            used_clip = used_clip or bad_clip

    any_refs = bool(good_refs or ok_refs or bad_refs)
    out["usedClip"] = bool(used_clip)
    if has_user:
        out["status"] = "user_primary"
    elif any_refs and not used_clip:
        out["status"] = "fallback_recency"
    elif used_clip and any_refs:
        out["status"] = "ok"

    # Vision budget: with user refs, do NOT attach corpus sample images
    # (user attach already in the turn). Without user refs: good → ok → bad.
    image_urls: list[str] = []
    if not has_user:
        for r in good_refs + ok_refs + bad_refs:
            url = str(r.get("imageUrl") or "").strip()
            if url and url not in image_urls:
                image_urls.append(url)
            if len(image_urls) >= 4:
                break

    out["refs"] = good_refs
    out["okRefs"] = ok_refs
    out["badRefs"] = bad_refs
    out["imageUrls"] = image_urls
    out["corpusIds"] = [
        r.get("id")
        for r in (*good_refs, *ok_refs, *bad_refs)
        if isinstance(r, dict) and r.get("id") is not None
    ][:8]

    # Vision-first: CLIP ranks sample images; do NOT inject 短评/tags/DESIGN_TOKENS.
    # The next thought turn attaches imageUrls and the model should look at them.
    if has_user:
        user_hdr = _aes_pack("agent.prompt.aesthetic_refs_user")
        slim_lines = [ln for ln in user_hdr.splitlines() if ln.strip()]
        if bad_refs:
            for i, r in enumerate(bad_refs, start=1):
                name = (r.get("name") or f"#{r.get('id')}")[:80]
                line = _aes_pack(
                    "agent.prompt.aesthetic_refs_bad_item", i=i, name=name
                )
                if line:
                    slim_lines.append(line)
        else:
            empty_bad = _aes_pack("agent.prompt.aesthetic_refs_empty_bad_user")
            if empty_bad:
                slim_lines.append(empty_bad)
        ladder = "\n".join(slim_lines)
    else:
        ladder = format_aesthetic_refs_block(
            good_refs,
            ok_refs=ok_refs,
            bad_refs=bad_refs,
            matched_by_clip=used_clip,
            include_vision_hint=True,
        )

    out["guidance"] = ladder
    out["analyzedTokens"] = []

    if has_user and (user_urls or bad_refs or ladder):
        out["ok"] = True
        out["status"] = "user_primary"
    elif not has_user and not any_refs:
        out["status"] = "skipped"
        out["reason"] = "empty ranked refs"
    out["ms"] = int((_time.time() - t0) * 1000)
    return out


def format_aesthetic_refs_block(
    refs: list[dict[str, Any]],
    *,
    ok_refs: list[dict[str, Any]] | None = None,
    bad_refs: list[dict[str, Any]] | None = None,
    matched_by_clip: bool = True,
    include_vision_hint: bool = True,
) -> str:
    """Prompt block: CLIP-ranked sample images — look at attachments, not 短评/令牌."""
    goods = [r for r in (refs or []) if isinstance(r, dict)]
    mids = [r for r in (ok_refs or []) if isinstance(r, dict)]
    bads = [r for r in (bad_refs or []) if isinstance(r, dict)]
    if not goods and not mids and not bads:
        return ""

    def _lines_for(rows: list[dict[str, Any]], *, verb: str) -> list[str]:
        out_lines: list[str] = []
        for i, r in enumerate(rows, start=1):
            name = (r.get("name") or f"#{r.get('id')}")[:80]
            score = r.get("score")
            grade = str(r.get("grade") or "").strip() or "?"
            bits = [f"{i}. [{grade}] {name}"]
            sc_from = (r.get("fallbackFrom") or r.get("scene") or "").strip()
            if sc_from:
                bits.append(f"scene={sc_from}")
            if isinstance(score, (int, float)) and float(score) > 0:
                bits.append(f"sim={float(score):.2f}")
            out_lines.append(" | ".join(bits))
            if include_vision_hint:
                url = (r.get("imageUrl") or "").strip()
                hint_key = (
                    "agent.prompt.aesthetic_refs_vision_hint"
                    if url
                    else "agent.prompt.aesthetic_refs_no_image_hint"
                )
                hint = _aes_pack(hint_key, verb=verb)
                if hint:
                    out_lines.append(hint)
        return out_lines

    corpus_hdr = _aes_pack("agent.prompt.aesthetic_refs_corpus")
    lines = [ln for ln in corpus_hdr.splitlines() if ln.strip()]
    if not matched_by_clip:
        clip_fb = _aes_pack("agent.prompt.aesthetic_refs_clip_fallback")
        if clip_fb:
            lines.append(clip_fb)

    verb_good = _aes_pack("agent.prompt.aesthetic_refs_verb_imitate")
    verb_ok = _aes_pack("agent.prompt.aesthetic_refs_verb_surpass")
    verb_bad = _aes_pack("agent.prompt.aesthetic_refs_verb_avoid")

    if goods:
        sec = _aes_pack("agent.prompt.aesthetic_refs_section_good")
        lines.extend(["", sec] if sec else [""])
        lines.extend(_lines_for(goods, verb=verb_good))

    if mids:
        sec = _aes_pack("agent.prompt.aesthetic_refs_section_ok")
        lines.extend(["", sec] if sec else [""])
        lines.extend(_lines_for(mids, verb=verb_ok))
    elif goods or bads:
        empty_ok = _aes_pack("agent.prompt.aesthetic_refs_empty_ok")
        if empty_ok:
            lines.append(empty_ok)

    if bads:
        sec = _aes_pack("agent.prompt.aesthetic_refs_section_bad")
        lines.extend(["", sec] if sec else [""])
        lines.extend(_lines_for(bads, verb=verb_bad))
    elif goods or mids:
        empty_bad = _aes_pack("agent.prompt.aesthetic_refs_empty_bad")
        if empty_bad:
            lines.append(empty_bad)

    footer = _aes_pack("agent.prompt.aesthetic_refs_footer")
    if footer:
        lines.append(footer)
    return "\n".join(lines)


def format_aesthetics_catalog(*, scene: str = "website") -> str:
    """Short index of ready quality samples (counts only — no CLIP retrieve yet)."""
    sc = (scene or "website").strip().lower() or "website"
    counts = {"good": 0, "ok": 0, "bad": 0}
    try:
        from sqlmodel import Session

        from app import crud
        from app.core.db import engine
        from app.services.design.readpath.catalog import ensure_design_catalog

        ensure_design_catalog()
        with Session(engine) as session:
            rows = crud.count_quality_samples_by_grade(session=session, scene=sc)
        for r in rows:
            if hasattr(r, "_mapping"):
                g = str(r._mapping.get("grade") or "").strip().lower()
                c = int(r._mapping.get("c") or 0)
            elif isinstance(r, (tuple, list)) and len(r) >= 2:
                g = str(r[0] or "").strip().lower()
                c = int(r[1] or 0)
            else:
                g = str(getattr(r, "grade", "") or "").strip().lower()
                c = int(getattr(r, "c", 0) or 0)
            if g in counts:
                counts[g] = c
    except Exception:
        logger.exception("aesthetics catalog count failed scene=%s", sc)
    return _aes_pack(
        "agent.prompt.aesthetic_catalog",
        scene=sc,
        good=counts["good"],
        ok=counts["ok"],
        bad=counts["bad"],
    )


def normalize_need_aesthetics(raw: Any) -> bool:
    if raw is True:
        return True
    if raw is False or raw is None:
        return False
    if isinstance(raw, (int, float)):
        return bool(raw)
    s = str(raw or "").strip().lower()
    return s in ("1", "true", "yes", "on")


def parse_use_user_refs(raw: Any) -> bool | None:
    """Model declares whether USER attach is a style reference for aesthetics."""
    if raw is None:
        return None
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return bool(raw)
    s = str(raw or "").strip().lower()
    if s in ("1", "true", "yes", "on"):
        return True
    if s in ("0", "false", "no", "off"):
        return False
    return None
