"""Post-process: wrap / clean / normalize SVG layers per admin layerize.* rules."""

from __future__ import annotations

import re
from typing import Any
from xml.etree import ElementTree as ET


def _strip_ns(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _flag_on(rules: dict[str, str], key: str, default: str = "1") -> bool:
    return str(rules.get(key, default)).strip().lower() not in ("0", "false", "off", "no")


def _active_features(rules: dict[str, str]) -> set[str]:
    features = (rules.get("layerize.features") or "").lower()
    cleanup = (rules.get("layerize.svg_cleanup") or "").lower()
    overflow = (rules.get("layerize.overflow") or "").lower()
    merge = (rules.get("layerize.merge_rules") or "").lower()
    style = (rules.get("layerize.style_normalize") or "").lower()
    active: set[str] = set()
    for part in re.split(r"[|;,]+", f"{features};{cleanup}"):
        p = part.strip()
        if p:
            active.add(p)
    if "overflow" not in active and overflow and "off" not in overflow and overflow not in ("0", "false"):
        active.add("overflow")
    if "merge_same_style" not in active and ("merge" in merge and "off" not in merge):
        active.add("merge_same_style")
    if "normalize_style" not in active and ("normalize" in style and "off" not in style):
        active.add("normalize_style")
    return active


def _parse_order(rules: dict[str, str], active: set[str]) -> list[str]:
    raw = (rules.get("layerize.pipeline_order") or "").strip()
    default = [
        "drop_comments",
        "normalize_style",
        "merge_same_style",
        "ensure_layers",
        "overflow",
        "drop_empty_g",
        "drop_defs_unused",
    ]
    if raw:
        order = [p.strip() for p in re.split(r"[|;,]+", raw) if p.strip()]
    else:
        order = default
    # always run ensure_layers if wrapping needed and not explicitly disabled
    if "ensure_layers" not in active:
        active.add("ensure_layers")
    return [step for step in order if step in active or step == "ensure_layers"]


def _style_dict(el: ET.Element) -> dict[str, str]:
    out: dict[str, str] = {}
    style = el.get("style") or ""
    for part in style.split(";"):
        if ":" not in part:
            continue
        k, v = part.split(":", 1)
        out[k.strip().lower()] = v.strip()
    for attr in ("fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"):
        if el.get(attr) is not None:
            out[attr] = str(el.get(attr))
    return out


def _normalize_style_el(el: ET.Element) -> None:
    style = _style_dict(el)
    if not style:
        return
    for k, v in list(style.items()):
        if k in ("fill", "stroke") and isinstance(v, str):
            style[k] = v.strip().lower() if v.startswith("#") else v.strip()
        if k == "stroke-width":
            try:
                style[k] = str(float(v))
            except ValueError:
                pass
    # promote common attrs out of style=
    for k in ("fill", "stroke", "stroke-width", "opacity"):
        if k in style:
            el.set(k, style[k])
    # keep residual style without promoted keys
    residual = {k: v for k, v in style.items() if k not in ("fill", "stroke", "stroke-width", "opacity")}
    if residual:
        el.set("style", ";".join(f"{k}:{v}" for k, v in residual.items()))
    elif "style" in el.attrib:
        del el.attrib["style"]
    for child in list(el):
        _normalize_style_el(child)


def _style_key(el: ET.Element) -> str:
    s = _style_dict(el)
    return "|".join(
        f"{k}={s.get(k, '')}"
        for k in ("fill", "stroke", "stroke-width", "opacity")
    )


def _merge_same_style(root: ET.Element) -> None:
    """Group consecutive sibling paths/shapes that share fill/stroke into one <g>."""
    children = list(root)
    if len(children) < 2:
        return
    i = 0
    while i < len(children):
        child = children[i]
        tag = _strip_ns(child.tag).lower()
        if tag not in ("path", "rect", "circle", "ellipse", "polygon", "polyline", "line"):
            i += 1
            continue
        key = _style_key(child)
        j = i + 1
        while j < len(children):
            nxt = children[j]
            ntag = _strip_ns(nxt.tag).lower()
            if ntag not in ("path", "rect", "circle", "ellipse", "polygon", "polyline", "line"):
                break
            if _style_key(nxt) != key:
                break
            j += 1
        if j - i >= 2:
            g = ET.Element("g", {"id": f"layer-merged-{i}", "data-merged": "same-style"})
            # insert group at position of first child
            idx = list(root).index(child)
            batch = children[i:j]
            for el in batch:
                root.remove(el)
                g.append(el)
            root.insert(idx, g)
            children = list(root)
            i = idx + 1
        else:
            i += 1


def _ensure_layers(root: ET.Element, *, prefix: str) -> None:
    children = list(root)
    role_counts: dict[str, int] = {}
    for child in children:
        tag = _strip_ns(child.tag).lower()
        if tag in ("defs", "title", "desc", "metadata", "style", "script"):
            continue
        cid = child.get("id") or ""
        if tag == "g" and cid.startswith(prefix):
            continue
        role = "text" if tag == "text" else "shape"
        if tag == "image":
            role = "product"
        if tag == "rect" and (child.get("width") in ("100%", str(root.get("width") or ""))):
            role = "bg"
        n = role_counts.get(role, 0)
        role_counts[role] = n + 1
        lid = f"{prefix}{role}-{n}"
        if tag == "g":
            if not cid:
                child.set("id", lid)
            continue
        g = ET.Element("g", {"id": lid})
        idx = list(root).index(child)
        root.remove(child)
        g.append(child)
        root.insert(idx, g)


def _strip_etag_ns(root: ET.Element) -> None:
    """ElementTree often emits <ns0:svg> after parse; flatten to plain SVG tags."""
    for el in root.iter():
        tag = el.tag
        if isinstance(tag, str) and tag.startswith("{") and "}" in tag:
            el.tag = tag.rsplit("}", 1)[-1]
        # Drop Clark-notation attribute keys if any slipped in.
        for attr in list(el.attrib):
            if isinstance(attr, str) and attr.startswith("{") and "}" in attr:
                el.set(attr.rsplit("}", 1)[-1], el.attrib.pop(attr))


def _serialize_svg(root: ET.Element) -> str:
    _strip_etag_ns(root)
    if not root.get("xmlns"):
        root.set("xmlns", "http://www.w3.org/2000/svg")
    return ET.tostring(root, encoding="unicode")


def _apply_overflow(root: ET.Element, *, mode: str, width: int, height: int, margin: float) -> None:
    mode = (mode or "clip").lower()
    if mode in ("off", "0", "false", "no"):
        return
    root.set("overflow", "hidden")
    if mode == "flag":
        root.set("data-overflow-check", "1")
        root.set("data-overflow-margin", str(margin))
        return
    # clip: add clipPath
    cid = "layerize-canvas-clip"
    defs = None
    for child in list(root):
        if _strip_ns(child.tag).lower() == "defs":
            defs = child
            break
    if defs is None:
        defs = ET.Element("defs")
        root.insert(0, defs)
    # replace existing clip of same id
    for c in list(defs):
        if c.get("id") == cid:
            defs.remove(c)
    clip = ET.Element("clipPath", {"id": cid})
    x = -margin
    y = -margin
    w = width + 2 * margin
    h = height + 2 * margin
    clip.append(
        ET.Element(
            "rect",
            {
                "x": str(x),
                "y": str(y),
                "width": str(w),
                "height": str(h),
            },
        )
    )
    defs.append(clip)
    root.set("clip-path", f"url(#{cid})")


def _drop_empty_groups(xml: str) -> str:
    prev = None
    out = xml
    # iterative for nested empties
    for _ in range(8):
        prev = out
        out = re.sub(r"<g(\s[^>]*)?>\s*</g>", "", out, flags=re.I)
        if out == prev:
            break
    return out


def layerize_svg(
    raw: str,
    *,
    width: int = 1080,
    height: int = 1920,
    rules: dict[str, str] | None = None,
) -> str:
    """
    Best-effort industrial layerize:
    drop_comments -> normalize_style -> merge_same_style -> ensure_layers -> overflow -> drop_empty_g
    """
    rules = rules or {}
    if not _flag_on(rules, "layerize.enabled", "1"):
        return (raw or "").strip()

    active = _active_features(rules)
    order = _parse_order(rules, active)
    prefix = (rules.get("layerize.layer_prefix") or "layer-").strip() or "layer-"
    text = (raw or "").strip()

    if "drop_comments" in order:
        text = re.sub(r"<!--[\s\S]*?-->", "", text)

    if not text:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}"></svg>'
        )

    svg_match = re.search(r"<(?:[\w.-]+:)?svg\b[\s\S]*?</(?:[\w.-]+:)?svg>", text, re.I)
    if not svg_match:
        svg_match = re.search(r"<(?:[\w.-]+:)?svg\b[^>]*>[\s\S]*", text, re.I)
    body = svg_match.group(0) if svg_match else f"<svg>{text}</svg>"
    # ElementTree needs a closable tree; append missing closer for unclosed roots.
    if svg_match and not re.search(r"</(?:[\w.-]+:)?svg\s*>", body, re.I):
        body = body + "</svg>"

    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}">'
            f'<g id="{prefix}bg-0"><rect width="100%" height="100%" fill="#ffffff"/></g>'
            f"</svg>"
        )

    if _strip_ns(root.tag).lower() != "svg":
        wrapper = ET.Element("svg")
        wrapper.append(root)
        root = wrapper

    root.set("xmlns", "http://www.w3.org/2000/svg")
    if not root.get("width"):
        root.set("width", str(width))
    if not root.get("height"):
        root.set("height", str(height))
    if not root.get("viewBox"):
        root.set("viewBox", f"0 0 {width} {height}")

    for step in order:
        if step == "normalize_style":
            _normalize_style_el(root)
        elif step == "merge_same_style":
            _merge_same_style(root)
        elif step == "ensure_layers":
            _ensure_layers(root, prefix=prefix)
        elif step == "overflow":
            mode = (rules.get("layerize.overflow_mode") or "clip").strip().lower() or "clip"
            try:
                margin = float(rules.get("layerize.overflow_margin") or "0")
            except ValueError:
                margin = 0.0
            _apply_overflow(root, mode=mode, width=width, height=height, margin=margin)

    out = _serialize_svg(root)
    if "drop_empty_g" in order or "drop_empty_g" in active:
        out = _drop_empty_groups(out)
    return out
