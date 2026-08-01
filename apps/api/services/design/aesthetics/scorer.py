"""Score a canvas render against grade=good CLIP embeddings (MySQL RAG)."""

from __future__ import annotations

import logging
from typing import Any

from services.design.aesthetics.clip_encoder import (
    MODEL_ID,
    clip_available,
    clip_status,
    encode_towers,
)
from services.design.aesthetics.embed_job import fetch_image_bytes
from services.design.aesthetics.views import (
    aesthetic_view,
    color_view,
    layout_view,
    load_pil,
)
from services.design.quality_sample_store import list_ready_embeddings

logger = logging.getLogger(__name__)

# Blended CLIP cosine vs nearest good sample. Calibrate in M4.
DEFAULT_THRESHOLD = 0.72
_LAYOUT_W = 0.4
_COLOR_W = 0.3
_AES_W = 0.3
# Hard visual gate: each tower must clear this fraction of the blend threshold.
_TOWER_HARD_RATIO = 0.92


def _load_threshold() -> float:
    try:
        from services.design.admin_store import list_global_rules

        rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
        raw = (rules.get("aesthetics.score_threshold") or "").strip()
        if raw:
            return max(0.4, min(0.95, float(raw)))
    except Exception:
        pass
    return DEFAULT_THRESHOLD


def _bytes_to_vec(raw: bytes | None):
    import numpy as np

    from services.design.blob_codec import unpack_emb_blob

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
    comment = (nearest or {}).get("comment") or ""
    name = (nearest or {}).get("name") or f"#{(nearest or {}).get('id', '')}"
    ref = f"对照优质样本「{name}」"
    if comment:
        ref = f"{ref}：{comment}"

    gaps: list[dict[str, str]] = []
    tower_thresh = _tower_floor(threshold)
    if layout_sim < tower_thresh:
        gaps.append(
            {
                "kind": "layout",
                "detail": f"留白/层级未对齐参考（layout {layout_sim:.2f} < {tower_thresh:.2f}）",
                "hint": f"{ref} — 强制对齐留白密度与信息层级（标题/正文档差）",
            }
        )
    if color_sim < tower_thresh:
        gaps.append(
            {
                "kind": "color",
                "detail": f"色数/色板未对齐参考（color {color_sim:.2f} < {tower_thresh:.2f}）",
                "hint": f"{ref} — 收敛有效强调色（通常 ≤6），拉开文字与背景对比",
            }
        )
    if aesthetic_sim < tower_thresh:
        gaps.append(
            {
                "kind": "aesthetic",
                "detail": f"整体工艺未对齐参考（aesthetic {aesthetic_sim:.2f} < {tower_thresh:.2f}）",
                "hint": f"{ref} — 统一边距、对齐与视觉重心，勿线框/占位感",
            }
        )
    if score < threshold and not gaps:
        gaps.append(
            {
                "kind": "aesthetic",
                "detail": f"整体美学分 {score:.2f} < 门禁 {threshold:.2f}",
                "hint": ref or "对照优质参考图强制 refine：留白 / 层级 / 色数",
            }
        )
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
            from services.design.aesthetics.clip_encoder import encode_text

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
        try:
            from services.design.prompt_pack_store import resolve_prompt_body

            user_hdr = resolve_prompt_body("agent.prompt.aesthetic_refs_user").strip()
        except Exception:
            user_hdr = ""
        slim_lines = (
            [ln for ln in user_hdr.splitlines() if ln.strip()]
            if user_hdr
            else [
                "AESTHETIC_REFS（用户附件为主 — 请看图模仿用户风格）：",
                "已跳过语料优秀/可用样本图（存在用户附件）。可选反例图仍附上时请避开其失败模式。",
                "以附图视觉为准。",
            ]
        )
        if bad_refs:
            for i, r in enumerate(bad_refs, start=1):
                name = (r.get("name") or f"#{r.get('id')}")[:80]
                slim_lines.append(f"{i}. [bad] {name} — 见附图，避开")
        else:
            slim_lines.append("（本场景暂无反例样本）")
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
                if url:
                    out_lines.append(f"   已附图 — 请看图并{verb}（配色/疏密/层级/装饰）")
                else:
                    out_lines.append(f"   （无图）仅作等级标记 — {verb}")
        return out_lines

    try:
        from services.design.prompt_pack_store import resolve_prompt_body

        corpus_hdr = resolve_prompt_body("agent.prompt.aesthetic_refs_corpus").strip()
    except Exception:
        corpus_hdr = ""
    lines = (
        [ln for ln in corpus_hdr.splitlines() if ln.strip()]
        if corpus_hdr
        else [
            "AESTHETIC_REFS（向量检索样本图 — 请看附图）：",
            "优秀→模仿并达到其水准；可用→超越；反例→避开失败模式。勿逐字抄样本文案。",
        ]
    )
    if not matched_by_clip:
        lines.append("（按时间排序；CLIP 向量匹配不可用）")

    if goods:
        lines.extend(
            [
                "",
                "优秀（grade=good — 看图模仿；目标水准）：",
            ]
        )
        lines.extend(_lines_for(goods, verb="模仿"))

    if mids:
        lines.extend(
            [
                "",
                "可用（grade=ok — 看图了解基线，请明显超越）：",
            ]
        )
        lines.extend(_lines_for(mids, verb="超越"))
    elif goods or bads:
        lines.append("（本场景暂无可用 grade=ok 样本）")

    if bads:
        lines.extend(
            [
                "",
                "反例（grade=bad — 看图避开这些失败模式）：",
            ]
        )
        lines.extend(_lines_for(bads, verb="避开"))
    elif goods or mids:
        lines.append(
            "（本场景暂无反例 grade=bad 样本 — 仍请超越「可用」朝「优秀」）"
        )

    lines.append(
        "根据附图写出具体配色与疏密到 tool_ops；将 need_aesthetics 设为 false。"
    )
    return "\n".join(lines)


def format_aesthetics_catalog(*, scene: str = "website") -> str:
    """Short index of ready quality samples (counts only — no CLIP retrieve yet)."""
    sc = (scene or "website").strip().lower() or "website"
    counts = {"good": 0, "ok": 0, "bad": 0}
    try:
        from services.db import connect
        from services.design.catalog import ensure_design_catalog

        ensure_design_catalog()
        with connect() as conn:
            rows = conn.execute(
                """
                SELECT grade, COUNT(*) AS c
                FROM design_quality_sample
                WHERE enabled=1 AND embed_status='ready'
                  AND aesthetic_emb IS NOT NULL AND scene=?
                GROUP BY grade
                """,
                (sc,),
            ).fetchall()
        for r in rows:
            g = str(r["grade"] or "").strip().lower()
            if g in counts:
                counts[g] = int(r["c"] or 0)
    except Exception:
        logger.exception("aesthetics catalog count failed scene=%s", sc)
    try:
        from services.design.prompt_pack_store import resolve_prompt_body

        tmpl = resolve_prompt_body("agent.prompt.aesthetic_catalog").strip()
    except Exception:
        tmpl = ""
    if tmpl:
        try:
            return tmpl.format(
                scene=sc,
                good=counts["good"],
                ok=counts["ok"],
                bad=counts["bad"],
            )
        except Exception:
            pass
    return (
        f"美学样本库（场景={sc}）："
        f"优秀≈{counts['good']}，可用≈{counts['ok']}，反例≈{counts['bad']}。\n"
        "设 need_aesthetics=true：CLIP 向量检索样本图并附图，请看图"
        "（模仿优秀 / 超越可用 / 避开反例）。\n"
        "当用户附带图片时：仅当 USER_PROMPT 要求匹配/模仿该图风格/配色/布局时，"
        "才设 use_user_refs=true；若附件仅为内容素材、占位，或用户拒绝风格参考"
        "（如「不要参考这张图」）则 false。"
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
