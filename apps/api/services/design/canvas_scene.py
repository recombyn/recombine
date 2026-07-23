"""Canvas size / scene resolution for the design agent.

UI tab and canvas chip own scene+size. Prompt text does not keyword-route scene.
"""

from __future__ import annotations

import re
from typing import Any

STOCK_CANVAS = {
    "website": "1440x900",
    "mobile": "390x844",
    "image": "1024x1024",
    "poster": "1080x1920",
}

SCENE_KEYS = frozenset({"website", "mobile", "image", "poster"})


def _as_text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def _rule_text(rules: dict[str, Any] | None, key: str, default: str = "") -> str:
    rules = rules or {}
    if key not in rules or rules.get(key) is None:
        return default
    return _as_text(rules.get(key), default)


def scene_key(scene: str | None) -> str:
    return (scene or "").strip().lower()


def extract_size_from_prompt(prompt: str) -> tuple[int, int] | None:
    m = re.search(r"(\d{2,5})\s*[x×*]\s*(\d{2,5})", prompt or "", re.I)
    if not m:
        return None
    w, h = int(m.group(1)), int(m.group(2))
    if 64 <= w <= 8000 and 64 <= h <= 8000:
        return w, h
    return None


def extract_size_hint_from_prompt(prompt: str) -> tuple[int | None, int | None]:
    """Full WxH, or a single side when the other is omitted."""
    full = extract_size_from_prompt(prompt)
    if full:
        return full[0], full[1]
    text = prompt or ""
    w: int | None = None
    h: int | None = None
    mw = re.search(
        r"(?:宽度|宽|width)\s*[:=：]?\s*(\d{2,5})|(\d{2,5})\s*(?:px|像素)?\s*(?:宽|宽度)",
        text,
        re.I,
    )
    if mw:
        raw = mw.group(1) or mw.group(2)
        try:
            n = int(raw)
            if 64 <= n <= 8000:
                w = n
        except (TypeError, ValueError):
            pass
    mh = re.search(
        r"(?:高度|高|height)\s*[:=：]?\s*(\d{2,5})|(\d{2,5})\s*(?:px|像素)?\s*(?:高|高度)",
        text,
        re.I,
    )
    if mh:
        raw = mh.group(1) or mh.group(2)
        try:
            n = int(raw)
            if 64 <= n <= 8000:
                h = n
        except (TypeError, ValueError):
            pass
    return w, h


def canvas_dim_locks(canvas_size: str | None) -> tuple[int | None, int | None]:
    """Parse client canvas chip: auto → (None,None); 400xauto → (400,None)."""
    raw = _as_text(canvas_size).strip().lower().replace("*", "x").replace("×", "x")
    raw = re.sub(r"\s+", "", raw)
    if not raw or raw == "auto":
        return None, None
    if "x" not in raw:
        return None, None
    a, b = raw.split("x", 1)

    def _side(tok: str) -> int | None:
        if tok in ("", "auto"):
            return None
        try:
            n = int(tok)
        except ValueError:
            return None
        return n if 64 <= n <= 8000 else None

    return _side(a), _side(b)


def explicit_canvas_size(canvas_size: str | None) -> bool:
    """True when the client sent a fully fixed WxH."""
    fw, fh = canvas_dim_locks(canvas_size)
    return fw is not None and fh is not None


def canvas_hint_line(canvas_size: str | None, rules: dict[str, Any] | None = None) -> str:
    """Extra req_parse guidance for auto / partial sizes."""
    fw, fh = canvas_dim_locks(canvas_size)
    if fw is not None and fh is not None:
        tmpl = _rule_text(rules, "canvas.hint.locked", "CANVAS_HINT: locked {w}x{h}.")
        return tmpl.format(w=fw, h=fh)
    if fw is not None:
        tmpl = _rule_text(
            rules, "canvas.hint.width_fixed", "CANVAS_HINT: width={w}; height=auto."
        )
        return tmpl.format(w=fw)
    if fh is not None:
        tmpl = _rule_text(
            rules, "canvas.hint.height_fixed", "CANVAS_HINT: height={h}; width=auto."
        )
        return tmpl.format(h=fh)
    return _rule_text(rules, "canvas.hint.auto", "CANVAS_HINT: auto.")


def canvas_prompt_label(client_canvas_raw: str | None) -> str:
    """Chip the client sent — never substitute stock scene WxH for Auto."""
    fw, fh = canvas_dim_locks(client_canvas_raw)
    if fw is not None and fh is not None:
        return f"{fw}x{fh}"
    if fw is not None:
        return f"{fw}xauto"
    if fh is not None:
        return f"autox{fh}"
    raw = _as_text(client_canvas_raw).strip().lower().replace("*", "x").replace("×", "x")
    raw = re.sub(r"\s+", "", raw)
    return raw if raw else "auto"


def infer_scene_from_canvas(canvas_size: str | None) -> str | None:
    """Best-effort scene from WxH when the client omitted scene."""
    raw = _as_text(canvas_size).strip().lower().replace("*", "x")
    if "x" not in raw:
        return None
    a, b = raw.split("x", 1)
    try:
        w, h = int(a), int(b)
    except ValueError:
        return None
    if w < 64 or h < 64:
        return None
    for key, stock in STOCK_CANVAS.items():
        sw, sh = stock.lower().split("x", 1)
        try:
            if abs(int(sw) - w) <= 1 and abs(int(sh) - h) <= 1:
                return key
            if abs(int(sw) - h) <= 1 and abs(int(sh) - w) <= 1:
                return key
        except ValueError:
            continue
    if h > w * 1.15 and w <= 600:
        return "mobile"
    if h > w * 1.2 and 900 <= w <= 1400:
        return "poster"
    if abs(w - h) / max(w, h) < 0.08:
        return "image"
    if w >= h and w >= 1100:
        return "website"
    return None


def scene_from_medium(medium: dict[str, Any] | None) -> str | None:
    """Explicit task/UI scene continuity (not prompt keyword inference)."""
    if not isinstance(medium, dict):
        return None
    config = medium.get("config") if isinstance(medium.get("config"), dict) else {}
    design = medium.get("design") if isinstance(medium.get("design"), dict) else {}
    last_run = medium.get("last_run") if isinstance(medium.get("last_run"), dict) else {}
    for raw in (
        config.get("scene"),
        design.get("scene"),
        last_run.get("scene"),
    ):
        key = scene_key(str(raw or ""))
        if key in SCENE_KEYS:
            return key
    return infer_scene_from_canvas(str(last_run.get("canvas_size") or "") or None)


def resolve_agent_scene(
    scene: str | None,
    prompt: str = "",
    canvas_size: str | None = None,
    *,
    medium: dict[str, Any] | None = None,
) -> tuple[str, bool]:
    """
    Resolve design scene: UI tab → concrete canvas → prior task → website.
    Returns (scene_key, overridden) — overridden is always False.
    """
    _ = prompt
    provided = scene_key(scene)
    if provided in SCENE_KEYS:
        return provided, False
    inferred = infer_scene_from_canvas(canvas_size)
    if inferred:
        return inferred, False
    prior = scene_from_medium(medium)
    if prior:
        return prior, False
    return "website", False


def client_scene_auto(scene: str | None, canvas_size: str | None) -> bool:
    """True when UI left scene+size to the model (Auto)."""
    provided = scene_key(scene)
    if provided in SCENE_KEYS:
        return False
    if infer_scene_from_canvas(canvas_size):
        return False
    if explicit_canvas_size(canvas_size):
        return False
    return True


def align_canvas_size_to_scene(
    canvas_size: str | None,
    *,
    scene_key: str,
    overridden: bool,
) -> str | None:
    """If tab forced a stock size for the wrong scene, drop it so scene default applies."""
    if not overridden:
        return _as_text(canvas_size) or None
    raw = _as_text(canvas_size).strip().lower().replace("*", "x")
    if not raw:
        return None
    stock = {v.lower() for v in STOCK_CANVAS.values()}
    if raw in stock and raw != STOCK_CANVAS.get(scene_key, "").lower():
        return None
    return _as_text(canvas_size) or None


def parse_size(canvas_size: str | None, scene: str, rules: dict[str, str]) -> tuple[int, int]:
    key = f"default_size_{scene}" if scene else "default_size_poster"
    fallback = _rule_text(rules, key, "1080x1920")
    try:
        dw, dh = fallback.lower().split("x", 1)
        default_w, default_h = int(dw), int(dh)
    except ValueError:
        default_w, default_h = 1080, 1920
    fw, fh = canvas_dim_locks(canvas_size)
    if fw is not None and fh is not None:
        return max(64, fw), max(64, fh)
    if fw is not None:
        return max(64, fw), max(64, default_h)
    if fh is not None:
        return max(64, default_w), max(64, fh)
    raw = _as_text(canvas_size).strip().lower().replace("*", "x").replace("×", "x")
    if raw and raw != "auto" and "x" in raw:
        a, b = raw.split("x", 1)
        try:
            return max(64, int(a)), max(64, int(b))
        except ValueError:
            pass
    return default_w, default_h


def early_status_canvas_fields(
    *,
    w: int,
    h: int,
    client_size_locked: bool,
    client_canvas_raw: str | None,
) -> dict[str, Any]:
    """Before 设计思考: Auto must not publish provisional stock WxH."""
    if client_size_locked:
        return {
            "canvas_width": w,
            "canvas_height": h,
            "canvas_size": f"{w}x{h}",
        }
    raw = (
        _as_text(client_canvas_raw).strip().lower().replace("*", "x").replace("×", "x")
        or "auto"
    )
    return {
        "canvas_width": None,
        "canvas_height": None,
        "canvas_size": raw,
    }
