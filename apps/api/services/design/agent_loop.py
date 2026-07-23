"""Cursor-style Design Agent loop — tools first, on-demand lookups.

Control plane: model sees canvas tools + lookup index → reply / lookup / ops →
host executes → observe → repeat until done or max turns.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import AsyncIterator
from typing import Any

from services.design.catalog import get_global_rules, list_skills
from services.design.llm_step import complete_skill_step, stream_skill_step
from services.design.models_route import resolve_model_for_skill
from services.design.prompt_build import (
    _create_context_block,
    _edit_context_block,
    _resolve_agent_persona,
)
from services.design.rules_text import _as_text, _rule_flag_on, _rule_text
from services.design.tool_ops_contract import (
    TOOL_OPS_SCHEMA_VERSION,
    extract_and_validate_tool_ops,
    format_canvas_tools_for_model,
    tool_ops_activity_events,
    tool_ops_for_sse,
    validation_failure_reason,
)
from services.design.validate import extract_json

_log = logging.getLogger(__name__)

_LOOKUP_KINDS = frozenset({"skill", "rule", "knowledge", "aesthetics"})
_DESTRUCTIVE_OPS = frozenset({"delete_frame"})
# Host-fixed confirm UX (not Admin knobs). Danger terms are the only delete knob.
_DELETE_CONFIRM_CHOICES = ["确认删除", "先保留"]
_DELETE_CONFIRM_ASK = "删除画板会清掉上面的内容，确认要删除吗？"
_DELETE_CONFIRM_EXACT = frozenset(
    {
        "确认删除",
        "确定删除",
        "确认删",
        "同意删除",
        "删除吧",
        "删了吧",
        "确认",
        "确定",
        "是的",
        "是",
        "yes",
        "y",
        "confirm",
        "ok",
    }
)
_DELETE_CONFIRM_RE = re.compile(
    r"(delete\s*(it|now|please)|\bgo\s*ahead\b)",
    re.I,
)
# Model sometimes claims success without emitting delete ops — host must catch.
_DELETE_CLAIM_RE = re.compile(
    r"已(为你|帮你)?删除|删除成功|已删除",
    re.I,
)
# Fallback when DB rule agent.reply.sanitize_terms is empty / missing.
_DEFAULT_SANITIZE_TERMS = (
    "delete_frame",
    "delete_nodes",
    "create_svg",
    "create_icon",
    "create_shape",
    "create_text",
    "create_frame",
    "update_node",
    "update_frame",
    "ask_user",
    "get_scene_summary",
    "SCENE_NODES",
    "SCENE_FRAMES",
    "FOCUS_FRAME_ID",
    "focus_frame_id",
    "CANVAS_ID",
    "args.frameId",
    "args.nodeId",
    "op_key",
    "tool_ops",
)
_PAREN_ID_RE = re.compile(r"[（(]\s*[A-Za-z][A-Za-z0-9_-]{3,20}\s*[）)]")
_sanitize_re_cache: dict[str, re.Pattern[str]] = {}


def _sanitize_terms_list(rules: dict[str, str] | None) -> list[str]:
    raw = _rule_text(rules, "agent.reply.sanitize_terms", "").strip()
    if not raw:
        return list(_DEFAULT_SANITIZE_TERMS)
    out: list[str] = []
    seen: set[str] = set()
    for part in re.split(r"[\n,;]+", raw):
        t = part.strip()
        if not t:
            continue
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out or list(_DEFAULT_SANITIZE_TERMS)


def _tech_leak_re(rules: dict[str, str] | None) -> re.Pattern[str]:
    terms = _sanitize_terms_list(rules)
    cache_key = "\n".join(t.lower() for t in terms)
    cached = _sanitize_re_cache.get(cache_key)
    if cached is not None:
        return cached
    escaped = [re.escape(t) for t in terms if t]
    pat = re.compile(r"(?:%s)" % "|".join(escaped), re.I) if escaped else re.compile(r"(?!x)x")
    if len(_sanitize_re_cache) > 32:
        _sanitize_re_cache.clear()
    _sanitize_re_cache[cache_key] = pat
    return pat


def _split_rule_list(raw: str) -> list[str]:
    out: list[str] = []
    for line in (raw or "").replace(",", "\n").splitlines():
        item = line.strip()
        if item:
            out.append(item)
    return out


def _delete_danger_terms(rules: dict[str, str] | None) -> list[str]:
    """User phrases that mean destructive intent (Admin: agent.delete.danger_terms)."""
    return _split_rule_list(_rule_text(rules, "agent.delete.danger_terms"))


def _looks_like_destructive_confirm(prompt: str) -> bool:
    """Hardcoded chip / short-yes match after a delete confirm ask."""
    text = (prompt or "").strip()
    if not text:
        return False
    if text.casefold() in {p.casefold() for p in _DELETE_CONFIRM_EXACT}:
        return True
    if _DELETE_CONFIRM_RE.search(text):
        return True
    return False


def _sanitize_user_facing_text(
    text: str,
    *,
    known_ids: list[str] | None = None,
    rules: dict[str, str] | None = None,
) -> str:
    """Strip internal ids / configured leak terms from reply (and thinking)."""
    out = (text or "").strip()
    if not out:
        return out
    out = re.sub(
        r"^\s*(?:用户)?意图分析\s*[:：]\s*",
        "",
        out,
        count=1,
        flags=re.I,
    )
    out = re.sub(
        r"^\s*intent\s*analysis\s*[:：]\s*",
        "",
        out,
        count=1,
        flags=re.I,
    )
    for fid in known_ids or []:
        fid = str(fid or "").strip()
        if len(fid) >= 4:
            out = out.replace(fid, "")
    out = _PAREN_ID_RE.sub("", out)
    out = _tech_leak_re(rules).sub("", out)
    out = re.sub(r"[（(]\s*[）)]", "", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = re.sub(r"\s+([，。！？,.!?])", r"\1", out)
    return out.strip(" ，,")


_THINKING_SUMMARY_SKILL_KEY = "thinking_summary"
# Host-only skills: used by agent_loop, not exposed in SKILL_INDEX / LOOKUP.
_HOST_SKILL_KEYS = frozenset({_THINKING_SUMMARY_SKILL_KEY})


def _skill_by_key(skill_key: str) -> dict[str, Any] | None:
    key = (skill_key or "").strip().lower()
    if not key:
        return None
    for sk in list_skills():
        if str(sk.get("skill_key") or "").strip().lower() == key:
            return sk
    return None


def _is_host_skill(sk: dict[str, Any]) -> bool:
    key = str(sk.get("skill_key") or "").strip().lower()
    return key in _HOST_SKILL_KEYS


async def _ai_summarize_thinking(
    raw: str,
    *,
    model_family: str,
    rules: dict[str, str],
    known_ids: list[str] | None = None,
) -> tuple[str, int]:
    """Summarize CoT via pluggable Skill ``thinking_summary`` (Admin Skill 池)."""
    thinking = (raw or "").strip()
    if not thinking:
        return "", 0
    skill = _skill_by_key(_THINKING_SUMMARY_SKILL_KEY)
    if not skill:
        _log.info("thinking summary skipped: skill `%s` not found", _THINKING_SUMMARY_SKILL_KEY)
        return "", 0
    system = str(skill.get("prompt_positive") or "").strip()
    if not system:
        _log.info("thinking summary skipped: skill `%s` has empty prompt", _THINKING_SUMMARY_SKILL_KEY)
        return "", 0
    neg = str(skill.get("prompt_negative") or "").strip()
    if neg:
        system = f"{system}\n\nAvoid:\n{neg}"
    if len(thinking) > 8000:
        thinking = thinking[-8000:]
    summ_model = (
        str(skill.get("default_model") or "").strip()
        or model_family
    )
    try:
        out, tokens = await complete_skill_step(
            model_family=summ_model,
            system=system,
            user=thinking,
            max_tokens=256,
        )
    except Exception:
        _log.exception("thinking summary failed")
        return "", 0
    summary = _sanitize_user_facing_text(
        (out or "").strip(),
        known_ids=known_ids,
        rules=rules,
    )
    if len(summary) > 280:
        summary = summary[:277].rstrip("，,;；、") + "…"
    return summary, tokens


def _parse_choices(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw[:6]:
        s = str(item or "").strip()
        if s and s not in out and s != "取消":
            out.append(s[:40])
    return out


def _max_turns(rules: dict[str, str]) -> int:
    raw = _rule_text(rules, "execute.agent_rounds", "6").strip() or "6"
    try:
        return max(1, min(12, int(raw)))
    except ValueError:
        return 6


def _skill_index_block(*, prefer_ids: list[int] | None = None) -> str:
    """Skill packs as on-demand lookups — not an execution order."""
    lines = [
        "SKILL_INDEX (lookup kind=skill, query=skill_key or name):"
    ]
    skills = [sk for sk in list_skills() if not _is_host_skill(sk)]
    if prefer_ids:
        by_id = {int(s["id"]): s for s in skills if s.get("id") is not None}
        ordered: list[dict[str, Any]] = []
        seen: set[int] = set()
        for sid in prefer_ids:
            sk = by_id.get(int(sid))
            if sk and int(sid) not in seen:
                ordered.append(sk)
                seen.add(int(sid))
        for sk in skills:
            sid = int(sk.get("id") or 0)
            if sid and sid not in seen:
                ordered.append(sk)
        skills = ordered
    for sk in skills[:40]:
        key = str(sk.get("skill_key") or sk.get("name") or "").strip()
        if not key:
            continue
        if key.strip().lower() in _HOST_SKILL_KEYS:
            continue
        name = str(sk.get("name") or key).strip()
        cat = str(sk.get("category") or "").strip()
        lines.append(f"- `{key}` ({cat}): {name}")
    if len(lines) == 1:
        lines.append("- (none enabled)")
    return "\n".join(lines)


def _knowledge_index_block(*, scene: str) -> str:
    try:
        from services.design.knowledge_store import KIND_LABELS, list_knowledge

        rows = list_knowledge(enabled=True, ensure=False)[:30]
    except Exception:
        return "KNOWLEDGE_INDEX: (unavailable)"
    lines = [
        "KNOWLEDGE_INDEX (lookup kind=knowledge, query=kind or title substring):"
    ]
    scene_l = (scene or "website").strip().lower()
    for r in rows:
        scenes = str(r.get("scenes") or "all").lower()
        if scenes != "all" and scene_l not in {
            p.strip() for p in scenes.split(",") if p.strip()
        }:
            continue
        kind = str(r.get("kind") or "")
        title = str(r.get("title") or "")
        when = str(r.get("whenToUse") or r.get("when_to_use") or "").strip()
        label = KIND_LABELS.get(kind, kind)
        extra = f" — {when}" if when else ""
        lines.append(f"- `{kind}` 【{label}·{title}】{extra}")
    if len(lines) == 1:
        lines.append("- (none for scene)")
    return "\n".join(lines)


def _privacy_prompt_block(rules: dict[str, str] | None) -> str:
    """Tell the model which terms must not appear — same source as hard scrub."""
    terms = _sanitize_terms_list(rules)
    # Cap so the system prompt stays readable; scrub still uses the full list.
    shown = terms[:40]
    joined = ", ".join(shown)
    extra = f" (+{len(terms) - len(shown)} more)" if len(terms) > len(shown) else ""
    return (
        "PRIVACY (thinking + reply — never leak internals):\n"
        "- Do not write frame/node ids; say「当前画板」「该元素」.\n"
        "- Do not write these terms (ops / protocol): "
        f"{joined}{extra}.\n"
        "- Ops JSON may still use real ids/op names; only hide them from users."
    )


def build_agent_system(
    *,
    rules: dict[str, str],
    scene_key: str,
    w: int,
    h: int,
    style_contract: str = "",
    template_brief: str = "",
    illus_note: str = "",
    prefer_skill_ids: list[int] | None = None,
    user_selected_model: str | None = None,
) -> str:
    persona = _resolve_agent_persona(rules, user_selected_model)
    tools = format_canvas_tools_for_model()
    tip = (
        _rule_text(rules, "edit.tool_ops").strip()
        or _rule_text(rules, "create.tool_ops").strip()
        or "Emit canvas tool_ops using the listed op keys only."
    )
    choices_hint = json.dumps(_DELETE_CONFIRM_CHOICES, ensure_ascii=False)
    danger = _delete_danger_terms(rules)
    danger_hint = (
        "User danger phrases (require confirm before delete_frame): "
        + ", ".join(f"`{t}`" for t in danger[:24])
        if danger
        else ""
    )
    core = _rule_text(rules, "agent.loop.system").strip() or (
        "You are the Design Agent for a canvas editor (Cursor-style tool loop).\n"
        "First turn already includes canvas tools (the playbook). Decide yourself:\n"
        "- Chat / greeting / no canvas work → reply only, done=true, no ops.\n"
        "- You know how to mutate → emit ops and finish (done=true).\n"
        "- Need design guidance → lookups (skills/rules/knowledge/aesthetics), "
        "done=false; next turn use materials then emit ops.\n"
        "Look up materials only when useful.\n"
        "Never invent op names. Thinking/reasoning and user-facing reply "
        "must both match the user's language (e.g. Chinese user → Chinese thought + reply).\n"
        "delete_frame: DESTRUCTIVE. On first request, do NOT emit delete_frame — "
        f"reply asking confirmation + choices {choices_hint}, done=true. "
        "Only after the user clearly confirms, emit delete_frame using SCENE_FRAMES ids. "
        "Never claim deletion succeeded if ops were not emitted.\n"
        "create_svg/create_icon: pass well-formed SVG (full <svg viewBox=\"0 0 24 24\">…</svg> "
        "or path/circle fragment). path d must use spaced SVG commands — never glue numbers."
    )
    parts = [
        persona,
        core,
        danger_hint,
        _privacy_prompt_block(rules),
        tools,
        tip,
        f"Canvas {w}x{h}. Scene={scene_key}.",
        illus_note,
        style_contract,
        template_brief,
        _skill_index_block(prefer_ids=prefer_skill_ids),
        _knowledge_index_block(scene=scene_key),
        "RULE_LOOKUP: kind=rule, query=rule_key prefix (e.g. edit. / face. / summary.).",
        "AESTHETICS_LOOKUP: kind=aesthetics, query=short design brief for good samples.",
        "OUTPUT each turn: JSON only with keys:\n"
        '  reply?: string\n'
        '  choices?: string[]  // optional quick-reply chips (e.g. confirm delete)\n'
        '  lookups?: [{kind:"skill"|"rule"|"knowledge"|"aesthetics", query:string}]  // max 3\n'
        "  ops?: [{name, args}]  // canvas tool_ops\n"
        "  done?: boolean  // true when finished (default true if ops applied and no lookups)",
    ]
    return "\n\n".join(p for p in parts if p and str(p).strip())


def _parse_turn(content: str) -> dict[str, Any]:
    data = extract_json(content or "")
    if not isinstance(data, dict):
        # Bare ops list or prose-only
        ops, _ = extract_and_validate_tool_ops(content, scene_nodes=None, rules=None)
        reply = ""
        if not ops:
            reply = (content or "").strip()
            # Strip fenced JSON leftovers
            if reply.startswith("{") or reply.startswith("```"):
                reply = re.sub(r"```(?:json)?\s*", "", reply)
                reply = re.sub(r"```\s*$", "", reply).strip()
                if reply.startswith("{"):
                    reply = ""
        return {
            "reply": reply,
            "choices": [],
            "lookups": [],
            "ops_raw": content,
            "done": True,
            "_bare_ops": ops,
        }
    lookups_raw = data.get("lookups") or data.get("lookup") or []
    lookups: list[dict[str, str]] = []
    if isinstance(lookups_raw, dict):
        lookups_raw = [lookups_raw]
    if isinstance(lookups_raw, list):
        for item in lookups_raw[:3]:
            if not isinstance(item, dict):
                continue
            kind = str(item.get("kind") or item.get("type") or "").strip().lower()
            query = str(item.get("query") or item.get("key") or item.get("id") or "").strip()
            if kind in _LOOKUP_KINDS and query:
                lookups.append({"kind": kind, "query": query})
    reply = str(data.get("reply") or data.get("message") or data.get("summary") or "").strip()
    choices = _parse_choices(data.get("choices") or data.get("options"))
    done_raw = data.get("done")
    if done_raw is None:
        done = not lookups
    else:
        done = bool(done_raw)
    return {
        "reply": reply,
        "choices": choices,
        "lookups": lookups,
        "ops_raw": data,
        "done": done,
        "_bare_ops": None,
    }


def _resolve_lookups(
    lookups: list[dict[str, str]],
    *,
    rules: dict[str, str],
    scene_key: str,
    prompt: str,
) -> tuple[str, list[str]]:
    chunks: list[str] = []
    image_urls: list[str] = []
    for item in lookups:
        kind = item["kind"]
        query = item["query"]
        if kind == "skill":
            chunks.append(_lookup_skill(query))
        elif kind == "rule":
            chunks.append(_lookup_rule(rules, query))
        elif kind == "knowledge":
            chunks.append(_lookup_knowledge(scene_key, query))
        elif kind == "aesthetics":
            text, urls = _lookup_aesthetics(scene_key, query or prompt)
            chunks.append(text)
            for u in urls:
                if u and u not in image_urls:
                    image_urls.append(u)
    body = "\n\n".join(c for c in chunks if c) or "(no lookup results)"
    return body, image_urls[:4]


def _lookup_skill(query: str) -> str:
    q = query.strip().lower()
    best: dict[str, Any] | None = None
    for sk in list_skills():
        if _is_host_skill(sk):
            continue
        key = str(sk.get("skill_key") or "").strip().lower()
        name = str(sk.get("name") or "").strip().lower()
        if q == key or q == name or q in key or q in name:
            best = sk
            break
    if not best:
        return f"LOOKUP skill `{query}`: not found."
    pos = str(best.get("prompt_positive") or "").strip()
    neg = str(best.get("prompt_negative") or "").strip()
    key = str(best.get("skill_key") or best.get("name") or "")
    body = f"LOOKUP skill `{key}`:\n{pos}"
    if neg:
        body += f"\n\nAvoid:\n{neg}"
    return body[:12000]


def _lookup_rule(rules: dict[str, str], query: str) -> str:
    q = query.strip().lower()
    matches: list[str] = []
    for k, v in sorted(rules.items()):
        kl = k.lower()
        if kl == q or kl.startswith(q) or q in kl:
            val = str(v or "").strip()
            if val:
                matches.append(f"{k}:\n{val}")
        if len(matches) >= 8:
            break
    if not matches:
        return f"LOOKUP rule `{query}`: no keys matched."
    return "LOOKUP rules:\n\n" + "\n\n".join(matches)[:10000]


def _lookup_knowledge(scene_key: str, query: str) -> str:
    try:
        from services.design.knowledge_store import (
            format_knowledge_block,
            list_for_injection,
            list_knowledge,
        )
    except Exception as err:
        return f"LOOKUP knowledge failed: {err}"
    q = query.strip().lower()
    rows = []
    for r in list_knowledge(enabled=True, ensure=False):
        kind = str(r.get("kind") or "").lower()
        title = str(r.get("title") or "").lower()
        if q == kind or q in kind or q in title:
            rows.append(r)
    if not rows:
        # Fall back to scene layout/refine pack filtered by query token
        for cat in ("layout", "refine", "validate"):
            rows.extend(list_for_injection(scene=scene_key, skill_category=cat))
        rows = [
            r
            for r in rows
            if q in str(r.get("kind") or "").lower()
            or q in str(r.get("title") or "").lower()
            or not q
        ][:6]
    if not rows:
        return f"LOOKUP knowledge `{query}`: none."
    return "LOOKUP knowledge:\n" + format_knowledge_block(rows[:6])[:10000]


def _lookup_aesthetics(scene_key: str, query: str) -> tuple[str, list[str]]:
    try:
        from services.design.aesthetics.scorer import retrieve_aesthetic_refs

        refs = retrieve_aesthetic_refs(
            prompt=query,
            scene=scene_key,
            top_k=4,
        )
    except Exception as err:
        return f"LOOKUP aesthetics failed: {err}", []
    if not isinstance(refs, dict):
        return "LOOKUP aesthetics: empty.", []
    guidance = str(refs.get("guidance") or refs.get("text") or "").strip()
    samples = refs.get("refs") or refs.get("samples") or refs.get("items") or []
    raw_urls = refs.get("imageUrls") or refs.get("image_urls") or []
    image_urls = [
        str(u).strip()
        for u in (raw_urls if isinstance(raw_urls, list) else [])
        if isinstance(u, str) and u.strip()
    ][:4]
    lines = ["LOOKUP aesthetics:"]
    if guidance:
        lines.append(guidance)
    if image_urls:
        lines.append(
            "Aesthetic reference images will be attached as vision input on the next turn."
        )
        for u in image_urls:
            lines.append(f"- {u[:240]}")
    if isinstance(samples, list):
        for i, s in enumerate(samples[:4]):
            if isinstance(s, dict):
                label = str(
                    s.get("name") or s.get("title") or s.get("id") or ""
                )[:80]
                lines.append(f"- sample[{i}]: {label}")
            else:
                lines.append(f"- sample[{i}]: {str(s)[:80]}")
    text = (
        "\n".join(lines)[:8000]
        if len(lines) > 1
        else "LOOKUP aesthetics: empty."
    )
    return text, image_urls

async def run_agent_turns(
    *,
    prompt: str,
    rules: dict[str, str],
    scene_key: str,
    w: int,
    h: int,
    scene_nodes: list[dict[str, Any]],
    scene_frames: list[dict[str, Any]] | None = None,
    canvas_id: str = "",
    focus_frame_id: str = "",
    current_svg: str,
    user_selected_model: str | None,
    ref_images: list[str] | None,
    mem_blocks: str,
    style_contract: str = "",
    template_brief: str = "",
    illus_note: str = "",
    task_id: str,
    enable_scene_feedback: bool = True,
    prefer_skill_ids: list[int] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Yield SSE events for the tool-first agent loop."""
    from services.design import scene_feedback as scene_fb
    from services.design.pipeline_support import (
        _apply_frames_after_ops,
        _apply_ops_to_scene_nodes,
    )

    # Mutable vision bag: user refs + aesthetics lookups appended mid-loop.
    refs: list[str] = list(ref_images or [])
    system = build_agent_system(
        rules=rules,
        scene_key=scene_key,
        w=w,
        h=h,
        style_contract=style_contract,
        template_brief=template_brief,
        illus_note=illus_note,
        prefer_skill_ids=prefer_skill_ids,
        user_selected_model=user_selected_model,
    )
    family, reason = resolve_model_for_skill(
        skill={
            "category": "refine",
            "default_model": "doubao",
            "name": "agent_loop",
            "skill_key": "agent_loop",
        },
        user_selected_model=user_selected_model,
        run_mode="agent",
        prompt=prompt,
        rules=rules,
        scene=scene_key,
        attempt=0,
        has_images=bool(refs),
    )
    fam_l = str(family or "").lower()
    if "think" in fam_l or "reason" in fam_l or fam_l.endswith("-r1"):
        if not _rule_flag_on(rules, "execute.thinking", "0"):
            family = _rule_text(rules, "intent.classifier.model") or "doubao"
            reason = f"{reason}+forced_non_thinking"

    nodes = [n for n in scene_nodes if isinstance(n, dict) and n.get("id")][:120]
    frames = [
        dict(f)
        for f in (scene_frames or [])
        if isinstance(f, dict) and f.get("id")
    ][:32]
    _log.info(
        "[agent_loop] start canvas_id=%r focus=%r nodes=%s frames=%s "
        "node_ids=%s frame_ids=%s",
        canvas_id or None,
        focus_frame_id or None,
        len(nodes),
        len(frames),
        [str(n.get("id")) for n in nodes[:12]],
        [
            {
                "id": str(f.get("id")),
                "is_empty": f.get("is_empty"),
                "name": f.get("name"),
            }
            for f in frames[:8]
        ],
    )
    svg = current_svg or ""
    max_turns = _max_turns(rules)
    continue_hint = _rule_text(rules, "execute.continue_hint").strip()
    total_tokens = 0
    actual_models: list[dict[str, Any]] = []
    applied_ops_log: list[dict[str, Any]] = []
    applied_any = False
    last_reply = ""
    last_choices: list[str] = []
    materials = ""

    known_ids = [
        str(f.get("id") or "").strip()
        for f in frames
        if isinstance(f, dict) and f.get("id")
    ]
    known_ids.extend(
        str(n.get("id") or "").strip()
        for n in nodes
        if isinstance(n, dict) and n.get("id")
    )

    user0_parts = [
        f"USER_PROMPT:\n{prompt}",
        f"CANVAS: {w}x{h} scene={scene_key}",
    ]
    # Prefer EDIT when we have nodes/svg, or any non-empty artboard in SCENE_FRAMES.
    # Never tell the model "canvas empty" while frames with content are listed.
    frames_have_content = any(
        isinstance(f, dict) and not bool(f.get("is_empty", True)) for f in frames
    )
    if nodes or (svg or "").strip() or frames_have_content:
        user0_parts.append(
            _edit_context_block(
                rules,
                svg,
                include_full_svg=False,
                scene_nodes=nodes,
                scene_frames=frames,
                canvas_id=canvas_id,
                focus_frame_id=focus_frame_id,
            )
        )
        if frames_have_content and not nodes and not (svg or "").strip():
            user0_parts.append(
                "SCENE_NODES: (not in this payload). Artboards above are NOT empty — "
                "use SCENE_FRAMES ids. To refresh element inventory emit "
                "get_scene_summary with done=false (host will re-sync from canvas)."
            )
    else:
        create_blk = _create_context_block(rules, w=w, h=h, scene_key=scene_key)
        user0_parts.append(create_blk)
        if frames:
            try:
                raw_frames = json.dumps(frames, ensure_ascii=False)
            except Exception:
                raw_frames = "[]"
            user0_parts.append(
                "SCENE_FRAMES (artboard ids — use these for delete_frame / update_frame):\n"
                f"{raw_frames[:8000]}"
            )
        if canvas_id:
            user0_parts.append(f"CANVAS_ID: {canvas_id}")
        if focus_frame_id:
            user0_parts.append(f"FOCUS_FRAME_ID: {focus_frame_id}")
        if not frames:
            user0_parts.append(
                "SCENE_NODES: [] (no artboards reported — emit create_* ops)."
            )
    if mem_blocks:
        user0_parts.append(f"MEMORY:\n{mem_blocks[:6000]}")
    messages_user = "\n\n".join(p for p in user0_parts if p)

    for turn in range(max_turns):
        yield {
            "type": "skill_start",
            "index": turn,
            "skill_id": None,
            "skill_key": "agent_loop",
            "skill_name": "agent",
            "category": "agent",
            "model": family,
            "model_reason": reason,
            "agent_round": turn + 1,
        }
        user_msg = messages_user
        if materials:
            user_msg = f"{user_msg}\n\nMATERIALS_FROM_LOOKUPS:\n{materials}"
        # Authoritative live inventory (updated after scene_feedback / op apply).
        # Without this, "query canvas" / get_scene_summary never reaches the model.
        if nodes or frames:
            try:
                live_frames = json.dumps(frames, ensure_ascii=False)[:8000]
            except Exception:
                live_frames = "[]"
            try:
                live_nodes = json.dumps(nodes, ensure_ascii=False)[:16000]
            except Exception:
                live_nodes = "[]"
            user_msg += (
                "\n\nLIVE_SCENE_FRAMES (current artboards — prefer these ids):\n"
                f"{live_frames}"
                "\n\nLIVE_SCENE_NODES (current elements; empty list means none synced yet):\n"
                f"{live_nodes}"
            )
            _log.info(
                "[agent_scene] turn=%s live frames=%s nodes=%s",
                turn + 1,
                len(frames),
                len(nodes),
            )
        if turn > 0:
            hint = (
                continue_hint
                or "Continue with ops or reply; set done=true when finished."
            )
            user_msg += f"\n\nAGENT_ROUND: {turn + 1}/{max_turns}. {hint}"

        content = ""
        thinking_buf = ""
        used = 0
        t_stream = time.time()
        async for kind, piece in stream_skill_step(
            model_family=family,
            system=system,
            user=user_msg,
            max_tokens=4096,
            images=refs or None,
            enable_thinking=_rule_flag_on(rules, "execute.thinking", "0"),
        ):
            if kind == "usage":
                used = int(piece) if isinstance(piece, int) else used
                continue
            if kind == "token" and isinstance(piece, str):
                content += piece
                if len(content) % 120 < len(piece):
                    yield {
                        "type": "skill_progress",
                        "index": turn,
                        "skill_key": "agent_loop",
                        "skill_name": "agent",
                        "chars": len(content),
                    }
            # Buffer CoT — do not stream raw thinking to the client.
            if kind == "thinking" and isinstance(piece, str) and piece.strip():
                thinking_buf += piece

        # After thinking finishes: AI one-paragraph summary for the Thought UI.
        if thinking_buf.strip():
            summary, summ_tokens = await _ai_summarize_thinking(
                thinking_buf,
                model_family=family,
                rules=rules,
                known_ids=known_ids,
            )
            if summ_tokens:
                used = max(used, 0) + summ_tokens
            if summary:
                yield {
                    "type": "thinking",
                    "text": summary,
                    "replace": True,
                }

        if used <= 0:
            used = max(1, len(content) // 3)
        total_tokens += used
        actual_models.append(
            {
                "skill": "agent_loop",
                "round": turn + 1,
                "user": user_selected_model,
                "actual": family,
                "reason": reason,
                "took_s": round(time.time() - t_stream, 2),
            }
        )

        parsed = _parse_turn(content)
        reply = _sanitize_user_facing_text(
            str(parsed.get("reply") or "").strip(),
            known_ids=known_ids,
            rules=rules,
        )
        choices = list(parsed.get("choices") or [])
        if reply:
            last_reply = reply
            # Stream as analysis for process chrome (user-facing, not protocol).
            yield {
                "type": "analysis",
                "text": reply,
                "skill_name": "agent",
                "index": turn,
            }

        lookups = list(parsed.get("lookups") or [])
        if lookups:
            materials_chunk, aes_urls = _resolve_lookups(
                lookups,
                rules=rules,
                scene_key=scene_key,
                prompt=prompt,
            )
            materials = (
                f"{materials}\n\n{materials_chunk}".strip()
                if materials
                else materials_chunk
            )
            for u in aes_urls:
                if u not in refs:
                    refs.append(u)
            refs = refs[:6]
            if aes_urls:
                yield {
                    "type": "status",
                    "status": "aesthetic_refs",
                    "count": len(aes_urls),
                }
            yield {
                "type": "activity",
                "kind": "explored",
                "status": "done",
                "detail": ", ".join(
                    f"{x['kind']}:{x['query']}" for x in lookups
                )[:200],
                "skill_name": "agent",
                "index": turn,
            }

        step_ops: list[dict[str, Any]] = []
        op_errors: list[str] = []
        # Always re-validate with scene (SVG path checks live here).
        step_ops, op_errors = extract_and_validate_tool_ops(
            parsed.get("ops_raw"),
            scene_nodes=nodes,
            scene_frames=frames,
            rules=rules,
        )

        confirm_ok = _looks_like_destructive_confirm(prompt)
        frame_ids_now = [
            str(f.get("id") or "").strip()
            for f in frames
            if isinstance(f, dict) and f.get("id")
        ]
        _log.info(
            "[agent_delete] turn=%s confirm=%s prompt=%r reply_claim=%s "
            "frames=%s ops_in=%s errors=%s",
            turn + 1,
            confirm_ok,
            (prompt or "")[:80],
            bool(_DELETE_CLAIM_RE.search(reply or "")),
            frame_ids_now,
            [
                {
                    "name": str(o.get("name") or ""),
                    "args": o.get("args") if isinstance(o.get("args"), dict) else {},
                }
                for o in step_ops
                if str(o.get("name") or "").strip()
                in ("delete_frame", "delete_nodes")
            ]
            or [
                str(o.get("name") or "")
                for o in step_ops[:8]
            ],
            op_errors[:8],
        )

        # Gate destructive deletes until the user confirms (chips hardcoded).
        destructive = [
            o
            for o in step_ops
            if str(o.get("name") or "").strip() in _DESTRUCTIVE_OPS
        ]
        if destructive and not confirm_ok:
            _log.warning(
                "[agent_delete] gated %s delete_frame op(s) — need confirm chip",
                len(destructive),
            )
            step_ops = [
                o
                for o in step_ops
                if str(o.get("name") or "").strip() not in _DESTRUCTIVE_OPS
            ]
            if not choices:
                choices = list(_DELETE_CONFIRM_CHOICES)
            ask = _DELETE_CONFIRM_ASK
            if not reply or _DELETE_CLAIM_RE.search(reply):
                reply = ask
                last_reply = reply
                yield {
                    "type": "analysis",
                    "text": reply,
                    "skill_name": "agent",
                    "index": turn,
                }
            yield {
                "type": "activity",
                "kind": "skipped",
                "status": "done",
                "detail": "需先确认再删除画板",
                "skill_name": "agent",
                "index": turn,
            }
            # Wait for user chip — do not keep looping as if ops failed.
            parsed["done"] = True
            lookups = []

        delete_ops_final = [
            o
            for o in step_ops
            if str(o.get("name") or "").strip() in ("delete_frame", "delete_nodes")
        ]
        # Model lied: claimed deleted but no delete op survived validation/gate.
        if _DELETE_CLAIM_RE.search(reply or "") and not delete_ops_final:
            _log.warning(
                "[agent_delete] false claim — reply said deleted but no delete ops "
                "(confirm=%s errors=%s)",
                confirm_ok,
                op_errors[:8],
            )
            reply = (
                "删除没有真正执行：没有可用的删除操作"
                + (
                    "（画板 id 无效或与当前场景不一致）"
                    if op_errors
                    else "（模型未发出删除画板/图层指令）"
                )
                + "。请再点一次确认，或说明要删哪几块画板。"
            )
            last_reply = reply
            yield {
                "type": "analysis",
                "text": reply,
                "skill_name": "agent",
                "index": turn,
            }
            if not choices:
                choices = list(_DELETE_CONFIRM_CHOICES)

        if choices:
            last_choices = choices

        if op_errors:
            err_lines = "\n".join(f"- {e}" for e in op_errors[:12])
            err_block = (
                "OP_VALIDATION_ERRORS — fix and re-emit only the failed ops "
                "(especially create_svg/create_icon): keep valid XML, "
                "viewBox 0 0 24 24 preferred, path d with spaced commands "
                "(MmLlHhVvCcSsQqTtAaZz + numbers). Do not glue arc params.\n"
                f"{err_lines}"
            )
            materials = (
                f"{materials}\n\n{err_block}".strip() if materials else err_block
            )
            yield {
                "type": "activity",
                "kind": "skipped",
                "status": "done",
                "detail": validation_failure_reason(op_errors)[:200],
                "skill_name": "agent",
                "index": turn,
            }

        if step_ops:
            applied_any = True
            applied_ops_log.extend(step_ops)
            if delete_ops_final:
                _log.info(
                    "[agent_delete] emitting tool_ops delete=%s",
                    [
                        {
                            "name": str(o.get("name") or ""),
                            "args": o.get("args")
                            if isinstance(o.get("args"), dict)
                            else {},
                        }
                        for o in delete_ops_final
                    ],
                )
            # Observe op: keep looping and pull FE inventory into next turn.
            if any(
                str(o.get("name") or "").strip() == "get_scene_summary"
                for o in step_ops
            ):
                parsed["done"] = False
                _log.info("[agent_scene] get_scene_summary → force scene_feedback")
            yield {
                "type": "tool_ops",
                "index": turn,
                "skill_id": None,
                "skill_key": "agent_loop",
                "skill_name": "agent",
                "schema_version": TOOL_OPS_SCHEMA_VERSION,
                "ops": tool_ops_for_sse(step_ops),
                "agent_round": turn + 1,
            }
            for act in tool_ops_activity_events(
                batch=step_ops,
                totals={"created": 0, "updated": 0, "deleted": 0},
                skill_index=turn,
            ):
                yield act
            nodes = _apply_ops_to_scene_nodes(nodes, step_ops)
            frames = _apply_frames_after_ops(frames, step_ops)

            if (
                enable_scene_feedback
                and turn + 1 < max_turns
                and not parsed.get("done")
            ):
                await scene_fb.begin_wait(task_id, round_n=turn + 1)
                yield {
                    "type": "scene_feedback_request",
                    "task_id": task_id,
                    "round": turn + 1,
                    "rounds": max_turns,
                    "wait_ms": 8000,
                }
                fresh = await scene_fb.wait_for_scene(task_id, timeout_sec=8.0)
                if fresh is not None:
                    fresh_nodes = fresh.get("nodes")
                    fresh_frames = fresh.get("frames")
                    if isinstance(fresh_nodes, list):
                        nodes = [
                            n for n in fresh_nodes if isinstance(n, dict) and n.get("id")
                        ][:120]
                    if isinstance(fresh_frames, list) and fresh_frames:
                        frames = [
                            f for f in fresh_frames if isinstance(f, dict) and f.get("id")
                        ][:32]

        yield {
            "type": "skill_done",
            "index": turn,
            "skill_id": None,
            "skill_key": "agent_loop",
            "skill_name": "agent",
            "tokens": used,
        }

        done = bool(parsed.get("done"))
        # Invalid ops (e.g. broken SVG) → another turn with OP_VALIDATION_ERRORS.
        if op_errors and turn + 1 < max_turns:
            continue
        # Chat-only or finished with ops
        if done and not lookups:
            break
        # Lookups requested → continue even if done=true
        if lookups:
            continue
        if done:
            break
        if not step_ops and not reply and not lookups:
            break

    summary = _sanitize_user_facing_text(
        last_reply, known_ids=known_ids, rules=rules
    )
    if not summary and applied_any:
        summary = (
            _rule_text(rules, "summary.direct_edit").strip()
            or _rule_text(rules, "summary.fallback_edit").strip()
            or ""
        )
    if not summary and not applied_any:
        summary = last_reply

    yield {
        "type": "_agent_loop_meta",
        "total_tokens": total_tokens,
        "actual_models": actual_models,
        "applied_ops": applied_ops_log,
        "tool_ops_applied": applied_any,
        "summary": summary,
        "choices": last_choices,
        "chat_only": not applied_any,
        "scene_nodes": nodes,
    }
