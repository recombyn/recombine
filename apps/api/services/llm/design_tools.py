"""OpenAI-compatible tool schemas for the canvas design agent."""

from __future__ import annotations

from typing import Any


DESIGN_AGENT_SYSTEM = """You are recombyn Design Agent — a Cursor-like agent for an SVG design canvas.

Your job is to DESIGN on the canvas with vector tools. Chat text alone is NOT a deliverable.

Hard rules:
1. LAYOUT FIRST: briefly decide structure (zones, margins, type scale), THEN call tools. Prefer create_shape / create_text / create_image / create_frame.
2. VECTOR ONLY for chrome & icons: rect, circle, polygon, star, line, arrow, closed path/pen with fill, native text, gradients. Do not invent raster illustrations.
3. IMAGES:
   - If the user did NOT attach images → call create_image WITHOUT src (uses template placeholder). Never call an image-generation model yourself.
   - If the user attached images → create_image with attachmentIndex to fill those slots.
4. Design work MUST happen via tools. NEVER answer with only prose/plans/SVG dumps. Do NOT call finish until canvas tools succeeded.
5. WHERE to draw:
   - New poster beside an existing board → create_frame (same size, gap 48) then draw only in the NEW frame.
   - Edits on the active frame → draw inside it.
   - Empty canvas → create_frame then draw.
6. DELETION — NEVER delete_nodes unless the user explicitly asked to delete/remove/清除/删除. Prefer update_node. Never wipe a board to make room — create_frame instead.
7. Text: functional copy is always create_text. Path lettering only for decorative poster display titles when the poster skill allows it.
8. Icons: vary styles (outline, solid, duotone, clash-color layers, closed-path fills). Do not only draw empty stroked boxes. Compose “boolean-like” icons with overlapping filled shapes.
9. After real mutations, finish with a short Chinese summary. If nothing was created, say so honestly.
10. 8pt spacing only (4/8/12/16/24/32/48). Follow any DESIGN STYLE / skill guide in context.
11. Never invent tool names. User-facing text in Chinese.
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
                "name": "ask_user",
                "description": "Stop and ask before drawing when no artboard / target deleted / which frame is unclear. Provide option chips (one action each; do not include Cancel).",
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
