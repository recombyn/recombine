"""OpenAI-compatible tool schemas for the canvas design agent."""

from __future__ import annotations

from typing import Any


DESIGN_AGENT_SYSTEM = """You are recombyn Design Agent — a Cursor-like agent for an SVG design canvas.

Your job is to DESIGN on the canvas with vector tools. Chat text alone is NOT a deliverable.

Hard rules:
1. LAYOUT + DENSITY FIRST: decide composition, zones, type hierarchy, and 疏密 (tight/medium/loose), THEN tools. Prefer create_shape / create_text / create_image / create_frame.
2. SKILLS ON DEMAND: category guides are NOT all in context. Call lookup_design_skill(skill, focus) for what you need now (layout → color → polish). Never invent specialty rules.
3. VECTOR ONLY for chrome & icons: rect, circle, polygon, star, line, arrow, closed path/pen with fill, native text, gradients. Do not invent raster illustrations.
4. IMAGES / ILLUSTRATION:
   - No user attach → create_image placeholder OR simple vector illustration. Never call an image-generation model.
   - User attached → create_image with attachmentIndex.
   - Complex illustration → ask_user to split a step, or leave placeholder; simple geometric art can be done inline.
5. Design work MUST happen via tools. NEVER answer with only prose/plans/SVG dumps. Do NOT call finish until canvas tools succeeded.
6. WHERE to draw:
   - New poster beside an existing board → create_frame (same size, gap 48) then draw only in the NEW frame.
   - Edits on the active frame → draw inside it.
   - Empty canvas → create_frame then draw.
7. DELETION — NEVER delete_nodes unless the user explicitly asked to delete/remove/清除/删除. Prefer update_node. Never wipe a board to make room — create_frame instead.
8. Text: functional copy is always create_text. Path lettering only for decorative poster display titles when the poster skill allows it.
9. Icons: lookup_design_skill("icon") for 金刚区/nav/toolbar. Use closed path fills and layered shapes — not empty outline boxes only.
10. FIXED PHASE PIPELINE for full design jobs (layout → type → color → …). Honor collab mode: collaborative pauses every phase; milestone at major gates; auto runs through. Incremental edits skip the pipeline.
11. After real mutations, finish with a short Chinese summary. If nothing was created, say so honestly.
12. Follow spacing/density from looked-up skills (UI: even 4/8/16…). Never invent tool names. User-facing text in Chinese.
"""


def design_tool_definitions() -> list[dict[str, Any]]:
    """OpenAI function-calling tool list for DeepSeek / compatible providers."""
    return [
        {
            "type": "function",
            "function": {
                "name": "get_scene_summary",
                "description": "Read frames + nodes. Call when unsure about canvas state or which artboard exists.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "lookup_design_skill",
                "description": (
                    "Fetch an internal design skill section ON DEMAND. "
                    "Do not load every skill; call for the current phase only. "
                    "Typical order: layout/density/spacing → color → typography/icons/illustration. "
                    "skill: core|ui|icon|banner|poster|ecommerce|packaging|brand. "
                    "focus: layout|density|spacing|color|typography|icons|decoration|techniques|"
                    "illustration|sizes|components|all."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "skill": {
                            "type": "string",
                            "description": "Skill id, e. for poster, ui, icon, banner, core",
                        },
                        "focus": {
                            "type": "string",
                            "description": "Section focus for this phase (default all)",
                        },
                    },
                    "required": ["skill"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "ask_user",
                "description": (
                    "Stop and ask the user: unclear target frame, OR mid-task confirmation "
                    "(e.g. layout done — continue color? / split complex illustration). "
                    "Provide option chips (one action each; do not include Cancel)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string"},
                        "options": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["question"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_frame",
                "description": (
                    "Create a new artboard/frame. Required when the user wants another poster/page "
                    "beside an existing one (same size, place to the right/left with a gap). "
                    "Also call when the canvas is empty. Prefer this over ask_user when they already requested a design."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "backgroundColor": {"type": "string"},
                    },
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_frame",
                "description": "Resize or rename an existing artboard.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "frameId": {"type": "string"},
                        "name": {"type": "string"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                    },
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_shape",
                "description": (
                    "Create a vector shape. Prefer closed path/pen for custom icons and irregular forms. "
                    "Supports solid or linear/radial/angular fills. Layer clash-color shapes to mimic boolean cuts."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "shapeType": {
                            "type": "string",
                            "enum": [
                                "rect",
                                "circle",
                                "ellipse",
                                "line",
                                "arrow",
                                "triangle",
                                "polygon",
                                "star",
                                "path",
                                "pen",
                            ],
                        },
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "fill": {"type": "string", "description": "CSS color, e.g. #FFFFFF"},
                        "fillEnd": {
                            "type": "string",
                            "description": "Second stop when fillType is a gradient",
                        },
                        "fillType": {
                            "type": "string",
                            "enum": ["solid", "linear", "radial", "angular"],
                        },
                        "gradientAngle": {"type": "number"},
                        "stroke": {"type": "string"},
                        "borderWidth": {"type": "number"},
                        "cornerRadius": {"type": "number"},
                        "sides": {"type": "number"},
                        "path": {
                            "type": "string",
                            "description": "SVG path d for path/pen; close the shape for fills",
                        },
                        "closed": {
                            "type": "boolean",
                            "description": "Close path and allow fill (icons / blobs)",
                        },
                        "rotation": {"type": "number"},
                        "name": {"type": "string"},
                    },
                    "required": ["shapeType", "x", "y", "width", "height"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_text",
                "description": "Create a native editable text node. Use for all functional copy.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "text": {"type": "string"},
                        "width": {"type": "number"},
                        "fontSize": {"type": "number"},
                        "color": {"type": "string"},
                        "fontWeight": {"type": "string"},
                        "name": {"type": "string"},
                    },
                    "required": ["x", "y", "text"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_image",
                "description": (
                    "Place an image slot. Without attachmentIndex/src → template placeholder "
                    "(user replaces later). With attachmentIndex → fill user-attached image. "
                    "Do NOT invent photos; do NOT call image generation."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "attachmentIndex": {
                            "type": "number",
                            "description": "0-based index into user-attached images",
                        },
                        "src": {"type": "string"},
                        "placeholder": {
                            "type": "string",
                            "enum": ["image", "avatar"],
                        },
                        "name": {"type": "string"},
                    },
                    "required": ["x", "y", "width", "height"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_node",
                "description": (
                    "Update an EXISTING node's geometry or style by nodeId. "
                    "Required when the user @-mentions or selects an element "
                    "(e.g. change fill to red). Do NOT create_shape for that case."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeId": {"type": "string"},
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "fill": {"type": "string"},
                        "stroke": {"type": "string"},
                        "borderWidth": {"type": "number"},
                        "text": {"type": "string"},
                        "opacity": {"type": "number"},
                    },
                    "required": ["nodeId"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "delete_nodes",
                "description": (
                    "Delete one or more nodes by id. "
                    "FORBIDDEN unless the user explicitly asked to delete/remove those elements. "
                    "Never delete to clear space for a new poster — create_frame instead. "
                    "Never delete existing work without explicit user permission."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        }
                    },
                    "required": ["nodeIds"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "finish",
                "description": (
                    "Mark the design task complete AFTER canvas tools succeeded "
                    "(create_frame / create_shape / create_text / update_node). "
                    "Do not call if you only wrote a plan in chat."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                    },
                    "required": ["summary"],
                    "additionalProperties": False,
                },
            },
        },
    ]
