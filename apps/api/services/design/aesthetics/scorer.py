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


def retrieve_aesthetic_refs(
    *,
    prompt: str,
    scene: str = "website",
    top_k: int = 2,
) -> dict[str, Any]:
    """
    Pre-draw RAG: rank grade=good samples by CLIP text↔aesthetic image similarity.
    Falls back to newest ready samples when CLIP/text encode is unavailable.
    """
    from services.design.aesthetics.clip_encoder import encode_text

    sc = (scene or "website").strip().lower() or "website"
    top_k = max(1, min(int(top_k or 2), 4))
    out: dict[str, Any] = {
        "ok": True,
        "status": "ok",
        "scene": sc,
        "refs": [],
        "imageUrls": [],
        "guidance": "",
        "corpusSize": 0,
    }

    corpus = list_ready_embeddings(scene=sc, grade="good", limit=500, fallback_scenes=True)
    out["corpusSize"] = len(corpus)
    out["usedFallback"] = any(bool(r.get("fallbackFrom")) for r in corpus)
    if not corpus:
        out["status"] = "skipped"
        out["reason"] = f"no ready grade=good samples for scene={sc} (incl. fallback)"
        return out

    ranked: list[dict[str, Any]] = []
    used_clip = False
    if clip_available():
        try:
            q = encode_text(prompt or "")
            for row in corpus:
                sim = _cosine(q, _bytes_to_vec(row.get("aesthetic_emb")))
                ranked.append(
                    {
                        "id": row["id"],
                        "name": row.get("name") or "",
                        "scene": row.get("scene") or sc,
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
            logger.exception("pre-draw aesthetic retrieve failed: %s", exc)
            ranked = []

    if not ranked:
        # Recency fallback (still better than drawing blind).
        for row in corpus[:top_k]:
            ranked.append(
                {
                    "id": row["id"],
                    "name": row.get("name") or "",
                    "scene": row.get("scene") or sc,
                    "fallbackFrom": row.get("fallbackFrom") or "",
                    "comment": row.get("comment") or "",
                    "imageUrl": row.get("imageUrl") or "",
                    "tags": row.get("tags") or "",
                    "score": 0.0,
                }
            )
        out["status"] = "fallback_recency"

    refs = ranked[:top_k]
    out["refs"] = refs
    out["imageUrls"] = [
        str(r.get("imageUrl") or "").strip()
        for r in refs
        if str(r.get("imageUrl") or "").strip()
    ]
    out["guidance"] = format_aesthetic_refs_block(refs, matched_by_clip=used_clip)
    if used_clip:
        out["status"] = "ok"
    return out


def format_aesthetic_refs_block(
    refs: list[dict[str, Any]],
    *,
    matched_by_clip: bool = True,
) -> str:
    """Prompt block: imitate these good samples before drawing."""
    if not refs:
        return ""
    lines = [
        "AESTHETIC_REFS (grade=good — study BEFORE drawing; do not copy text verbatim):",
        "Align to these refs on:",
        "1) 留白：边距与模块间距对齐参考密度，勿贴边/勿挤成一团/勿大片空洞线框。",
        "2) 层级：标题/副文/正文字号与权重至少两档，勿全页同字号。",
        "3) 色数：有效强调色通常 ≤6（中性色不计），对齐参考色板纪律。",
    ]
    if not matched_by_clip:
        lines.append("(ranked by recency; CLIP text match unavailable)")
    for i, r in enumerate(refs, start=1):
        name = (r.get("name") or f"#{r.get('id')}")[:80]
        tags = (r.get("tags") or "").strip()
        comment = (r.get("comment") or "").strip()
        score = r.get("score")
        bits = [f"{i}. {name}"]
        sc_from = (r.get("fallbackFrom") or r.get("scene") or "").strip()
        if sc_from:
            bits.append(f"scene={sc_from}")
        if isinstance(score, (int, float)) and float(score) > 0:
            bits.append(f"sim={float(score):.2f}")
        if tags:
            bits.append(f"tags={tags[:80]}")
        lines.append(" | ".join(bits))
        if comment:
            lines.append(f"   note: {comment[:200]}")
        url = (r.get("imageUrl") or "").strip()
        if url:
            lines.append("   image attached as vision ref (see multimodal images)")
    lines.append(
        "Emit tool_ops that match reference spacing / hierarchy / color count — "
        "not a wireframe or placeholder page."
    )
    return "\n".join(lines)
