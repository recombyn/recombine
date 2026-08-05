"""Threshold calibration + settings for CLIP aesthetics gate."""

from __future__ import annotations

import logging
from typing import Any

from app.services.design.admin.admin_store import list_global_rules, upsert_global_rule
from app.services.design.aesthetics.scorer import (
    DEFAULT_THRESHOLD,
    _blend,
    _bytes_to_vec,
    _cosine,
)
from app.services.design.admin.quality_sample_store import list_ready_embeddings

logger = logging.getLogger(__name__)

RULE_THRESHOLD = "aesthetics.score_threshold"
RULE_LORA = "aesthetics.lora.enabled"
RULE_LORA_NOTE = "aesthetics.lora.note"


def get_threshold() -> float:
    try:
        rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
        raw = (rules.get(RULE_THRESHOLD) or "").strip()
        if raw:
            return max(0.4, min(0.95, float(raw)))
    except Exception:
        logger.debug("aesthetics threshold rule read failed", exc_info=True)
    return DEFAULT_THRESHOLD


def set_threshold(value: float) -> float:
    thr = max(0.4, min(0.95, float(value)))
    upsert_global_rule(rule_key=RULE_THRESHOLD, rule_value=f"{thr:.4f}")
    return thr


def aesthetics_settings() -> dict[str, Any]:
    rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
    lora_on = (rules.get(RULE_LORA) or "0").strip() in ("1", "true", "yes", "on")
    return {
        "threshold": get_threshold(),
        "defaultThreshold": DEFAULT_THRESHOLD,
        "lora": {
            "enabled": lora_on,
            "status": "planned" if not lora_on else "enabled_stub",
            "note": (rules.get(RULE_LORA_NOTE) or "").strip()
            or "LoRA fine-tune not shipped yet — use threshold + more good samples first.",
        },
    }


def _percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return DEFAULT_THRESHOLD
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    p = max(0.0, min(100.0, p))
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = int(k)
    c = min(len(sorted_vals) - 1, f + 1)
    if f == c:
        return sorted_vals[f]
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def calibrate_threshold(
    *,
    scene: str | None = None,
    apply: bool = False,
) -> dict[str, Any]:
    """
    Leave-one-out nearest-neighbor among grade=good ready embeddings.
    Suggest threshold ≈ 15th percentile of self-similarity (goods that look like goods).
    """
    scenes = [scene] if scene else ["website", "mobile", "poster", "image"]
    all_scores: list[float] = []
    per_scene: dict[str, Any] = {}

    for sc in scenes:
        corpus = list_ready_embeddings(scene=sc, grade="good", limit=500)
        if len(corpus) < 2:
            per_scene[sc] = {
                "corpusSize": len(corpus),
                "pairScores": [],
                "suggested": None,
                "reason": "need_at_least_2_ready_good_samples",
            }
            continue

        vectors = []
        for row in corpus:
            vectors.append(
                {
                    "id": row["id"],
                    "layout": _bytes_to_vec(row.get("layout_emb")),
                    "color": _bytes_to_vec(row.get("color_emb")),
                    "aesthetic": _bytes_to_vec(row.get("aesthetic_emb")),
                }
            )

        pair_scores: list[float] = []
        for i, qi in enumerate(vectors):
            best = -1.0
            for j, qj in enumerate(vectors):
                if i == j:
                    continue
                ls = _cosine(qi["layout"], qj["layout"])
                cs = _cosine(qi["color"], qj["color"])
                as_ = _cosine(qi["aesthetic"], qj["aesthetic"])
                best = max(best, _blend(ls, cs, as_))
            if best >= 0:
                pair_scores.append(round(best, 4))

        pair_scores.sort()
        suggested = round(
            max(0.55, min(0.88, _percentile(pair_scores, 15.0) - 0.02)),
            4,
        )
        all_scores.extend(pair_scores)
        per_scene[sc] = {
            "corpusSize": len(corpus),
            "pairCount": len(pair_scores),
            "pairMin": pair_scores[0] if pair_scores else None,
            "pairP15": round(_percentile(pair_scores, 15.0), 4) if pair_scores else None,
            "pairMedian": round(_percentile(pair_scores, 50.0), 4) if pair_scores else None,
            "pairMax": pair_scores[-1] if pair_scores else None,
            "suggested": suggested,
        }

    all_scores.sort()
    current = get_threshold()
    if len(all_scores) < 2:
        return {
            "ok": False,
            "reason": "need_at_least_2_ready_good_samples",
            "currentThreshold": current,
            "suggestedThreshold": None,
            "applied": False,
            "scenes": per_scene,
            "settings": aesthetics_settings(),
        }

    global_suggested = round(
        max(0.55, min(0.88, _percentile(all_scores, 15.0) - 0.02)),
        4,
    )
    applied = False
    if apply:
        set_threshold(global_suggested)
        applied = True

    return {
        "ok": True,
        "currentThreshold": current,
        "suggestedThreshold": global_suggested,
        "applied": applied,
        "pairCount": len(all_scores),
        "pairMin": all_scores[0],
        "pairP15": round(_percentile(all_scores, 15.0), 4),
        "pairMedian": round(_percentile(all_scores, 50.0), 4),
        "pairMax": all_scores[-1],
        "scenes": per_scene,
        "settings": aesthetics_settings(),
        "hint": (
            "Suggested ≈ P15(good↔good) − 0.02 so most labeled goods pass the gate; "
            "raise if too many false fails, lower if weak designs slip through."
        ),
    }
