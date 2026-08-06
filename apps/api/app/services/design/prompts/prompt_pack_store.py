"""Prompt packs — single local seed ``design_prompt_packs_seed.json`` (need_* + system keys)."""
from __future__ import annotations

import json
import threading
import time
from typing import Any

from app.core.config import resolve_data_file
from app import crud
from app.core.db import engine
from app.services.design.readpath.catalog import ensure_design_catalog
from sqlmodel import Session

_PACKS_READY = False
_PACKS_LOCK = threading.RLock()


def _load_prompt_packs_seed() -> tuple[dict[str, str], list[dict[str, Any]]]:
    path = resolve_data_file("design_prompt_packs_seed.json")
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}, []
    if not isinstance(parsed, dict):
        return {}, []
    labels_raw = parsed.get("kindLabels") or {}
    labels = (
        {str(k): str(v) for k, v in labels_raw.items()}
        if isinstance(labels_raw, dict)
        else {}
    )
    items_raw = parsed.get("items") or []
    items = (
        [x for x in items_raw if isinstance(x, dict)]
        if isinstance(items_raw, list)
        else []
    )
    return labels, items


KIND_LABELS, _SEED = _load_prompt_packs_seed()

_SEED_BY_KIND: dict[str, dict[str, Any]] = {
    str(item.get("kind") or "").strip(): item
    for item in _SEED
    if str(item.get("kind") or "").strip()
}


def db_prompt_body(key: str) -> str:
    """Enabled body from ``design_prompt_pack`` (then legacy ``design_system_prompt``). No seed."""
    kind = str(key or "").strip()
    if not kind:
        return ""
    with Session(engine) as session:
        body = crud.get_design_prompt_pack_body(session=session, kind=kind)
        if body:
            return body
        try:
            from app.services.design.prompts.system_prompt_store import is_system_prompt_key

            if not is_system_prompt_key(kind):
                return ""
            row = crud.get_design_system_prompt(session=session, prompt_key=kind)
            if not row or not int(row.enabled or 0):
                return ""
            return str(row.body or "").strip()
        except Exception:
            return ""


def seed_prompt_body(key: str) -> str:
    """Local bootstrap only — use when DB has no non-empty body for this key."""
    item = _SEED_BY_KIND.get(str(key or "").strip())
    if not item:
        return ""
    return str(item.get("body") or "").strip()


def resolve_prompt_body(key: str, *, rules: dict[str, str] | None = None) -> str:
    """DB / rules first; local seed only if both empty. Raw body (no variable fill)."""
    k = str(key or "").strip()
    if not k:
        return ""
    if rules is not None:
        from app.services.design.prompts.rules_text import _rule_text

        got = _rule_text(rules, k).strip()
        if got:
            return got
    got = db_prompt_body(k)
    if got:
        return got
    return seed_prompt_body(k)


def render_prompt_body(
    key: str,
    *,
    rules: dict[str, str] | None = None,
    **variables: Any,
) -> str:
    """Admin/DB pack → LangChain ``PromptTemplate`` render (all kinds).

    Data source stays ``design_prompt_pack`` / seed / rules; LC only fills
    ``{placeholders}``. Packs without variables still pass through LC.
    """
    from app.services.design.prompts.rules_text import render_prompt_template

    body = resolve_prompt_body(key, rules=rules)
    if not body:
        return ""
    return render_prompt_template(body, **variables)


def _csv_has(csv: str, token: str) -> bool:
    parts = {p.strip().lower() for p in str(csv or "").split(",") if p.strip()}
    if not parts or "all" in parts:
        return True
    return token.strip().lower() in parts


def _pack_kind_from_node(node: dict[str, Any]) -> str:
    """prompt_website / id=prompt_vision / configRef=pack.mobile → website|vision|mobile."""
    for raw in (
        str(node.get("phaseKey") or ""),
        str(node.get("id") or ""),
        str(node.get("configRef") or ""),
    ):
        s = raw.strip().lower()
        if not s:
            continue
        if s.startswith("prompt_"):
            return s[7:]
        if s.startswith("pack."):
            return s[5:]
        if s.startswith("pack:"):
            return s[5:]
    pk = str(node.get("promptKey") or "").strip().lower()
    if pk.startswith("pack."):
        return pk[5:]
    return ""


def _scenes_from_node(node: dict[str, Any], kind: str) -> str:
    inj = node.get("inject") if isinstance(node.get("inject"), dict) else {}
    raw = str(inj.get("scenes") or node.get("scenes") or "").strip()
    if raw:
        return raw
    return kind or "all"


def list_prompt_nodes_from_flow(*, graph: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Legacy helper — Admin flowchart removed; only honor an explicit graph arg."""
    raw_graph = graph if isinstance(graph, dict) else {}
    out: list[dict[str, Any]] = []
    for n in (raw_graph.get("nodes") or []):
        if not isinstance(n, dict):
            continue
        if str(n.get("kind") or "").strip().lower() != "prompt":
            continue
        packs = n.get("promptPacks")
        if isinstance(packs, dict) and packs:
            order = 0
            for kind, raw_pack in packs.items():
                k = str(kind or "").strip().lower()
                if not k:
                    continue
                if isinstance(raw_pack, dict):
                    body = str(raw_pack.get("body") or "").strip()
                    title = str(
                        raw_pack.get("title") or KIND_LABELS.get(k, k)
                    ).strip()
                    when = str(
                        raw_pack.get("whenToUse") or raw_pack.get("when_to_use") or ""
                    ).strip()
                    scenes = str(raw_pack.get("scenes") or "all").strip() or "all"
                else:
                    body = str(raw_pack or "").strip()
                    title = KIND_LABELS.get(k, k)
                    when = ""
                    scenes = "all"
                if not body:
                    continue
                out.append(
                    {
                        "id": 0,
                        "kind": k,
                        "type": PACK_TYPE_NEED,
                        "title": title,
                        "body": body,
                        "whenToUse": when,
                        "scenes": scenes,
                        "sortOrder": order,
                        "enabled": True,
                        "updatedAt": None,
                        "nodeId": str(n.get("id") or ""),
                    }
                )
                order += 10
            continue
        # Legacy: one pack per node (prompt_website …)
        kind = _pack_kind_from_node(n)
        body = str(n.get("promptText") or "").strip()
        if not kind or not body:
            continue
        title = str(n.get("label") or KIND_LABELS.get(kind, kind)).strip()
        when = str(n.get("description") or "").strip()
        out.append(
            {
                "id": 0,
                "kind": kind,
                "type": PACK_TYPE_NEED,
                "title": title,
                "body": body,
                "whenToUse": when,
                "scenes": _scenes_from_node(n, kind),
                "sortOrder": int(n.get("y") or 0),
                "enabled": True,
                "updatedAt": None,
                "nodeId": str(n.get("id") or ""),
            }
        )
    out.sort(key=lambda x: (int(x.get("sortOrder") or 0), str(x.get("kind") or "")))
    return out


# Methodology packs migrated to design_skill (need_skills). Keep empty allowlist
# so format/catalog no longer advertise them; bridge lives in skill_store.
_NEED_PROMPT_KINDS = frozenset()
# Alias used by seed / overlay helpers (legacy kinds still recognized for disable).
RETIRED_NEED_PROMPT_KINDS = frozenset({"design_spec", "vision", "aesthetics"})

PACK_TYPE_NEED = "need"
PACK_TYPE_SYSTEM = "system"
_PACK_TYPES = frozenset({PACK_TYPE_NEED, PACK_TYPE_SYSTEM})

# Graph / product stages — Admin filter + seed ``usedBy``.
PROMPT_PACK_STAGES = (
    "bootstrap",
    "memory",
    "intent",
    "decide",
    "paint",
    "apply",
    "observe",
    "settle",
    "orchestrator",
    "resources",
    "aesthetics",
    "precheck",
    "persona",
    "legacy",
)
_PROMPT_PACK_STAGES = frozenset(PROMPT_PACK_STAGES)


def normalize_used_by(raw: Any) -> list[str]:
    """CSV / list → ordered unique stage codes."""
    parts: list[str] = []
    if isinstance(raw, (list, tuple)):
        parts = [str(x or "").strip().lower() for x in raw]
    else:
        parts = [
            p.strip().lower()
            for p in str(raw or "").replace(";", ",").split(",")
            if p.strip()
        ]
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        if p not in _PROMPT_PACK_STAGES or p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def used_by_csv(raw: Any) -> str:
    return ",".join(normalize_used_by(raw))


def normalize_pack_type(raw: Any, *, kind: str = "") -> str:
    t = str(raw or "").strip().lower()
    if t in _PACK_TYPES:
        return t
    try:
        from app.services.design.prompts.system_prompt_store import is_system_prompt_key

        if is_system_prompt_key(kind):
            return PACK_TYPE_SYSTEM
    except Exception:
        pass
    if str(kind or "").strip().lower() in _NEED_PROMPT_KINDS:
        return PACK_TYPE_NEED
    return PACK_TYPE_NEED if not t else PACK_TYPE_NEED


# Retired scene-category packs (classification never covers all cases).
_OBSOLETE_SCENE_KINDS = frozenset(
    {
        "website",
        "mobile",
        "poster",
        "image",
        "drawing",
        "ecommerce",
        "detail_page",
        "rollup",
        "banner",
        "social",
        "leaflet",
        "card",
    }
)


def is_need_prompt_kind(kind: str) -> bool:
    return str(kind or "").strip().lower() in _NEED_PROMPT_KINDS


def is_need_pack(row: dict[str, Any]) -> bool:
    """Prefer pack ``type`` code; fall back to legacy kind allowlist."""
    t = str(row.get("type") or row.get("pack_type") or "").strip().lower()
    if t:
        return t == PACK_TYPE_NEED
    return is_need_prompt_kind(str(row.get("kind") or ""))


def _pub(r: Any) -> dict[str, Any]:
    def _get(key: str, default: Any = None) -> Any:
        if hasattr(r, key):
            return getattr(r, key)
        try:
            return r[key]
        except Exception:
            return default

    kind = str(_get("kind") or "")
    raw_type = str(_get("pack_type") or "")
    pack_type = normalize_pack_type(raw_type, kind=kind)
    raw_used = str(_get("used_by") or "")
    # Fall back to seed metadata when DB column empty.
    if not raw_used.strip():
        seed_item = _SEED_BY_KIND.get(kind) or {}
        raw_used = seed_item.get("usedBy") or seed_item.get("used_by") or ""
    used_by = normalize_used_by(raw_used)
    updated = _get("updated_at")
    return {
        "id": int(_get("id") or 0),
        "kind": kind,
        "type": pack_type,
        "title": str(_get("title") or ""),
        "body": str(_get("body") or ""),
        "whenToUse": str(_get("when_to_use") or ""),
        "scenes": str(_get("scenes") or "all"),
        "usedBy": used_by,
        "sortOrder": int(_get("sort_order") or 0),
        "enabled": bool(int(_get("enabled") or 0)),
        "updatedAt": int(float(updated) * 1000) if updated else None,
    }


def seed_prompt_overlay_nodes(*, x0: float = 2280, y0: float = 80, dy: float = 140) -> list[dict[str, Any]]:
    """Seed only need_* methodology / vision / aesthetics prompt nodes."""
    out: list[dict[str, Any]] = []
    i = 0
    for item in _SEED:
        kind = str(item.get("kind") or "").strip()
        pack_type = normalize_pack_type(item.get("type"), kind=kind)
        if pack_type != PACK_TYPE_NEED:
            continue
        title = str(item.get("title") or KIND_LABELS.get(kind, kind))
        when = str(item.get("when_to_use") or "")
        scenes = str(item.get("scenes") or "all")
        body = str(item.get("body") or "")
        out.append(
            {
                "id": f"prompt_{kind}",
                "label": title,
                "description": when,
                "kind": "prompt",
                "capability": "prompt",
                "phaseKey": f"prompt_{kind}",
                "configRef": f"pack.{kind}",
                "promptText": body,
                "inject": {
                    "mode": "details",
                    "source": "prompt",
                    "scenes": scenes,
                },
                "x": x0,
                "y": y0 + i * dy,
            }
        )
        i += 1
    return out


def seed_prompt_bank_node(*, x: float = 2280, y: float = 400) -> dict[str, Any]:
    """Deprecated helper: packs dict only (for splitting old prompt_bank graphs)."""
    packs: dict[str, Any] = {}
    for item in _SEED:
        kind = str(item.get("kind") or "").strip()
        if normalize_pack_type(item.get("type"), kind=kind) != PACK_TYPE_NEED:
            continue
        packs[kind] = {
            "title": str(item.get("title") or KIND_LABELS.get(kind, kind)),
            "whenToUse": str(item.get("when_to_use") or ""),
            "scenes": str(item.get("scenes") or "all"),
            "body": str(item.get("body") or ""),
        }
    return {
        "id": "prompt_bank",
        "label": "场景提示词",
        "description": "已废弃：请拆成独立 prompt_* 节点",
        "kind": "prompt",
        "capability": "prompt",
        "phaseKey": "prompt_bank",
        "configRef": "prompt_bank",
        "promptPacks": packs,
        "promptText": "",
        "inject": {"mode": "details", "source": "prompt"},
        "x": x,
        "y": y,
    }


def _prune_prompt_packs_to_seed(session: Session, *, now: float) -> None:
    """Drop obsolete scene packs + retired methodology kinds; leave system keys alone."""
    del now
    from app.models import DesignPromptPack

    drop_kinds = set(_OBSOLETE_SCENE_KINDS) | set(RETIRED_NEED_PROMPT_KINDS)
    if drop_kinds:
        crud.delete_design_prompt_packs_by_kinds(session=session, kinds=drop_kinds)

    seed_by_kind = {
        str(item.get("kind") or "").strip(): item
        for item in _SEED
        if str(item.get("kind") or "").strip() in _NEED_PROMPT_KINDS
    }
    for kind, item in seed_by_kind.items():
        rows = crud.list_design_prompt_packs_by_kind(session=session, kind=kind)
        seed_title = str(item.get("title") or KIND_LABELS.get(kind, kind))
        if not rows:
            pack_type = normalize_pack_type(item.get("type"), kind=kind)
            t = time.time()
            session.add(
                DesignPromptPack(
                    kind=kind,
                    pack_type=pack_type,
                    title=seed_title,
                    body=str(item.get("body") or ""),
                    when_to_use=str(item.get("when_to_use") or ""),
                    scenes=str(item.get("scenes") or "all"),
                    sort_order=int(item.get("sort_order") or 0),
                    enabled=1,
                    created_at=t,
                    updated_at=t,
                )
            )
            continue
        # Keep one row; ensure pack_type = need for these kinds.
        keep_id: int | None = None
        for row in rows:
            if str(row.title or "") == seed_title:
                keep_id = int(row.id or 0)
                break
        if keep_id is None:
            keep = max(rows, key=lambda r: len(str(r.body or "")))
            keep_id = int(keep.id or 0)
        for row in rows:
            rid = int(row.id or 0)
            if rid != keep_id:
                session.delete(row)
            elif rid == keep_id:
                row.pack_type = PACK_TYPE_NEED
                session.add(row)


def _sync_system_prompts_into_packs(session: Session, *, now: float) -> None:
    """One-way migrate design_system_prompt → packs (kind = prompt_key). Skip existing kinds."""
    from app.models import DesignPromptPack

    try:
        rows = crud.list_all_design_system_prompts(session=session)
    except Exception:
        return
    existing = crud.list_design_prompt_pack_kinds(session=session)
    for row in rows:
        key = str(row.prompt_key or "").strip()
        if not key or key in existing:
            continue
        title = str(row.label or "").strip() or key
        body = str(row.body or "")
        when = str(row.description or "").strip()
        sort_order = int(row.sort_order or 0)
        enabled = 1 if int(row.enabled or 0) else 0
        session.add(
            DesignPromptPack(
                kind=key,
                pack_type=PACK_TYPE_SYSTEM,
                title=title,
                body=body,
                when_to_use=when,
                scenes="all",
                sort_order=sort_order,
                enabled=enabled,
                created_at=now,
                updated_at=now,
            )
        )
        existing.add(key)


def ensure_design_prompt_packs() -> None:
    """Seed missing packs from design_prompt_packs_seed.json; prune junk; migrate legacy.

    After first insert, Admin-edited ``body`` / ``used_by`` are preserved (no FORCE sync).
    """
    global _PACKS_READY
    now = time.time()
    with _PACKS_LOCK:
        from app.models import DesignPromptPack
        from app.services.db import init_schema
        from app.services.design.admin.schema import ensure_design_tables_boot

        # Cold unit tests may hit this before FastAPI lifespan — create tables first.
        init_schema()
        ensure_design_tables_boot()

        with Session(engine) as session:
            _prune_prompt_packs_to_seed(session, now=now)
            _sync_system_prompts_into_packs(session, now=now)
            existing_kinds = crud.list_design_prompt_pack_kinds(session=session)
            for item in _SEED:
                kind = str(item.get("kind") or "").strip()
                if not kind or kind in existing_kinds:
                    continue
                title = str(item.get("title") or KIND_LABELS.get(kind, kind)).strip() or kind
                pack_type = normalize_pack_type(item.get("type"), kind=kind)
                used_by = used_by_csv(item.get("usedBy") or item.get("used_by"))
                session.add(
                    DesignPromptPack(
                        kind=kind,
                        pack_type=pack_type,
                        title=title,
                        body=str(item.get("body") or ""),
                        when_to_use=str(item.get("when_to_use") or ""),
                        scenes=str(item.get("scenes") or "all"),
                        used_by=used_by,
                        sort_order=int(item.get("sort_order") or 0),
                        enabled=1,
                        created_at=now,
                        updated_at=now,
                    )
                )
                existing_kinds.add(kind)
            # Admin bodies are source of truth after first insert.
            # Seed only fills missing kinds above; do NOT force-overwrite pack/system bodies.
            # Backfill empty used_by from seed (Admin-set stages are preserved).
            for kind, item in _SEED_BY_KIND.items():
                csv = used_by_csv(item.get("usedBy") or item.get("used_by"))
                if not csv:
                    continue
                for pack in crud.list_design_prompt_packs_by_kind(
                    session=session, kind=kind
                ):
                    if str(pack.used_by or "").strip():
                        continue
                    pack.used_by = csv
                    pack.updated_at = now
                    session.add(pack)
            # Backfill empty pack_type from seed / kind inference (never overwrite Admin-set values).
            for row in crud.list_all_design_prompt_packs(session=session):
                cur = str(row.pack_type or "").strip().lower()
                if cur in _PACK_TYPES:
                    continue
                kind = str(row.kind or "")
                seed_item = _SEED_BY_KIND.get(kind) or {}
                row.pack_type = normalize_pack_type(seed_item.get("type"), kind=kind)
                session.add(row)
            # Bump pack body only when it still matches a known prior seed text.
            _bump_unchanged_oss_prompt_bodies(session, now=now)
            session.commit()
        _PACKS_READY = True


# Prior seed bodies that may be replaced once (custom Admin bodies are kept).
_OSS_PROMPT_BODY_PREV: dict[str, tuple[str, ...]] = {
    "agent.prompt.ask_system": (
        "# Ask mode\n"
        "If key info is missing, ask the user. tool_ops must be [] in decide.\n"
        "Do not claim work was already applied.\n"
        "When asking: intent=ask, non-empty reply; optional choice_* fields per schema.\n",
        "# 指令 · Ask 追问（模式规则）\n"
        "当前为 Ask 模式。缺关键信息时先向用户追问；信息够了再进入落层。\n"
        "决策阶段 tool_ops 必须 []（由落层阶段生成）。\n"
        "禁止在未真正落层前说「已为你添加 / 已添加 / I've added」。\n"
        "\n"
        "追问时（字段以共用协议为准）：\n"
        "- intent=ask；reply 非空，只追问参数\n"
        "- 可用 choice_ui：mode=confirm|single|multi|buttons|text；options[].action=apply|reply|dismiss\n"
        "- 简单加形未给尺寸/颜色 → ask + 2～3 个选项\n"
        "- 用户已答齐 → intent=edit|create；reply 简述将做的事（可用「准备添加…」）\n"
        "- 创作前信息明显不全 → 可 need_skills 含 user.brief_intake，intent=ask\n",
        """# 指令 — Ask 追问（模式约束）
当前为 Ask 模式：缺关键关键信息时向用户追问；信息齐后可准备落笔，但须等用户确认才真正 apply。
思考阶段 tool_ops 必须 []（落笔由 paint/propose 完成）。
禁止在未真正落笔前说「已为你添加 / 已完成 / I've added」。

## 澄清（尚未改画布）
- intent=ask，reply 非空，只追问不落笔
- 前端选项优先用 choice_ui（不要只丢裸字符串列表）：
  {
    "mode": "confirm"|"single"|"multi"|"buttons"|"text",
    "options": [{"label": "...", "action": "apply"|"reply"|"dismiss"}],
    "placeholder"?: "..."
  }
- label 用用户语言、尽量短
- action：apply=确认待落笔；reply=把该选项当作下一条用户消息；dismiss=取消
- 简单追问（未给尺寸/主色）→ ask + 2～3 个 reply 选项

## 提案确认（create / edit）
- 可先 paint 出 ops，但 ops 会暂存，等用户点确认才 apply
- 前端会出确认/取消按钮（空 label 时由前端 i18n 填充）；reply 说明「将改什么」
- 用户确认走 apply_ops；decide 阶段不要声称已改画布
- 用户已给够信息 → intent=edit|create；reply 可用「准备添加…」等措辞

## 思考（thought）
简短：目标 → 缺什么 / 下一步 → 风险。不要写长文。
若开做前信息明显不全 → 可 need_skills 含 user.brief_intake，intent=ask。
""",
        """# Ask mode
Clarify when key info is missing; otherwise prepare canvas work for user confirm.
Never claim work was already applied.

## Clarify (no canvas change yet)
- intent=ask, non-empty reply, tool_ops=[] in decide
- Emit choice_ui for frontend chips (preferred over bare string lists):
  {
    "mode": "confirm"|"single"|"multi"|"buttons"|"text",
    "options": [{"label": "...", "action": "apply"|"reply"|"dismiss"}],
    "placeholder"?: "..."
  }
- Labels in the user's language; keep them short
- action: apply=confirm pending ops, reply=send that label as the next user message, dismiss=cancel

## Propose / confirm (create or edit)
- Ops are prepared then HELD until the user confirms (frontend Confirm/Cancel)
- Runtime may fill empty confirm labels via i18n — your reply should say what will change
- User confirm applies via apply_ops; you do not apply in decide

## Thought
Keep thought brief: goal → missing info OR next step → risk.
""",
    ),
    "agent.prompt.ask_propose_situation": (
        "Ask mode: canvas ops are prepared but NOT applied yet.\n"
        "Write a short confirm prompt (what will change + ask to confirm).\n"
        "Do not claim anything was already added.\n",
        "Ask mode: canvas ops are prepared but NOT applied yet.\n"
        "Write a short confirm prompt for the user (what will change + ask to confirm).\n"
        "Do not claim anything was already added or applied.\n",
    ),
    "agent.prompt.ask_blocked_edit": (
        "Ask mode cannot apply edits yet. Explain briefly and offer to switch to Agent or confirm.\n",
        "",
    ),
    "agent.prompt.ask_canvas_size": (
        "Ask which canvas size they want, or offer common presets.\n",
        "请先选择画布尺寸（或告诉我宽×高），再继续创建。",
    ),
    "agent.prompt.unsafe_ops_ask": (
        "These ops need confirmation before apply. Summarize risk and ask to proceed.\n",
        "这次改动我没法安全执行{error}。可以换个说法，或告诉我更具体的目标吗？",
    ),
    "agent.prompt.agent_system": (
        "# Agent mode\n"
        "Execute with tools. Do not ask the user.\n"
        "- intent is chat | done | edit | create (never ask).\n"
        "- If info is incomplete, choose defaults and proceed.\n",
        "# 指令 · Agent 自动执行（模式规则）\n"
        "当前为 Agent 模式：自主决策并完成任务，禁止向用户追问。\n"
        "- 允许的 intent：chat | done | edit | create。禁止 intent=ask。\n"
        "- 禁止 need_skills 含 user.brief_intake。\n"
        "- 信息不全时自行选合理默认，继续 create|edit。\n"
        "- 空画布从零创作：need_skills 含 design_methodology + user.layout_ops；需要时再 need_aesthetics。\n"
        "- reply 仅短进度；禁止「请问…」类追问。\n"
        "- 仅纯寒暄可用 chat；用户已提出设计任务时禁止 chat。\n",
        "# Agent mode\n"
        "Execute with tools. Do not ask the user.\n"
        "- intent is chat | done | edit | create (never ask).\n"
        "- If info is incomplete, choose defaults and proceed.\n"
        "- thought: brief internal plan (deliverable → steps → risks); keep user-facing reply short.\n",
    ),
    "agent.prompt.aesthetic_gap_layout_hint": (
        "Improve layout hierarchy.\n",
    ),
    "agent.prompt.paint_system": (
        "You are the canvas PAINT stage of a design editor agent.\n"
        "Your ONLY job: emit non-empty tool_ops that change the canvas.\n"
        "Rules:\n"
        "- tool_ops must be a non-empty array; use TOOL_DETAILS / catalogs in system.\n"
        "- Prefer create_frame then add content inside the focus frame when creating.\n"
        "- Match the user's language in any short reply field.\n"
        "- Do not ask clarifying questions in Agent mode; pick sensible defaults.\n",
    ),
    "agent.prompt.need_tools_overlay": (
        "# Decide stage (resource protocol)\n"
        "Catalogs (tools / skills / knowledge / aesthetics) are injected in system when loaded.\n"
        "This stage only declares resource needs. tool_ops MUST be [].\n"
        "Paint runs later after resources load.\n"
        "Return one structured decide payload (intent + needs). Do not claim canvas edits here.\n",
    ),
    "agent.prompt.react_system": (
        "You are a design-canvas agent. Think briefly, then act with tools or a clear reply.\n"
        "Prefer concrete canvas ops over long essays.\n",
    ),
}


def _norm_oss_body(text: str) -> str:
    return str(text or "").replace("\r\n", "\n").strip()


def _bump_unchanged_oss_prompt_bodies(session: Session, *, now: float) -> None:
    """Replace pack body/title only when it still matches a known prior OSS seed."""
    for kind, prevs in _OSS_PROMPT_BODY_PREV.items():
        seed_item = _SEED_BY_KIND.get(kind) or {}
        new_body = str(seed_item.get("body") or "")
        if not new_body.strip():
            continue
        new_norm = _norm_oss_body(new_body)
        prev_norms = {_norm_oss_body(p) for p in prevs}
        for pack in crud.list_design_prompt_packs_by_kind(session=session, kind=kind):
            cur = _norm_oss_body(str(pack.body or ""))
            if cur == new_norm or cur not in prev_norms:
                continue
            pack.body = new_body if new_body.endswith("\n") else new_body + "\n"
            title = str(seed_item.get("title") or "").strip()
            if title:
                pack.title = title
            pack.updated_at = now
            session.add(pack)


def list_prompt_pack_bodies_for_system(*, ensure: bool = True) -> dict[str, str]:
    """Packs whose kind is a system prompt key → body (Admin 提示词包 is source of truth)."""
    if ensure:
        ensure_design_prompt_packs()
    from app.services.design.prompts.system_prompt_store import is_system_prompt_key

    with Session(engine) as session:
        rows = crud.list_enabled_design_prompt_pack_bodies(session=session)
    out: dict[str, str] = {}
    for kind, body in rows:
        if not is_system_prompt_key(kind):
            continue
        out[kind] = body
    return out


def list_prompt_packs(
    *,
    kind: str | None = None,
    pack_type: str | None = None,
    used_by: str | None = None,
    enabled: bool | None = True,
    ensure: bool = True,
) -> list[dict[str, Any]]:
    """Prefer flow 提示词节点; else DB table. ``pack_type`` filters by code (need|system)."""
    type_filter = str(pack_type or "").strip().lower() or None
    if type_filter and type_filter not in _PACK_TYPES:
        type_filter = None
    stage_filter = str(used_by or "").strip().lower() or None
    if stage_filter and stage_filter not in _PROMPT_PACK_STAGES:
        stage_filter = None
    flow_rows = list_prompt_nodes_from_flow()
    if flow_rows:
        rows = flow_rows
        if kind:
            rows = [r for r in rows if r["kind"] == kind]
        if type_filter:
            rows = [
                r
                for r in rows
                if normalize_pack_type(r.get("type"), kind=str(r.get("kind") or ""))
                == type_filter
            ]
        if stage_filter:
            rows = [
                r
                for r in rows
                if stage_filter in normalize_used_by(r.get("usedBy") or r.get("used_by"))
            ]
        if enabled is False:
            return []
        return rows
    if ensure:
        ensure_design_catalog()
        ensure_design_prompt_packs()
    with Session(engine) as session:
        rows = crud.list_design_prompt_packs(
            session=session,
            kind=kind,
            pack_type=type_filter,
            enabled=enabled,
        )
    out = [_pub(r) for r in rows]
    if stage_filter:
        out = [r for r in out if stage_filter in (r.get("usedBy") or [])]
    return out


def upsert_prompt_pack(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_catalog()
    ensure_design_prompt_packs()
    kid = payload.get("id")
    kind = str(payload.get("kind") or "").strip()[:128]
    title = str(payload.get("title") or "").strip()[:128]
    body = str(payload.get("body") or "").strip()
    if not kind or not title or not body:
        raise ValueError("kind, title, body required")
    when = str(payload.get("whenToUse") or payload.get("when_to_use") or "").strip()
    scenes = str(payload.get("scenes") or "all").strip()[:128] or "all"
    used_by = used_by_csv(
        payload.get("usedBy")
        if payload.get("usedBy") is not None
        else payload.get("used_by")
    )
    if not used_by:
        seed_item = _SEED_BY_KIND.get(kind) or {}
        used_by = used_by_csv(seed_item.get("usedBy") or seed_item.get("used_by"))
    sort_order = int(payload.get("sortOrder") or payload.get("sort_order") or 0)
    enabled = 1 if payload.get("enabled", True) else 0
    pack_type = normalize_pack_type(
        payload.get("type") or payload.get("pack_type") or payload.get("packType"),
        kind=kind,
    )
    with Session(engine) as session:
        row = crud.upsert_design_prompt_pack(
            session=session,
            item_id=int(kid) if kid else None,
            kind=kind,
            pack_type=pack_type,
            title=title,
            body=body,
            when_to_use=when,
            scenes=scenes,
            used_by=used_by,
            sort_order=sort_order,
            enabled=enabled,
        )
    # Mirror system keys so legacy design_system_prompt readers stay in sync.
    try:
        from app.services.design.prompts.system_prompt_store import (
            is_system_prompt_key,
            upsert_system_prompt,
        )

        if is_system_prompt_key(kind) or pack_type == PACK_TYPE_SYSTEM:
            upsert_system_prompt(
                key=kind,
                body=body,
                label=title,
                description=when or None,
                sort_order=sort_order,
                enabled=bool(enabled),
            )
    except Exception:
        pass
    return _pub(row)


def soft_delete_prompt_pack(item_id: int) -> bool:
    """Hard-delete a prompt pack row (Admin「删除」)."""
    ensure_design_catalog()
    ensure_design_prompt_packs()
    with Session(engine) as session:
        return crud.delete_design_prompt_pack(session=session, item_id=int(item_id))


def format_prompt_pack_block(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    header = render_prompt_body("agent.prompt.prompt_pack_inject_header").strip()
    parts = [header] if header else []
    for r in rows:
        label = KIND_LABELS.get(r["kind"], r["kind"])
        title = r.get("title") or label
        when = (r.get("whenToUse") or "").strip()
        head = f"【{label}·{title}】"
        if when:
            when_ln = render_prompt_body(
                "agent.prompt.knowledge_when_line", when=when
            ).strip()
            if when_ln:
                head += f"\n{when_ln}"
        parts.append(f"{head}\n{r.get('body') or ''}".strip())
    return "\n\n".join(parts)


def format_prompt_packs_catalog(*, scene: str = "website") -> str:
    del scene
    return render_prompt_body("agent.prompt.prompt_packs_retired_catalog")
