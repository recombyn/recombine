"""One-shot: write a minimal runnable public prompt-pack seed (OSS-safe English)."""
from __future__ import annotations

import json
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "design_prompt_packs"

# Short protocol bodies — enough for cold-start Agent; not product-tuned copy.
BODIES: dict[str, tuple[str, list[str], str]] = {
    # title, usedBy, body
    "agent.prompt.need_tools_overlay": (
        "Decide — resource protocol (OSS)",
        ["decide"],
        """# Decide stage (resource protocol)
Catalogs (tools / skills / knowledge / aesthetics) are injected in system when loaded.
This stage only declares resource needs. tool_ops MUST be [].
Paint runs later after resources load.
Return one structured decide payload (intent + needs). Do not claim canvas edits here.
thought: brief — goal → missing info or next resource → risk (not a long essay).""",
    ),
    "agent.prompt.paint_system": (
        "Paint system (OSS)",
        ["paint"],
        """You are the canvas PAINT stage of a design editor agent.
Your ONLY job: emit non-empty tool_ops that change the canvas.
Rules:
- tool_ops must be a non-empty array; use TOOL_DETAILS / catalogs in system.
- Prefer create_frame then add content inside the focus frame when creating.
- One clear visual focus; keep surroundings disciplined (avoid generic AI template looks).
- Match the user's language in any short reply field.
- Do not ask clarifying questions in Agent mode; pick sensible defaults.
- Do not emit choice_ui here — Ask confirm chips are handled after propose.""",
    ),
    "agent.prompt.ask_system": (
        "Ask mode rules (OSS)",
        ["decide", "apply"],
        """# Ask mode
Clarify when key info is missing; otherwise prepare canvas work for user confirm.
Never claim work was already applied.

## Ask strategy (HITL-style)
- One blocking question per turn (size / deliverable / required copy / overwrite) — no questionnaires
- Do not ask what you can sensibly default (minor palette, density, micro-alignment) — pick defaults and proceed
- Prefer 2–4 clickable reply options; use mode=text only when a freeform value is required
- Destructive / irreversible (clear, delete board, broad replace) → mode=confirm with apply + dismiss
- Use multi only for parallel facets of one decision; otherwise ask next turn
- After the user answers, advance — do not re-ask the same point

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
- Runtime may fill empty confirm labels via i18n — your reply should say what will change (+ one risk line if any)
- User confirm applies via apply_ops; you do not apply in decide

## Thought
Keep thought brief: goal → this turn's single blocker OR next step → risk.""",
    ),
    "agent.prompt.agent_system": (
        "Agent mode rules (OSS)",
        ["decide", "paint"],
        """# Agent mode
Execute with tools. Do not ask the user.
- intent is chat | done | edit | create (never ask).
- If info is incomplete, choose defaults and proceed.
- thought: brief internal plan (deliverable → steps → risks); keep user-facing reply short.""",
    ),
    "agent.prompt.paint_retry": (
        "Paint retry (OSS)",
        ["paint"],
        """RETRY: previous tool_ops were empty or invalid.
Read LAST_ERROR and re-emit a non-empty tool_ops array now.""",
    ),
    "agent.prompt.ask_propose_situation": (
        "Ask confirm prompt (OSS)",
        ["apply"],
        """Ask mode: canvas ops are prepared but NOT applied yet.
Write a short confirm prompt (what will change + ask to confirm).
Frontend shows Confirm/Cancel chips separately — do not invent chip JSON here.
Do not claim anything was already added.""",
    ),
    "agent.prompt.ux_reply_system": (
        "UX reply (OSS)",
        ["apply", "observe", "paint", "decide"],
        """You write one short assistant message for a design-canvas product.
Match the language of the user request. At most two sentences.
No markdown lists, no tool_ops, no JSON.""",
    ),
    "agent.prompt.intent_classify": (
        "Intent classify (OSS)",
        ["intent"],
        """# Identity
You are an intent classifier for a design-canvas agent.
Output exactly one structured decision. Do not write tool_ops.

## Intent (always)
Pick intent among: chat | canvas_op | design (schema-constrained).
- chat: greeting / no canvas work
- canvas_op: doable via canvas tool catalog (create_shape, update_node, …)
- design: creative layout / page / poster work needing composition judgment
Prefer canvas_op or design when the user wants visual work on the canvas.

## Pending proposal (only when PENDING_PROPOSAL is in the user message)
Also set proposal_action:
- apply — user confirms the held ops (确认 / ok / yes / 可以 / 就这样 / apply)
- dismiss — user cancels (取消 / 不要了 / cancel)
- revise — user changes requirements; then set intent to canvas_op|design as usual
Never set intent=chat for a confirmation of a pending proposal.

reply: short line in the user's language when intent=chat or proposal_action=dismiss; otherwise empty.""",
    ),
    "agent.prompt.lc_tools_overlay": (
        "LC tools overlay (OSS)",
        ["decide"],
        """LangChain tool-calling is enabled for this turn.
Use declared tools when needed; follow each tool's argument schema.""",
    ),
    "agent.prompt.react_system": (
        "ReAct system (OSS)",
        ["legacy"],
        """You are a design-canvas agent.
Process: brief (goal/size) → plan (steps) → act (tools) → self-check (hierarchy/margins).
Think briefly in thought; prefer concrete canvas ops over long essays.""",
    ),
    "agent.prompt.chat_agent_system": (
        "Chat agent system (OSS)",
        ["decide"],
        """You are a helpful design assistant on an infinite canvas.
Answer briefly; when the user wants visuals, steer toward create/edit intents.""",
    ),
    "agent.prompt.partial_system": (
        "Partial edit (OSS)",
        ["decide"],
        """Focus on the selected nodes / focus frame. Do not redesign unrelated content.""",
    ),
    "agent.prompt.chat_fallback": (
        "Chat fallback template (OSS)",
        ["decide"],
        """Hi, I'm {persona}. What would you like to design on the canvas?""",
    ),
    "agent.prompt.size_auto": (
        "Auto size hint (OSS)",
        ["bootstrap", "decide"],
        """SIZE_MODE: auto — pick a sensible create_frame size; do not ask the user for dimensions.""",
    ),
    "agent.prompt.ask_canvas_size": (
        "Ask canvas size (OSS)",
        ["decide"],
        """Ask which canvas size they want.
Emit choice_ui (mode=buttons or single) with common presets as reply options
(e.g. 1920x1080, 1080x1920, 800x600) plus a way to type a custom size.
intent=ask; tool_ops=[].""",
    ),
    "agent.prompt.unsafe_ops_ask": (
        "Unsafe ops ask (OSS)",
        ["decide"],
        """These ops need confirmation before apply.
Summarize risk in reply; emit choice_ui mode=confirm with apply + dismiss
(labels in the user's language). Do not apply until the user confirms.""",
    ),
    "agent.prompt.ask_blocked_edit": (
        "Ask confirm hold (OSS)",
        ["decide"],
        """Ask mode holds canvas ops until the user confirms.
Summarize the pending change; wait for Confirm (apply) or Cancel (dismiss).
Do not say Ask cannot edit — propose + confirm is the path.""",
    ),
    "agent.prompt.pending_tools": (
        "Pending tools (OSS)",
        ["resources"],
        """Loading canvas tools: {names}""",
    ),
    "agent.prompt.pending_knowledge": (
        "Pending knowledge (OSS)",
        ["resources"],
        """Loading knowledge: {names}""",
    ),
    "agent.prompt.pending_skills": (
        "Pending skills (OSS)",
        ["resources"],
        """Loading skills: {names}""",
    ),
    "agent.prompt.pending_aesthetics": (
        "Pending aesthetics (OSS)",
        ["resources"],
        """Loading aesthetic references…""",
    ),
    "agent.prompt.default_assistant_name": (
        "Default assistant name (OSS)",
        ["decide"],
        """Recombyn""",
    ),
    "agent.prompt.tools_loaded_fallback": (
        "Tools loaded fallback (OSS)",
        ["resources"],
        """Canvas tools are ready.""",
    ),
    "agent.prompt.recover_edit_retry": (
        "Recover edit retry (OSS)",
        ["paint"],
        """Previous edit failed. Retry with corrected tool_ops only.""",
    ),
    "agent.prompt.tools_registry_header": (
        "Tools registry header (OSS)",
        ["resources", "decide"],
        """## Canvas tools registry""",
    ),
    "agent.prompt.tools_registry_empty": (
        "Tools registry empty (OSS)",
        ["resources", "decide"],
        """(no tools registered)""",
    ),
    "agent.prompt.tools_catalog_header": (
        "Tools catalog header (OSS)",
        ["resources", "decide"],
        """## Canvas tools (call need_tools before tool_ops if not loaded)""",
    ),
    "agent.prompt.tools_catalog_empty": (
        "Tools catalog empty (OSS)",
        ["resources", "decide"],
        """(tools catalog empty — configure op_keys in Admin)""",
    ),
    "agent.prompt.tool_details_header": (
        "Tool details header (OSS)",
        ["resources", "decide"],
        """## Tool details""",
    ),
    "agent.prompt.tool_details_hint_line": (
        "Tool details hint (OSS)",
        ["resources", "decide"],
        """- hint: {hint}""",
    ),
    "agent.prompt.tool_details_args_line": (
        "Tool details args (OSS)",
        ["resources", "decide"],
        """- args: {args}""",
    ),
    "agent.prompt.tool_details_unknown": (
        "Tool details unknown (OSS)",
        ["resources", "decide"],
        """(unknown tool)""",
    ),
    "agent.prompt.skill_catalog_header": (
        "Skill catalog header (OSS)",
        ["resources", "decide"],
        """## Skills (need_skills to load; keys like `key` or `ns.key`)""",
    ),
    "agent.prompt.skill_catalog_empty": (
        "Skill catalog empty (OSS)",
        ["resources", "decide"],
        """(no runtime skills — add Admin skills or data/design_skills packs)""",
    ),
    "agent.prompt.skill_details_header": (
        "Skill details header (OSS)",
        ["resources", "decide"],
        """## Skill details""",
    ),
    "agent.prompt.skill_details_truncated": (
        "Skill details truncated (OSS)",
        ["resources", "decide"],
        """…(truncated)""",
    ),
    "agent.prompt.knowledge_catalog_header": (
        "Knowledge catalog header (OSS)",
        ["resources", "decide"],
        """## Knowledge (need_knowledge to load)""",
    ),
    "agent.prompt.knowledge_catalog_empty": (
        "Knowledge catalog empty (OSS)",
        ["resources", "decide"],
        """(no knowledge entries)""",
    ),
    "agent.prompt.knowledge_details_header": (
        "Knowledge details header (OSS)",
        ["resources", "decide"],
        """## Knowledge details""",
    ),
    "agent.prompt.knowledge_when_line": (
        "Knowledge when line (OSS)",
        ["resources", "decide"],
        """when: {when}""",
    ),
    "agent.prompt.focus_frame_authority": (
        "Focus frame authority (OSS)",
        ["paint", "decide"],
        """FOCUS_FRAME is authoritative for placement inside the active frame.""",
    ),
    "agent.prompt.focus_empty_frame": (
        "Focus empty frame (OSS)",
        ["paint", "decide"],
        """Focus frame is empty — create content inside it.""",
    ),
    "agent.prompt.scene_frames_header": (
        "Scene frames header (OSS)",
        ["paint", "decide"],
        """## Frames on canvas""",
    ),
    "agent.prompt.bg_candidate_hint": (
        "Background candidate hint (OSS)",
        ["paint"],
        """Background candidate: {hint}""",
    ),
    "agent.prompt.prompt_pack_inject_header": (
        "Prompt pack inject header (OSS)",
        ["resources"],
        """## Injected prompt packs""",
    ),
    "agent.prompt.prompt_packs_retired_catalog": (
        "Retired packs catalog (OSS)",
        ["resources"],
        """(retired prompt packs omitted)""",
    ),
}

# Minimal aesthetic glue so aesthetics paths don't hard-miss when force-synced.
_AESTHETIC_GLUE = {
    "agent.prompt.aesthetic_refs_user": ("Aesthetic refs — user", ["aesthetics"], "User aesthetic references:"),
    "agent.prompt.aesthetic_refs_corpus": ("Aesthetic refs — corpus", ["aesthetics"], "Corpus aesthetic references:"),
    "agent.prompt.aesthetic_refs_clip_fallback": ("Aesthetic refs — clip", ["aesthetics"], "(clip embedding fallback)"),
    "agent.prompt.aesthetic_refs_section_good": ("Aesthetic section good", ["aesthetics"], "### Good"),
    "agent.prompt.aesthetic_refs_section_ok": ("Aesthetic section ok", ["aesthetics"], "### OK"),
    "agent.prompt.aesthetic_refs_section_bad": ("Aesthetic section bad", ["aesthetics"], "### Avoid"),
    "agent.prompt.aesthetic_refs_empty_ok": ("Aesthetic empty ok", ["aesthetics"], "(none)"),
    "agent.prompt.aesthetic_refs_empty_bad": ("Aesthetic empty bad", ["aesthetics"], "(none)"),
    "agent.prompt.aesthetic_refs_empty_bad_user": ("Aesthetic empty bad user", ["aesthetics"], "(none from user)"),
    "agent.prompt.aesthetic_refs_footer": ("Aesthetic refs footer", ["aesthetics"], "Use refs as style guidance, not copy."),
    "agent.prompt.aesthetic_refs_vision_hint": ("Aesthetic vision hint", ["aesthetics"], "Describe visual structure briefly."),
    "agent.prompt.aesthetic_refs_no_image_hint": ("Aesthetic no image", ["aesthetics"], "No reference image attached."),
    "agent.prompt.aesthetic_refs_bad_item": ("Aesthetic bad item", ["aesthetics"], "- avoid: {item}"),
    "agent.prompt.aesthetic_refs_verb_imitate": ("Aesthetic verb imitate", ["aesthetics"], "imitate"),
    "agent.prompt.aesthetic_refs_verb_surpass": ("Aesthetic verb surpass", ["aesthetics"], "surpass"),
    "agent.prompt.aesthetic_refs_verb_avoid": ("Aesthetic verb avoid", ["aesthetics"], "avoid"),
    "agent.prompt.aesthetic_catalog": ("Aesthetic catalog", ["aesthetics"], "## Aesthetic catalog"),
    "agent.prompt.aesthetic_gap_ref": ("Aesthetic gap ref", ["aesthetics"], "ref gap: {detail}"),
    "agent.prompt.aesthetic_gap_ref_comment": ("Aesthetic gap ref comment", ["aesthetics"], "reference mismatch"),
    "agent.prompt.aesthetic_gap_layout_detail": ("Aesthetic gap layout", ["aesthetics"], "layout: {detail}"),
    "agent.prompt.aesthetic_gap_layout_hint": ("Aesthetic gap layout hint", ["aesthetics"], "Improve layout hierarchy."),
    "agent.prompt.aesthetic_gap_color_detail": ("Aesthetic gap color", ["aesthetics"], "color: {detail}"),
    "agent.prompt.aesthetic_gap_color_hint": ("Aesthetic gap color hint", ["aesthetics"], "Tighten the palette."),
    "agent.prompt.aesthetic_gap_aesthetic_detail": ("Aesthetic gap aesthetic", ["aesthetics"], "aesthetic: {detail}"),
    "agent.prompt.aesthetic_gap_aesthetic_hint": ("Aesthetic gap aesthetic hint", ["aesthetics"], "Raise overall polish."),
    "agent.prompt.aesthetic_gap_score_detail": ("Aesthetic gap score", ["aesthetics"], "score: {detail}"),
    "agent.prompt.aesthetic_gap_score_hint": ("Aesthetic gap score hint", ["aesthetics"], "Target a higher score."),
    "agent.prompt.aesthetic_tokens_header": ("Aesthetic tokens header", ["aesthetics"], "## Aesthetic tokens"),
    "agent.prompt.aesthetic_tokens_priority_user": ("Tokens priority user", ["aesthetics"], "priority: user"),
    "agent.prompt.aesthetic_tokens_priority_corpus": ("Tokens priority corpus", ["aesthetics"], "priority: corpus"),
    "agent.prompt.aesthetic_tokens_section_user": ("Tokens section user", ["aesthetics"], "### User tokens"),
    "agent.prompt.aesthetic_tokens_section_good_secondary": ("Tokens section good 2", ["aesthetics"], "### Good (secondary)"),
    "agent.prompt.aesthetic_tokens_section_good": ("Tokens section good", ["aesthetics"], "### Good"),
    "agent.prompt.aesthetic_tokens_section_ok": ("Tokens section ok", ["aesthetics"], "### OK"),
    "agent.prompt.aesthetic_tokens_section_bad": ("Tokens section bad", ["aesthetics"], "### Bad"),
    "agent.prompt.aesthetic_tokens_comment": ("Tokens comment", ["aesthetics"], "{comment}"),
    "agent.prompt.aesthetic_tokens_extract_fail": ("Tokens extract fail", ["aesthetics"], "(token extract failed)"),
    "agent.prompt.aesthetic_tokens_primary_override": ("Tokens primary override", ["aesthetics"], "primary override"),
    "agent.prompt.aesthetic_tokens_src_user": ("Tokens src user", ["aesthetics"], "user"),
    "agent.prompt.aesthetic_tokens_src_good": ("Tokens src good", ["aesthetics"], "good"),
    "agent.prompt.aesthetic_tokens_verb_user": ("Tokens verb user", ["aesthetics"], "follow"),
    "agent.prompt.aesthetic_tokens_verb_secondary": ("Tokens verb secondary", ["aesthetics"], "prefer"),
}


def main() -> None:
    items: list[dict] = []
    sort_i = 0
    merged = {**BODIES, **_AESTHETIC_GLUE}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for kind, (title, used_by, body) in merged.items():
        sort_i += 10
        text = body.strip() + "\n"
        (OUT_DIR / f"{kind}.md").write_text(text, encoding="utf-8")
        items.append(
            {
                "kind": kind,
                "title": title,
                "type": "system",
                "group": "oss_baseline",
                "usedBy": used_by,
                "scenes": "all",
                "selectable": False,
                "sort_order": sort_i,
                "when_to_use": "OSS baseline.",
            }
        )
    payload = {
        "_comment": (
            "OSS runnable baseline (English, minimal) for Agent cold start. "
            "Bodies live in sibling *.md (filename = kind)."
        ),
        "kindLabels": {k: t for k, (t, _, __) in merged.items()},
        "items": items,
    }
    (OUT_DIR / "_index.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {OUT_DIR} items={len(items)}")


if __name__ == "__main__":
    main()
