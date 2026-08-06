"""Deferred knowledge/skills/tools/aesthetics fetch helpers."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from langgraph.config import get_stream_writer

from app.services.design.aesthetics.scorer import retrieve_aesthetic_refs
from app.services.design.ops.tool_ops_contract import format_canvas_tools_details
from app.services.design.prompts.knowledge_store import format_knowledge_details
from app.services.design.prompts.skill_store import (
    filter_need_resources_by_skill_acl,
    resolve_triggered_skill_keys,
)

_log = logging.getLogger(__name__)


def _emit(ev: dict[str, Any]) -> None:
    try:
        get_stream_writer()(ev)
    except Exception:
        pass


def _canvas_is_empty(rt: Any) -> bool:
    nodes = [n for n in (rt.scene_nodes or []) if isinstance(n, dict) and n.get("id")]
    if nodes:
        return False
    frames = [f for f in (rt.scene_frames or []) if isinstance(f, dict) and f.get("id")]
    if not frames:
        return True
    return all(bool(f.get("is_empty")) for f in frames)

def _fresh_knowledge_kinds(
    need_knowledge: list[str], *, knowledge_loaded: list[str]
) -> list[str]:
    if not need_knowledge:
        return []
    if "*" in need_knowledge:
        return list(need_knowledge)
    fresh = [k for k in need_knowledge if k not in knowledge_loaded]
    return fresh or list(need_knowledge)


def _fresh_skill_keys(
    need_skills: list[str], *, skills_loaded: list[str]
) -> list[str]:
    if not need_skills:
        return []
    if "*" in need_skills:
        return list(need_skills)
    fresh = [k for k in need_skills if k not in skills_loaded]
    return fresh or list(need_skills)


def _fetch_deferred_knowledge(*, kinds: list[str], scene: str) -> dict[str, Any]:
    details = format_knowledge_details(kinds=kinds, scene=scene)
    return {"kinds": list(kinds), "details": details or ""}


def _fetch_deferred_skills(
    *,
    keys: list[str],
    scene: str,
    version_pins: dict[str, int | str] | None = None,
    input_args: dict[str, Any] | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    from app.services.design.prompts.skill_store import format_skills_details_checked

    details, errs = format_skills_details_checked(
        keys=keys,
        scene=scene,
        version_pins=version_pins,
        input_args=input_args,
        user_id=user_id,
    )
    return {"keys": list(keys), "details": details or "", "errors": errs}


def _fetch_deferred_tools(*, keys: list[str], rules: dict[str, str]) -> dict[str, Any]:
    details = format_canvas_tools_details(keys, rules=rules)
    return {"keys": list(keys), "details": details or ""}


def _fetch_deferred_aesthetics(
    *,
    prompt: str,
    scene: str,
    canvas_w: int,
    canvas_h: int,
    user_ref_urls: list[str],
    use_user_refs: bool,
) -> dict[str, Any]:
    try:
        rag = retrieve_aesthetic_refs(
            prompt=prompt,
            scene=scene,
            canvas_w=canvas_w,
            canvas_h=canvas_h,
            user_ref_urls=user_ref_urls,
            use_user_refs=use_user_refs,
        )
    except Exception as exc:
        _log.exception("retrieve_aesthetic_refs failed")
        return {
            "ok": False,
            "guidance": "",
            "imageUrls": [],
            "status": "error",
            "reason": str(exc),
            "usedClip": False,
            "userRefCount": len(user_ref_urls or []),
            "corpusIds": [],
            "ms": 0,
            "mode": "error"
        }
    guidance = str(rag.get("guidance") or "").strip()
    img_urls = [
        str(u).strip() for u in (rag.get("imageUrls") or []) if str(u).strip()
    ][:4]
    return {
        "ok": bool(guidance or img_urls or rag.get("userRefCount")),
        "guidance": guidance,
        "imageUrls": img_urls,
        "status": str(rag.get("status") or ""),
        "reason": str(rag.get("reason") or ""),
        "usedClip": bool(rag.get("usedClip")),
        "userRefCount": int(rag.get("userRefCount") or 0),
        "corpusIds": list(rag.get("corpusIds") or [])[:8],
        "ms": int(rag.get("ms") or 0),
        "mode": str(rag.get("mode") or ""),
        "use_user_refs": use_user_refs
    }


async def _gather_deferred_resource_details(
    *,
    fresh_k: list[str],
    fresh_skills: list[str],
    fresh_tools: list[str],
    load_aesthetics: bool,
    prompt: str,
    scene: str,
    canvas_w: int,
    canvas_h: int,
    user_ref_urls: list[str],
    use_user_refs: bool,
    rules: dict[str, str],
    skill_version_pins: dict[str, int | str] | None = None,
    skill_input_args: dict[str, Any] | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Fetch knowledge / skills / tools / aesthetics in parallel."""
    jobs: list[tuple[str, Any]] = []
    if fresh_k:
        jobs.append(
            (
                "knowledge",
                asyncio.to_thread(
                    _fetch_deferred_knowledge,
                    kinds=fresh_k,
                    scene=scene,
                ),
            )
        )
    if fresh_skills:
        jobs.append(
            (
                "skills",
                asyncio.to_thread(
                    _fetch_deferred_skills,
                    keys=fresh_skills,
                    scene=scene,
                    version_pins=skill_version_pins,
                    input_args=skill_input_args,
                    user_id=user_id,
                ),
            )
        )
    if fresh_tools:
        jobs.append(
            (
                "tools",
                asyncio.to_thread(
                    _fetch_deferred_tools,
                    keys=fresh_tools,
                    rules=rules,
                ),
            )
        )
    if load_aesthetics:
        jobs.append(
            (
                "aesthetics",
                asyncio.to_thread(
                    _fetch_deferred_aesthetics,
                    prompt=prompt,
                    scene=scene,
                    canvas_w=canvas_w,
                    canvas_h=canvas_h,
                    user_ref_urls=user_ref_urls,
                    use_user_refs=use_user_refs,
                ),
            )
        )
    out: dict[str, Any] = {}
    if not jobs:
        return out
    results = await asyncio.gather(
        *(coro for _, coro in jobs),
        return_exceptions=True,
    )
    for (kind, _), result in zip(jobs, results):
        if isinstance(result, BaseException):
            _log.exception("deferred %s fetch failed", kind, exc_info=result)
            out[kind] = {"error": str(result)[:240]}
        else:
            out[kind] = result
    return out



async def load_deferred_resources(rt: Any, turn: dict[str, Any], *, round_i: int | None = None) -> Any:
    st = rt.run
    round_i = st.round if round_i is None else round_i
    need_tools = list(turn.get("need_tools") or [])
    need_knowledge = list(turn.get("need_knowledge") or [])
    need_skills = list(turn.get("need_skills") or [])
    need_aesthetics = bool(turn.get("need_aesthetics"))
    use_user_refs = turn.get("use_user_refs") is True
    # Auto-merge enabled skills whose triggers match (empty_canvas / intent / …).
    # No hardcoded skill keys — Admin/user enable+triggers decide what loads.
    intent_l = str(turn.get("intent") or st.intent or "").strip() or "create"
    for k in resolve_triggered_skill_keys(
        scene=rt.scene_key or "website",
        empty_canvas=_canvas_is_empty(rt),
        has_images=bool(rt.images),
        intent=intent_l,
        need_aesthetics=need_aesthetics,
        prompt_chars=len(str(rt.prompt or "").strip()),
        already_loaded=list(st.skills_loaded or []) + list(need_skills),
    ):
        if k not in need_skills:
            need_skills.append(k)
    # Custom skills cannot unlock knowledge / aesthetics without ACL.
    acl_skills = list(st.skills_loaded or []) + list(need_skills)
    need_knowledge, need_aesthetics, acl_errs = filter_need_resources_by_skill_acl(
        skill_keys=acl_skills,
        scene=rt.scene_key or "website",
        need_knowledge=need_knowledge,
        need_aesthetics=need_aesthetics,
    )
    if acl_errs:
        st.push_log(phase="skill_acl", errors=acl_errs[:8])
        turn["need_knowledge"] = need_knowledge
        turn["need_aesthetics"] = need_aesthetics
    fresh_k = _fresh_knowledge_kinds(need_knowledge, knowledge_loaded=st.knowledge_loaded)
    load_knowledge = bool(need_knowledge) and not (
        set(need_knowledge) <= set(st.knowledge_loaded) and "*" not in need_knowledge
    )
    if not load_knowledge:
        fresh_k = []
    fresh_s = _fresh_skill_keys(need_skills, skills_loaded=st.skills_loaded)
    load_skills = bool(need_skills) and not (
        set(need_skills) <= set(st.skills_loaded) and "*" not in need_skills
    )
    if not load_skills:
        fresh_s = []
    fresh_tools = (
        [k for k in need_tools if k not in st.tools_loaded] or list(need_tools)
        if need_tools
        else []
    )
    load_aesthetics = bool(need_aesthetics and not st.aesthetics_loaded)
    user_ref_urls = [u for u in (rt.images or []) if isinstance(u, str) and u.strip()][:4]

    if load_knowledge:
        st.push_log(
            phase="need_knowledge",
            need_knowledge=list(fresh_k),
            intent=st.intent,
            summary="申请设计知识：" + "、".join(fresh_k),
        )
        _emit(
            {
                "type": "activity",
                "id": f"need-knowledge-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": (", ".join(fresh_k))[:200],

                "index": round_i
            }
        )
    if load_skills:
        st.push_log(
            phase="need_skills",
            need_skills=list(fresh_s),
            intent=st.intent,
            summary="申请 skill：" + "、".join(fresh_s),
        )
        _emit(
            {
                "type": "activity",
                "id": f"need-skills-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": (", ".join(fresh_s))[:200],

                "index": round_i
            }
        )
    if load_aesthetics:
        st.push_log(phase="need_aesthetics", need_aesthetics=True, summary='申请美学样本')
        _emit(
            {
                "type": "activity",
                "id": f"need-aesthetics-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": "申请美学样本",

                "index": round_i
            }
        )
    if need_tools:
        st.push_log(
            phase="need_tools",
            need_tools=list(need_tools),
            summary="申请工具详情：" + "、".join(need_tools),
        )
        _emit(
            {
                "type": "activity",
                "id": f"need-tools-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": (", ".join(need_tools))[:200],

                "index": round_i
            }
        )

    if turn.get("skill_parse_errs"):
        st.push_log(phase="skill_input", errors=list(turn.get("skill_parse_errs") or [])[:8])

    bundles = await _gather_deferred_resource_details(
        fresh_k=fresh_k if load_knowledge else [],
        fresh_skills=fresh_s if load_skills else [],
        fresh_tools=fresh_tools if need_tools else [],
        load_aesthetics=load_aesthetics,
        prompt=rt.prompt,
        scene=rt.scene_key or "website",
        canvas_w=rt.w,
        canvas_h=rt.h,
        user_ref_urls=user_ref_urls,
        use_user_refs=use_user_refs,
        rules=rt.rules,
        skill_version_pins=turn.get("skill_version_pins") or None,
        skill_input_args=turn.get("skill_input_args") or None,
        user_id=str(getattr(rt, "user_id", "") or "") or None,
    )
    kb = bundles.get("knowledge") if load_knowledge else None
    if isinstance(kb, dict) and kb.get("details"):
        details_k = str(kb["details"])
        rt.pending_knowledge_details = "KNOWLEDGE_DETAILS:\n" + details_k
        for k in fresh_k:
            if k not in st.knowledge_loaded:
                st.knowledge_loaded.append(k)
        st.push_log(
            phase="knowledge_details",
            need_knowledge=list(fresh_k),
            detail_chars=len(details_k),
            summary="注入设计知识：" + "、".join(fresh_k),
        )
        _emit(
            {
                "type": "activity",
                "id": f"knowledge-details-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": (", ".join(fresh_k))[:200],

                "index": round_i
            }
        )
    sb = bundles.get("skills") if load_skills else None
    if isinstance(sb, dict):
        skill_errs = list(sb.get("errors") or [])
        if skill_errs:
            st.push_log(phase="skill_validate", errors=skill_errs[:8])
        if sb.get("details"):
            details_s = str(sb["details"])
            rt.pending_skill_details = "SKILL_DETAILS:\n" + details_s
            for k in fresh_s:
                if k not in st.skills_loaded:
                    st.skills_loaded.append(k)
            st.push_log(
                phase="skill_details",
                need_skills=list(fresh_s),
                detail_chars=len(details_s),
                summary="注入 skill：" + "、".join(fresh_s),
            )
            _emit(
                {
                    "type": "activity",
                    "id": f"skill-details-{round_i}",
                    "kind": "explored",
                    "status": "done",
                    "summary": (", ".join(fresh_s))[:200],

                    "index": round_i
                }
            )
    tb = bundles.get("tools") if need_tools else None
    if isinstance(tb, dict) and tb.get("details"):
        details_t = str(tb["details"])
        rt.pending_tool_details = "TOOL_DETAILS:\n" + details_t
        for k in fresh_tools:
            if k not in st.tools_loaded:
                st.tools_loaded.append(k)
        st.push_log(
            phase="tool_details",
            need_tools=list(fresh_tools),
            detail_chars=len(details_t),
            summary="注入工具详情：" + "、".join(fresh_tools),
        )
        _emit(
            {
                "type": "activity",
                "id": f"tool-details-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": (", ".join(fresh_tools))[:200],

                "index": round_i
            }
        )
    ab = bundles.get("aesthetics") if load_aesthetics else None
    if isinstance(ab, dict):
        guidance = str(ab.get("guidance") or "").strip()
        img_urls = [str(u).strip() for u in (ab.get("imageUrls") or []) if str(u).strip()][:4]
        if guidance or img_urls:
            rt.pending_aesthetics_details = "AESTHETIC_REFS:\n" + (guidance or "(images)")
            rt.pending_aesthetic_images = img_urls
            st.aesthetics_loaded = True
            st.push_log(
                phase="aesthetics_details",
                detail_chars=len(guidance),
                summary='注入美学参考',
            )
            _emit(
                {
                    "type": "activity",
                    "id": f"aesthetics-details-{round_i}",
                    "kind": "explored",
                    "status": "done",
                    "summary": "aesthetics",

                    "index": round_i
                }
            )
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "tokens": rt.last_used
        }
    )
    st.round = round_i + 1
    rt.flags["fetched"] = True
    rt.flags["ready"] = True
    rt.flags["next_round"] = True
    # Details are pending on rt; clear need_* so fork outs match mode=agent/ask
    # (not the same need_tools edge that sent us here).
    rt.flags["need_tools"] = False
    rt.flags["need_knowledge"] = False
    rt.flags["need_skills"] = False
    rt.flags["need_aesthetics"] = False
    return rt

