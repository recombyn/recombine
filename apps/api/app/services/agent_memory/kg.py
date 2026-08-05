"""Lightweight knowledge graph (P3) — user-scoped SPO triples.

No graph DB: SQL triples only.
- Factual anchors from the episode (goal / ops / hex colors observed in text).
- Semantic triples from Admin **skill** + **global rules** (same pattern as goal_critic).
  Do not hardcode style/mood vocab here — edit skill ``kg_extract`` or rule ``memory.kg.*``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

from sqlmodel import Session

from app import crud
from app.core.db import engine
from app.services.db import init_schema

logger = logging.getLogger(__name__)

_HEX = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")
# Retrieval noise only (not product style rules).
_RETRIEVE_STOP = frozenset(
    {
        "的",
        "了",
        "和",
        "与",
        "the",
        "a",
        "an",
        "and",
        "for",
        "with",
        "to",
        "of",
    }
)

_KG_SKILL_KEY_FALLBACK = "kg_extract"
_ALLOWED_PREDICATES_FALLBACK = (
    "has_goal|last_summary|uses_color|used_op|"
    "prefers_mood|prefers_layout|about|avoids"
)


def _rule_on(rules: dict[str, str] | None, key: str, default: str) -> bool:
    raw = default
    if isinstance(rules, dict) and rules.get(key) is not None:
        raw = str(rules.get(key) or default)
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _rule_text(rules: dict[str, str] | None, key: str, default: str = "") -> str:
    if isinstance(rules, dict) and rules.get(key) is not None:
        return str(rules.get(key) or default)
    return default


def enabled(rules: dict[str, str] | None) -> bool:
    return _rule_on(rules, "memory.kg.enabled", "1")


def _top_k(rules: dict[str, str] | None) -> int:
    try:
        raw = _rule_text(rules, "memory.kg.top_k", "8")
        return max(0, min(24, int(raw.strip() or "8")))
    except ValueError:
        return 8


def _max_triples(rules: dict[str, str] | None) -> int:
    try:
        raw = _rule_text(rules, "memory.kg.max_triples", "16")
        return max(1, min(32, int(raw.strip() or "16")))
    except ValueError:
        return 16


def _kg_skill_key(rules: dict[str, str] | None) -> str:
    return (
        _rule_text(rules, "memory.kg.skill_key", _KG_SKILL_KEY_FALLBACK).strip()
        or _KG_SKILL_KEY_FALLBACK
    )


def _allowed_predicates(rules: dict[str, str] | None) -> frozenset[str]:
    raw = _rule_text(rules, "memory.kg.predicates", _ALLOWED_PREDICATES_FALLBACK)
    parts = [p.strip() for p in raw.replace(",", "|").split("|") if p.strip()]
    return frozenset(parts) if parts else frozenset(_ALLOWED_PREDICATES_FALLBACK.split("|"))


def _norm_node(s: str, *, limit: int = 96) -> str:
    t = re.sub(r"\s+", " ", (s or "").strip())
    return t[:limit]


def _tokens(text: str) -> list[str]:
    """Query tokens for retrieve scoring (stopwords = noise, not design rules)."""
    raw = (text or "").lower()
    parts = re.findall(r"[\u4e00-\u9fff]{2,8}|[a-zA-Z][#a-zA-Z0-9_-]{2,24}", raw)
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        if p in _RETRIEVE_STOP or p in seen:
            continue
        seen.add(p)
        out.append(p)
        if len(out) >= 12:
            break
    return out


def upsert_triple(
    *,
    user_id: str,
    subject: str,
    predicate: str,
    obj: str,
    weight_delta: float = 1.0,
    source: str = "episode",
) -> str | None:
    uid = (user_id or "").strip()
    s = _norm_node(subject)
    p = _norm_node(predicate, limit=48)
    o = _norm_node(obj)
    if not uid or not s or not p or not o:
        return None
    now = time.time()
    try:
        init_schema()
        with Session(engine) as session:
            return crud.upsert_agent_kg_triple_weight(
                session=session,
                user_id=uid,
                subject=s,
                predicate=p,
                object_=o,
                weight_delta=weight_delta,
                source=source or "episode",
                now=now,
            )
    except Exception:
        logger.exception("upsert_triple failed")
        return None


def extract_factual_triples_from_episode(
    *,
    scene: str,
    goal: str,
    summary: str = "",
    actions: list[Any] | None = None,
    outcome: str = "success",
) -> list[tuple[str, str, str]]:
    """Episode facts only — no style/mood vocab. Semantic tags come from skill LLM."""
    if (outcome or "").strip().lower() not in ("success", "partial", "ok", ""):
        return []
    sc = (scene or "").strip().lower() or "website"
    goal_t = (goal or "").strip()
    summary_t = (summary or "").strip()
    triples: list[tuple[str, str, str]] = []

    triples.append((f"scene:{sc}", "has_goal", goal_t[:120] or summary_t[:120]))
    if summary_t and summary_t != goal_t:
        triples.append((f"scene:{sc}", "last_summary", summary_t[:120]))

    # Observed hex literals in user text / summary (data, not a style dictionary).
    for hex_c in _HEX.findall(f"{goal_t} {summary_t}")[:4]:
        triples.append((f"scene:{sc}", "uses_color", hex_c.upper()))

    op_names: list[str] = []
    for a in actions or []:
        if isinstance(a, dict):
            name = str(a.get("op") or a.get("name") or "").strip()
            if name:
                op_names.append(name)
        elif isinstance(a, str) and a.strip():
            op_names.append(a.strip())
    for name in op_names[:8]:
        triples.append((f"scene:{sc}", "used_op", name[:64]))

    return _dedupe_triples(triples)[:24]


# Back-compat alias for callers / tests.
extract_triples_from_episode = extract_factual_triples_from_episode


def _dedupe_triples(
    triples: list[tuple[str, str, str]],
) -> list[tuple[str, str, str]]:
    seen: set[tuple[str, str, str]] = set()
    out: list[tuple[str, str, str]] = []
    for t in triples:
        key = (t[0], t[1], t[2])
        if key in seen or not t[2]:
            continue
        seen.add(key)
        out.append(t)
    return out


def _skill_by_key(skill_key: str) -> dict[str, Any] | None:
    key = (skill_key or "").strip().lower()
    if not key:
        return None
    try:
        from app.services.design.readpath.catalog import list_skills

        for sk in list_skills():
            if str(sk.get("skill_key") or "").strip().lower() == key:
                return sk
    except Exception:
        logger.exception("list_skills for kg failed")
    return None


def _parse_triples_json(
    content: str,
    *,
    scene: str,
    allowed: frozenset[str],
    limit: int,
) -> list[tuple[str, str, str]]:
    text = (content or "").strip()
    if not text:
        return []
    brace = text.find("{")
    bracket = text.find("[")
    raw: Any = None
    if brace >= 0 and (bracket < 0 or brace < bracket):
        try:
            raw = json.loads(text[brace : text.rfind("}") + 1])
        except Exception:
            raw = None
    if raw is None and bracket >= 0:
        try:
            raw = json.loads(text[bracket : text.rfind("]") + 1])
        except Exception:
            raw = None
    items: list[Any] = []
    if isinstance(raw, dict):
        items = raw.get("triples") or raw.get("items") or raw.get("edges") or []
    elif isinstance(raw, list):
        items = raw
    sc = (scene or "").strip().lower() or "website"
    out: list[tuple[str, str, str]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        s = str(it.get("s") or it.get("subject") or "").strip()
        p = str(it.get("p") or it.get("predicate") or "").strip()
        o = str(it.get("o") or it.get("object") or "").strip()
        if not p or not o:
            continue
        if p not in allowed:
            continue
        if not s:
            s = f"scene:{sc}"
        out.append((s[:128], p[:64], o[:200]))
        if len(out) >= limit:
            break
    return _dedupe_triples(out)


async def extract_triples_via_skill(
    *,
    scene: str,
    goal: str,
    summary: str = "",
    actions: list[Any] | None = None,
    rules: dict[str, str] | None = None,
    model_family: str = "auto",
) -> list[tuple[str, str, str]]:
    """LLM SPO extract — prompt from Admin skill / memory.kg.system rule."""
    skill_key = _kg_skill_key(rules)
    skill = _skill_by_key(skill_key)
    system = ""
    extract_model = model_family
    if skill:
        system = str(skill.get("prompt_positive") or "").strip()
        neg = str(skill.get("prompt_negative") or "").strip()
        if neg:
            system = f"{system}\n\nAvoid:\n{neg}"
        if str(skill.get("default_model") or "").strip():
            extract_model = str(skill.get("default_model")).strip()
    if not system:
        system = _rule_text(rules, "memory.kg.system").strip()
    if not system:
        logger.info("kg extract skipped: empty skill `%s` and memory.kg.system", skill_key)
        return []

    try:
        max_tokens = int(_rule_text(rules, "memory.kg.max_tokens", "512").strip() or "512")
    except ValueError:
        max_tokens = 512
    max_tokens = max(128, min(2048, max_tokens))
    limit = _max_triples(rules)
    allowed = _allowed_predicates(rules)

    try:
        ops_raw = json.dumps(actions or [], ensure_ascii=False)[:3000]
    except Exception:
        ops_raw = "[]"
    pred_hint = "|".join(sorted(allowed))
    user = (
        f"SCENE: {(scene or '').strip() or 'website'}\n\n"
        f"USER_GOAL:\n{(goal or '')[:2000]}\n\n"
        f"SUMMARY:\n{(summary or '')[:2000]}\n\n"
        f"OPS:\n{ops_raw}\n\n"
        f"Allowed predicates: {pred_hint}\n"
        'Return JSON: {"triples":[{"s":"scene:...","p":"...","o":"..."}]}'
    )
    try:
        from app.services.design.runtime.llm_step import complete_skill_step

        out, _tokens_used = await complete_skill_step(
            model_family=extract_model,
            system=system,
            user=user,
            max_tokens=max_tokens,
            rules=rules if isinstance(rules, dict) else None,
        )
    except Exception:
        logger.exception("kg skill extract failed")
        return []
    return _parse_triples_json(out or "", scene=scene, allowed=allowed, limit=limit)


def _run_async(coro: Any) -> Any:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # Already in a loop (unlikely in background thread) — use a fresh loop.
    return asyncio.run(coro)


def enrich_episode_graph_llm(
    *,
    user_id: str,
    scene: str,
    goal: str,
    summary: str = "",
    actions: list[Any] | None = None,
    rules: dict[str, str] | None = None,
    model_family: str = "auto",
) -> int:
    """Sync wrapper for background thread: skill-based triples → upsert."""
    if not enabled(rules):
        return 0
    triples = _run_async(
        extract_triples_via_skill(
            scene=scene,
            goal=goal,
            summary=summary,
            actions=actions,
            rules=rules,
            model_family=model_family,
        )
    )
    n = 0
    for s, p, o in triples or []:
        if upsert_triple(
            user_id=user_id,
            subject=s,
            predicate=p,
            obj=o,
            weight_delta=1.0,
            source="kg_skill",
        ):
            n += 1
    return n


def schedule_kg_skill_enrich(
    *,
    user_id: str,
    scene: str,
    goal: str,
    summary: str = "",
    actions: list[Any] | None = None,
    rules: dict[str, str] | None = None,
    model_family: str = "auto",
) -> None:
    if not enabled(rules):
        return
    if not _rule_on(rules, "memory.kg.llm_extract", "1"):
        return
    uid = (user_id or "").strip()
    if not uid:
        return
    actions_copy = list(actions or [])
    rules_copy = dict(rules) if isinstance(rules, dict) else None

    def _job() -> None:
        n = enrich_episode_graph_llm(
            user_id=uid,
            scene=scene,
            goal=goal,
            summary=summary,
            actions=actions_copy,
            rules=rules_copy,
            model_family=model_family,
        )
        if n:
            logger.info("[kg] skill enrich wrote %s triples user=%s", n, uid[:12])

    from app.services.agent_memory.text_embed import schedule_background

    schedule_background(f"kg-enrich-{uid[:8]}-{int(time.time()) % 100000}", _job)


def ingest_episode_graph(
    *,
    user_id: str,
    scene: str,
    goal: str,
    summary: str = "",
    actions: list[Any] | None = None,
    outcome: str = "success",
    rules: dict[str, str] | None = None,
    model_family: str = "auto",
) -> int:
    """Write factual triples now; schedule skill LLM enrich in background."""
    if not enabled(rules):
        return 0
    n = 0
    for s, p, o in extract_factual_triples_from_episode(
        scene=scene,
        goal=goal,
        summary=summary,
        actions=actions,
        outcome=outcome,
    ):
        if upsert_triple(
            user_id=user_id,
            subject=s,
            predicate=p,
            obj=o,
            weight_delta=1.0,
            source="episode",
        ):
            n += 1
    schedule_kg_skill_enrich(
        user_id=user_id,
        scene=scene,
        goal=goal,
        summary=summary,
        actions=actions,
        rules=rules,
        model_family=model_family,
    )
    return n


def retrieve_triples(
    user_id: str,
    *,
    query: str = "",
    scene: str = "",
    rules: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """1-hop retrieve: prefer scene:* subject, then keyword match on S/O."""
    if not enabled(rules):
        return []
    k = _top_k(rules)
    if k <= 0:
        return []
    uid = (user_id or "").strip()
    if not uid:
        return []
    sc = (scene or "").strip().lower()
    toks = _tokens(query)
    try:
        init_schema()
        with Session(engine) as session:
            rows = crud.list_agent_kg_triples_for_retrieve(
                session=session, user_id=uid, limit=300
            )
    except Exception:
        logger.exception("retrieve_triples failed")
        return []

    scored: list[tuple[float, dict[str, Any]]] = []
    for r in rows:
        subj = str(r.subject or "")
        pred = str(r.predicate or "")
        obj = str(r.object or "")
        w = float(r.weight or 1.0)
        score = w
        if sc and subj == f"scene:{sc}":
            score += 5.0
        elif sc and subj.startswith("scene:"):
            score += 0.5
        blob = f"{subj} {pred} {obj}".lower()
        for tok in toks:
            if tok in blob:
                score += 1.2
        scored.append(
            (
                score,
                {
                    "s": subj,
                    "p": pred,
                    "o": obj,
                    "weight": round(w, 2),
                    "score": round(score, 2),
                },
            )
        )
    scored.sort(key=lambda x: -x[0])
    out: list[dict[str, Any]] = []
    seen_key: set[str] = set()
    for _sc, hit in scored:
        key = f"{hit['s']}|{hit['p']}|{hit['o']}"
        if key in seen_key:
            continue
        pred_count = sum(1 for h in out if h["p"] == hit["p"])
        if pred_count >= 3:
            continue
        seen_key.add(key)
        out.append(hit)
        if len(out) >= k:
            break
    return out


def list_triples_admin(
    *,
    user_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Admin inspection of SPO rows."""
    lim = max(1, min(500, int(limit or 100)))
    off = max(0, int(offset or 0))
    uid = (user_id or "").strip() or None
    try:
        init_schema()
        with Session(engine) as session:
            total = crud.count_agent_kg_triples_active(session=session, user_id=uid)
            rows = crud.list_agent_kg_triples_admin(
                session=session, user_id=uid, limit=lim, offset=off
            )
    except Exception:
        logger.exception("list_triples_admin failed")
        return {"items": [], "total": 0}
    items = [
        {
            "id": str(r.id),
            "userId": str(r.user_id),
            "s": str(r.subject),
            "p": str(r.predicate),
            "o": str(r.object),
            "weight": float(r.weight or 1),
            "source": str(r.source or ""),
            "status": str(r.status or ""),
            "createdAt": float(r.created_at or 0),
            "updatedAt": float(r.updated_at or 0),
        }
        for r in rows
    ]
    return {"items": items, "total": total}


def soft_delete_triple(triple_id: str) -> bool:
    tid = (triple_id or "").strip()
    if not tid:
        return False
    try:
        init_schema()
        with Session(engine) as session:
            return crud.soft_delete_agent_kg_triple(
                session=session, triple_id=tid, updated_at=time.time()
            )
    except Exception:
        logger.exception("soft_delete_triple failed")
        return False


def format_kg_block(triples: list[dict[str, Any]]) -> str:
    if not triples:
        return ""
    lines = [
        "[Knowledge graph]",
        "Soft priors from past successful runs (S-P-O). Prefer USER_PROMPT + MATERIALS.",
    ]
    for i, t in enumerate(triples, start=1):
        lines.append(
            f"{i}. ({t.get('s')}) -[{t.get('p')}]-> ({t.get('o')})"
            f"  w={t.get('weight', 1)}"
        )
    return "\n".join(lines)
