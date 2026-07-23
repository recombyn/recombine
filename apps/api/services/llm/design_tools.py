"""OpenAI-compatible tool schemas for the canvas design agent."""

from __future__ import annotations

from typing import Any


DESIGN_AGENT_SYSTEM = """You are recombyn Design Agent for an SVG design canvas.

Use the tool-calling loop: reply, look up materials, or emit canvas tool_ops.
Full design jobs use API /design/run (agent_loop) — same playbook as these tools.

Hard rules:
1. Prefer create_shape / create_text / create_image / create_frame for local edits.
2. VECTOR ONLY for chrome & icons. Use align_nodes / distribute_nodes for polish.
3. Images: user attach → create_image with attachmentIndex; otherwise placeholder.
4. NEVER delete_nodes unless the user explicitly asked to delete.
5. Text: functional copy is always create_text.
6. After mutations, finish with a short Chinese summary.
7. Never invent tool names. User-facing text in Chinese.
"""


def _fill_stroke_shadow_props() -> dict[str, Any]:
    """Shared style properties for create_shape + update_node."""
    return {
        "fill": {"type": "string", "description": "CSS color / gradient stop 0"},
        "fillEnd": {"type": "string", "description": "Second gradient stop"},
        "fillType": {
            "type": "string",
            "enum": ["solid", "linear", "radial", "angular", "diffuse", "image"],
        },
        "gradientAngle": {"type": "number"},
        "fillOpacity": {"type": "number", "description": "Fill opacity 0-100"},
        "meshSize": {
            "type": "number",
            "description": "Diffuse mesh grid 3-8 (default 4)",
        },
        "meshPoints": {
            "type": "array",
            "description": "Diffuse mesh points [{x,y,color}] in percent 0-100",
            "items": {
                "type": "object",
                "properties": {
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                    "color": {"type": "string"},
                },
            },
        },
        "fillImageSrc": {"type": "string", "description": "Image fill URL / data URL"},
        "fillImageFit": {
            "type": "string",
            "enum": ["fill", "fit", "crop", "tile"],
        },
        "fillImageRotate": {"type": "number"},
        "stroke": {"type": "string"},
        "borderWidth": {"type": "number"},
        "strokeOpacity": {"type": "number", "description": "Stroke opacity 0-100"},
        "strokeStyle": {
            "type": "string",
            "enum": [
                "solid",
                "dashed",
                "dotted",
                "long-dash",
                "short-dash",
                "dash-dot",
                "dash-dot-dot",
                "dense-dot",
            ],
            "description": "Dashed stroke preset (maps to SVG dasharray)",
        },
        "strokeAlign": {
            "type": "string",
            "enum": ["center", "inside", "outside"],
        },
        "strokeLinecap": {"type": "string", "enum": ["butt", "round", "square"]},
        "strokeLinejoin": {"type": "string", "enum": ["miter", "round", "bevel"]},
        "strokeSides": {
            "type": "object",
            "description": "Per-side strokes for rect-like shapes",
            "properties": {
                "T": {"type": "boolean"},
                "R": {"type": "boolean"},
                "B": {"type": "boolean"},
                "L": {"type": "boolean"},
            },
        },
        "shadowEnabled": {"type": "boolean"},
        "shadowVisible": {"type": "boolean"},
        "shadowColor": {"type": "string"},
        "shadowBlur": {"type": "number"},
        "shadowX": {"type": "number"},
        "shadowY": {"type": "number"},
        "cornerRadius": {"type": "number"},
        "radiusTL": {"type": "number"},
        "radiusTR": {"type": "number"},
        "radiusBR": {"type": "number"},
        "radiusBL": {"type": "number"},
        "opacity": {"type": "number"},
        "blendMode": {
            "type": "string",
            "description": "pass-through|normal|multiply|screen|overlay|...",
        },
        "rotation": {"type": "number"},
        "name": {"type": "string"},
    }


def design_tool_definitions() -> list[dict[str, Any]]:
    """OpenAI function-calling tool list for DeepSeek / compatible providers."""
    style = _fill_stroke_shadow_props()
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
                "description": (
                    "Stop and ask the user: unclear target frame, OR mid-task confirmation "
                    "(e.g. layout done — continue color?). "
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
                "name": "list_capabilities",
                "description": (
                    "List which canvas/editor features the Agent can control vs which are "
                    "NOT wired yet (产品预览/分享等). Call when the user asks about "
                    "zoom, canvas color, agent mode, preview, share, export, or chrome. "
                    "Export IS available via export_canvas. For unavailable items, tell "
                    "the user in Chinese how to do it manually."
                ),
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
                "name": "set_viewport",
                "description": (
                    "Control canvas zoom / fit view. "
                    "action: zoom_in|zoom_out|fit|set. For set, pass percent (e.g. 100) or zoom (1.0)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["zoom_in", "zoom_out", "fit", "set"],
                        },
                        "percent": {
                            "type": "number",
                            "description": "Target zoom percent when action=set (e.g. 50, 100, 200)",
                        },
                        "zoom": {
                            "type": "number",
                            "description": "Target zoom factor when action=set (1 = 100%)",
                        },
                    },
                    "required": ["action"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_canvas_background",
                "description": (
                    "Set the infinite-canvas stage background (not artboard frame fill). "
                    "Supports solid / linear / radial / angular / diffuse / image."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "color": {"type": "string"},
                        "fillType": {
                            "type": "string",
                            "enum": [
                                "solid",
                                "linear",
                                "radial",
                                "angular",
                                "diffuse",
                                "image",
                            ],
                        },
                        "fillEnd": {"type": "string"},
                        "gradientAngle": {"type": "number"},
                        "meshSize": {"type": "number"},
                        "fillImageSrc": {"type": "string"},
                        "opacity": {"type": "number"},
                    },
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_agent_mode",
                "description": (
                    "Set Agent execution mode (Execution mode dialog): "
                    "collaborative = pause every phase; "
                    "milestone = pause at major gates; "
                    "auto = full auto."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "mode": {
                            "type": "string",
                            "enum": ["collaborative", "milestone", "auto"],
                        },
                    },
                    "required": ["mode"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "toggle_editor_panel",
                "description": (
                    "Open/close editor chrome panels: layers, minimap, agent_settings. "
                    "Export uses export_canvas — not this tool. "
                    "Product preview / share are NOT available — say so if asked."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "panel": {
                            "type": "string",
                            "enum": ["layers", "minimap", "agent_settings"],
                        },
                        "open": {"type": "boolean"},
                    },
                    "required": ["panel"],
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
                    "Also call when the canvas is empty. Prefer this over ask_user when they already requested a design. "
                    "Default background is white (#FFFFFF) — do NOT set a thematic backgroundColor until the color phase. "
                    "Do NOT fill the artboard with gray placeholder rects for layout; use create_text labels instead."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "backgroundColor": {
                            "type": "string",
                            "description": "Default #FFFFFF; thematic colors only in color phase",
                        },
                    },
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_frame",
                "description": (
                    "Resize, rename, or set artboard backgroundColor. "
                    "Set thematic backgroundColor only in the color phase."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "frameId": {"type": "string"},
                        "name": {"type": "string"},
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
                "name": "create_shape",
                "description": (
                    "Create a vector shape. Prefer closed path/pen for custom icons and irregular forms. "
                    "shapeType pen|path: pass SVG path d (+ closed=true for fills). "
                    "shapeType pencil: freehand stroke; optional brushStyle (solid, calligraphy, marker, …). "
                    "Fills: solid|linear|radial|angular|diffuse (meshSize/meshPoints)|image (fillImageSrc). "
                    "Stroke: stroke/borderWidth + strokeStyle (dashed|dotted|…) + strokeAlign/cap/join. "
                    "Shadow: shadowEnabled + shadowBlur/X/Y/Color. "
                    "For true cuts/unions use boolean_op — do not fake with overlapping clash colors. "
                    "Filled shapes default to NO stroke — pass stroke/borderWidth only when you need an outline. "
                    "For full-bleed poster backgrounds: only in the color phase use update_frame "
                    "backgroundColor. Early phases keep a white artboard and use create_text for "
                    "zone labels — never gray/colored layout placeholder rects."
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
                                "pencil",
                            ],
                        },
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "sides": {"type": "number"},
                        "path": {
                            "type": "string",
                            "description": "SVG path d for path/pen/pencil; close the shape for fills",
                        },
                        "closed": {
                            "type": "boolean",
                            "description": "Close path and allow fill (icons / blobs)",
                        },
                        "brushStyle": {
                            "type": "string",
                            "description": (
                                "Pencil brush preset id "
                                "(solid, calligraphy, marker, pencil-hb, …)"
                            ),
                        },
                        **style,
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
                "description": (
                    "Create a native editable text node (same as the editor text tool). "
                    "Optional width = text-box / wrap column width — runtime honors it. "
                    "Omit width to hug single-line content. "
                    "Optional height; omit to measure from text (+ wrap if width set). "
                    "Pass a real text-box width (e.g. title ~content width, body ~column); "
                    "do not default short labels to the full artboard width."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "text": {"type": "string"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "fontSize": {"type": "number"},
                        "color": {"type": "string"},
                        "fontWeight": {"type": "string"},
                        "fontFamily": {"type": "string"},
                        "fontStyle": {"type": "string", "enum": ["normal", "italic"]},
                        "textAlign": {
                            "type": "string",
                            "enum": ["left", "center", "right"],
                        },
                        "lineHeight": {"type": "number"},
                        "letterSpacing": {"type": "number"},
                        "textDecoration": {
                            "type": "string",
                            "enum": ["none", "underline", "line-through"],
                        },
                        "opacity": {"type": "number"},
                        "blendMode": {"type": "string"},
                        "shadowEnabled": {"type": "boolean"},
                        "shadowColor": {"type": "string"},
                        "shadowBlur": {"type": "number"},
                        "shadowX": {"type": "number"},
                        "shadowY": {"type": "number"},
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
                "name": "create_svg",
                "description": (
                    "Add an SVG markup node (icons, illustrations). "
                    "Pass well-formed svg: prefer <svg viewBox=\"0 0 24 24\">…</svg> "
                    "or path/circle fragment. path d must use spaced SVG commands; "
                    "invalid SVG is rejected and the agent must retry."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "svg": {"type": "string"},
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "fill": {"type": "string"},
                        "name": {"type": "string"},
                    },
                    "required": ["svg", "x", "y", "width", "height"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_icon",
                "description": (
                    "Icon SVG node (same as create_svg). Prefer viewBox 0 0 24 24; "
                    "valid path d only — backend rejects broken markup."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "svg": {"type": "string"},
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "fill": {"type": "string"},
                        "name": {"type": "string"},
                    },
                    "required": ["svg", "x", "y", "width", "height"],
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
                    "Supports solid/linear/radial/angular/diffuse/image fills, "
                    "strokeStyle (dashed…), stroke align/cap/join, drop shadow, "
                    "blend, corner radii, rotation, flip, path, and full text styles. "
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
                        "flipX": {"type": "boolean"},
                        "flipY": {"type": "boolean"},
                        "path": {
                            "type": "string",
                            "description": "SVG path d for path/pen nodes",
                        },
                        "closed": {"type": "boolean"},
                        "text": {"type": "string"},
                        "fontSize": {"type": "number"},
                        "fontWeight": {"type": "string"},
                        "fontFamily": {"type": "string"},
                        "fontStyle": {"type": "string", "enum": ["normal", "italic"]},
                        "textAlign": {
                            "type": "string",
                            "enum": ["left", "center", "right"],
                        },
                        "lineHeight": {"type": "number"},
                        "letterSpacing": {"type": "number"},
                        "textDecoration": {
                            "type": "string",
                            "enum": ["none", "underline", "line-through"],
                        },
                        "color": {
                            "type": "string",
                            "description": "Text color (text nodes)",
                        },
                        **style,
                    },
                    "required": ["nodeId"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "align_nodes",
                "description": (
                    "Align 2+ nodes relative to their combined bounding box. "
                    "Modes: left|centerX|right|top|middle|bottom."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "mode": {
                            "type": "string",
                            "enum": [
                                "left",
                                "centerX",
                                "right",
                                "top",
                                "middle",
                                "bottom",
                            ],
                        },
                    },
                    "required": ["nodeIds", "mode"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "distribute_nodes",
                "description": (
                    "Evenly distribute 3+ nodes along an axis (equal gaps). "
                    "axis: h = horizontal, v = vertical."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "axis": {"type": "string", "enum": ["h", "v"]},
                    },
                    "required": ["nodeIds", "axis"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "boolean_op",
                "description": (
                    "Boolean combine 2+ closed shapes into one path node "
                    "(union|subtract|intersect|exclude). "
                    "First node is the base for subtract. Replaces inputs with the result. "
                    "Use for icon cuts, punched holes, merged silhouettes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "mode": {
                            "type": "string",
                            "enum": ["union", "subtract", "intersect", "exclude"],
                        },
                    },
                    "required": ["nodeIds", "mode"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "reorder_nodes",
                "description": (
                    "Change z-order (layer stacking). "
                    "action: front|back|forward|backward."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "action": {
                            "type": "string",
                            "enum": ["front", "back", "forward", "backward"],
                        },
                    },
                    "required": ["nodeIds", "action"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "group_nodes",
                "description": "Group 2+ nodes so they move/select together.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["nodeIds"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "ungroup_nodes",
                "description": "Remove group membership from the given nodes.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["nodeIds"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "duplicate_nodes",
                "description": (
                    "Duplicate nodes with a small offset. Returns new node ids."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "offsetX": {"type": "number"},
                        "offsetY": {"type": "number"},
                    },
                    "required": ["nodeIds"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "flip_nodes",
                "description": "Flip nodes horizontally and/or vertically.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "flipX": {"type": "boolean"},
                        "flipY": {"type": "boolean"},
                    },
                    "required": ["nodeIds"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "image_process",
                "description": (
                    "Start image toolbar pipeline on an image node "
                    "(upscale|removeBg|eraser|editElements|editText|multiAngle|"
                    "expand|adjust|crop|flipRotate|moveObject|vector)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodeId": {"type": "string"},
                        "kind": {
                            "type": "string",
                            "enum": [
                                "upscale",
                                "removeBg",
                                "eraser",
                                "editElements",
                                "editText",
                                "multiAngle",
                                "expand",
                                "adjust",
                                "crop",
                                "flipRotate",
                                "moveObject",
                                "vector",
                            ],
                        },
                        "targetWidth": {"type": "number"},
                        "targetHeight": {"type": "number"},
                        "label": {"type": "string"},
                    },
                    "required": ["nodeId", "kind"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "export_canvas",
                "description": (
                    "Download canvas or selection as png|jpeg|svg. "
                    "Optional nodeIds for selection-only export."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "format": {
                            "type": "string",
                            "enum": ["png", "jpeg", "svg"],
                        },
                        "nodeIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "multiplier": {"type": "number"},
                        "filename": {"type": "string"},
                    },
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
                "name": "delete_frame",
                "description": (
                    "Delete an artboard/frame by frameId from SCENE_FRAMES. "
                    "Destructive — ask the user to confirm first (reply + choices); "
                    "call only after they confirm. Never put ids in the user reply."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "frameId": {"type": "string"},
                    },
                    "required": ["frameId"],
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
