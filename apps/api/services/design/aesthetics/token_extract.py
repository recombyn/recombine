"""Runtime-side design-token analysis for aesthetic quality samples.

Turns GOOD/OK/BAD refs into concrete DESIGN_TOKENS (palette + layout + DS),
so the design agent obeys structured tokens instead of glancing at screenshots.
"""
from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_HEX = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")


def palette_from_image_bytes(data: bytes, *, k: int = 6) -> list[str]:
    """Dominant colors as #RRGGBB via PIL quantize (no OpenCV required)."""
    if not data:
        return []
    try:
        from services.design.aesthetics.views import load_pil

        img = load_pil(data)
        return palette_from_pil(img, k=k)
    except Exception:
        logger.debug("palette_from_image_bytes failed", exc_info=True)
        return []


def palette_from_pil(img: Any, *, k: int = 6) -> list[str]:
    """Dominant colors from an already-loaded RGB PIL image."""
    try:
        work = img.copy()
        work.thumbnail((160, 160))
        q = max(2, min(int(k or 6), 12))
        pal = work.quantize(colors=q, method=2).convert("RGB")
        small = pal.resize((48, 48))
        counts: dict[tuple[int, int, int], int] = {}
        for px in small.getdata():
            counts[px] = counts.get(px, 0) + 1
        ordered = sorted(counts.items(), key=lambda kv: -kv[1])
        out: list[str] = []
        for (r, g, b), _n in ordered[:q]:
            hex_c = f"#{r:02X}{g:02X}{b:02X}"
            if hex_c not in out:
                out.append(hex_c)
        return out
    except Exception:
        logger.debug("palette_from_pil failed", exc_info=True)
        return []


def layout_from_pil(img: Any, *, canvas_w: int = 0, canvas_h: int = 0) -> dict[str, Any]:
    """
    Deterministic layout / 排版 metrics from a sample image.

    Measures safe margins, content density, visual gravity, and zone mass so
    tool_ops can match spacing rhythm — not a vague «looks balanced» note.
    """
    try:
        from PIL import ImageFilter, ImageOps

        w, h = img.size
        if w < 8 or h < 8:
            return {}
        # Structure map: edges on grayscale — ink vs empty.
        g = ImageOps.grayscale(img)
        g = ImageOps.autocontrast(g)
        edges = g.filter(ImageFilter.FIND_EDGES)
        # Downsample for fast row/col scans.
        tw, th = 64, max(32, int(round(64 * h / max(w, 1))))
        small = edges.resize((tw, th))
        px = list(small.getdata())
        # Ink = edge strength above mid gray.
        ink = [1 if v >= 40 else 0 for v in px]

        def _row_mass(y0: int, y1: int) -> float:
            total = 0
            hit = 0
            for y in range(max(0, y0), min(th, y1)):
                base = y * tw
                for x in range(tw):
                    total += 1
                    hit += ink[base + x]
            return (hit / total) if total else 0.0

        def _col_mass(x0: int, x1: int) -> float:
            total = 0
            hit = 0
            for y in range(th):
                base = y * tw
                for x in range(max(0, x0), min(tw, x1)):
                    total += 1
                    hit += ink[base + x]
            return (hit / total) if total else 0.0

        # Margin: scan inward until ink density rises.
        def _edge_margin(axis: str) -> float:
            if axis == "top":
                for i in range(th):
                    if _row_mass(i, i + 1) > 0.04:
                        return i / th
                return 0.12
            if axis == "bottom":
                for i in range(th - 1, -1, -1):
                    if _row_mass(i, i + 1) > 0.04:
                        return (th - 1 - i) / th
                return 0.12
            if axis == "left":
                for i in range(tw):
                    if _col_mass(i, i + 1) > 0.04:
                        return i / tw
                return 0.08
            for i in range(tw - 1, -1, -1):
                if _col_mass(i, i + 1) > 0.04:
                    return (tw - 1 - i) / tw
            return 0.08

        top_m = _edge_margin("top")
        bot_m = _edge_margin("bottom")
        left_m = _edge_margin("left")
        right_m = _edge_margin("right")
        safe_pct = round(min(top_m, bot_m, left_m, right_m) * 100, 1)

        thirds_y = [
            round(_row_mass(0, th // 3) * 100, 1),
            round(_row_mass(th // 3, 2 * th // 3) * 100, 1),
            round(_row_mass(2 * th // 3, th) * 100, 1),
        ]
        thirds_x = [
            round(_col_mass(0, tw // 3) * 100, 1),
            round(_col_mass(tw // 3, 2 * tw // 3) * 100, 1),
            round(_col_mass(2 * tw // 3, tw) * 100, 1),
        ]
        fill = round(sum(ink) / max(len(ink), 1) * 100, 1)

        # Gravity labels from mass peaks.
        y_names = ("top", "middle", "bottom")
        x_names = ("left", "center", "right")
        v_grav = y_names[max(range(3), key=lambda i: thirds_y[i])]
        h_grav = x_names[max(range(3), key=lambda i: thirds_x[i])]

        # Column hint: left+right both strong vs center-dominant.
        side = thirds_x[0] + thirds_x[2]
        if thirds_x[1] >= side * 0.85 and thirds_x[1] >= 8:
            columns = "single-center"
        elif thirds_x[0] >= 8 and thirds_x[2] >= 8 and abs(thirds_x[0] - thirds_x[2]) < 12:
            columns = "two-column"
        elif thirds_x[0] > thirds_x[2] * 1.4:
            columns = "left-heavy"
        elif thirds_x[2] > thirds_x[0] * 1.4:
            columns = "right-heavy"
        else:
            columns = "mixed"

        # Density band for spacing discipline.
        if fill < 8:
            density = "sparse"
        elif fill < 18:
            density = "balanced"
        elif fill < 30:
            density = "dense"
        else:
            density = "crowded"

        # Map % margins → suggested px on current canvas (if known).
        ref_w = int(canvas_w) if canvas_w and canvas_w > 0 else w
        ref_h = int(canvas_h) if canvas_h and canvas_h > 0 else h
        margin_px = {
            "top": max(8, int(round(top_m * ref_h))),
            "bottom": max(8, int(round(bot_m * ref_h))),
            "left": max(8, int(round(left_m * ref_w))),
            "right": max(8, int(round(right_m * ref_w))),
            "safeMin": max(8, int(round(min(top_m, bot_m, left_m, right_m) * min(ref_w, ref_h)))),
        }
        # Gap estimate from vertical empty runs between ink bands.
        gap_est = max(8, int(round(margin_px["safeMin"] * 0.75)))

        return {
            "aspect": f"{w}:{h}",
            "marginPct": {
                "top": round(top_m * 100, 1),
                "bottom": round(bot_m * 100, 1),
                "left": round(left_m * 100, 1),
                "right": round(right_m * 100, 1),
                "safeMin": safe_pct,
            },
            "marginPx": margin_px,
            "gapMinPx": gap_est,
            "contentFillPct": fill,
            "density": density,
            "bandsY": {"top": thirds_y[0], "middle": thirds_y[1], "bottom": thirds_y[2]},
            "bandsX": {"left": thirds_x[0], "center": thirds_x[1], "right": thirds_x[2]},
            "gravity": f"{v_grav}-{h_grav}",
            "columns": columns,
            "hierarchyHint": (
                "title-top / body-middle"
                if v_grav == "top"
                else ("cta-bottom / content-above" if v_grav == "bottom" else "balanced-center")
            ),
        }
    except Exception:
        logger.debug("layout_from_pil failed", exc_info=True)
        return {}


def layout_from_image_bytes(
    data: bytes,
    *,
    canvas_w: int = 0,
    canvas_h: int = 0,
) -> dict[str, Any]:
    if not data:
        return {}
    try:
        from services.design.aesthetics.views import load_pil

        return layout_from_pil(load_pil(data), canvas_w=canvas_w, canvas_h=canvas_h)
    except Exception:
        logger.debug("layout_from_image_bytes failed", exc_info=True)
        return {}


def _hexes_from_text(*parts: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for part in parts:
        for m in _HEX.finditer(part or ""):
            h = m.group(0).upper()
            if len(h) == 4:  # #RGB → #RRGGBB
                h = f"#{h[1]*2}{h[2]*2}{h[3]*2}"
            elif len(h) == 9:  # #RRGGBBAA → drop alpha
                h = h[:7]
            if h not in seen:
                seen.add(h)
                found.append(h)
    return found


def _meta_tokens(meta: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(meta, dict) or not meta:
        return {}
    out: dict[str, Any] = {}
    for key in (
        "palette",
        "color",
        "type",
        "radius",
        "spacing",
        "margin",
        "gap",
        "mood",
        "tokens",
        "stroke",
        "ratio",
        "layout",
        "modules",
        "composition",
        "hierarchy",
        "columns",
        "density",
    ):
        val = meta.get(key)
        if val is None or val == "" or val == [] or val == {}:
            continue
        out[key] = val
    return out


def _assign_semantic_colors(palette: list[str]) -> dict[str, str]:
    """Map ranked palette → common DS roles (best-effort, runtime heuristic)."""
    if not palette:
        return {}
    roles: dict[str, str] = {}
    roles["brand.primary"] = palette[0]
    if len(palette) > 1:
        roles["bg.page"] = palette[1]
    if len(palette) > 2:
        roles["text.primary"] = palette[2]
    if len(palette) > 3:
        roles["bg.container"] = palette[3]
    if len(palette) > 4:
        roles["brand.primaryLight"] = palette[4]
    if len(palette) > 5:
        roles["border.default"] = palette[5]
    return roles


def analyze_sample_tokens(
    sample: dict[str, Any],
    *,
    canvas_w: int = 0,
    canvas_h: int = 0,
) -> dict[str, Any]:
    """Build token dict for one sample: palette + layout/排版 + meta."""
    sid = sample.get("id")
    name = str(sample.get("name") or f"#{sid}")[:80]
    grade = str(sample.get("grade") or "").strip().lower() or "?"
    tags = str(sample.get("tags") or "").strip()
    comment = str(sample.get("comment") or "").strip()
    image_url = str(sample.get("imageUrl") or "").strip()

    meta: dict[str, Any] | None = sample.get("meta") if isinstance(sample.get("meta"), dict) else None
    if meta is None and sid is not None:
        try:
            from services.design.quality_sample_store import get_quality_sample

            full = get_quality_sample(int(sid))
            if isinstance(full, dict):
                maybe = full.get("meta")
                if isinstance(maybe, dict):
                    meta = maybe
                if not image_url:
                    image_url = str(full.get("imageUrl") or "").strip()
                if not comment:
                    comment = str(full.get("comment") or "").strip()
                if not tags:
                    tags = str(full.get("tags") or "").strip()
        except Exception:
            logger.debug("get_quality_sample meta failed id=%s", sid, exc_info=True)

    from_meta = _meta_tokens(meta)
    palette: list[str] = []
    meta_pal = from_meta.get("palette")
    if isinstance(meta_pal, list):
        palette = [str(x).strip().upper() for x in meta_pal if str(x).strip()]
    elif isinstance(meta_pal, str) and meta_pal.strip():
        palette = _hexes_from_text(meta_pal) or [meta_pal.strip()]

    palette.extend(_hexes_from_text(comment, tags))
    seen: set[str] = set()
    deduped: list[str] = []
    for c in palette:
        cu = c.upper() if c.startswith("#") else c
        if cu not in seen:
            seen.add(cu)
            deduped.append(cu if cu.startswith("#") else c)
    palette = deduped

    layout: dict[str, Any] = {}
    # Meta layout/composition first; image metrics fill gaps.
    for key in ("layout", "composition", "modules", "hierarchy", "columns", "density"):
        if key in from_meta:
            layout[f"meta_{key}"] = from_meta[key]
    # Promote nested layout dict from Admin meta (stored DESIGN_TOKENS).
    nested_layout = from_meta.get("layout")
    if isinstance(nested_layout, dict):
        for k, v in nested_layout.items():
            if v is None or v == "" or v == [] or v == {}:
                continue
            if k not in layout:
                layout[k] = v

    has_stored_layout = bool(
        layout.get("marginPx")
        or layout.get("density")
        or layout.get("gapMinPx")
        or layout.get("columns")
        or from_meta.get("margin")
        or from_meta.get("density")
        or from_meta.get("columns")
    )
    need_image = bool(image_url) and (len(palette) < 3 or not has_stored_layout)

    if need_image:
        try:
            from services.design.aesthetics.embed_job import fetch_image_bytes
            from services.design.aesthetics.views import load_pil

            data = fetch_image_bytes(image_url)
            pil = load_pil(data)
            if len(palette) < 3:
                for c in palette_from_pil(pil, k=6):
                    if c not in seen:
                        seen.add(c)
                        palette.append(c)
            measured = layout_from_pil(pil, canvas_w=canvas_w, canvas_h=canvas_h)
            if measured:
                for k, v in measured.items():
                    if k not in layout or layout.get(k) in (None, "", [], {}):
                        layout[k] = v
        except Exception:
            logger.debug(
                "image palette/layout extract failed url=%s",
                image_url[:80],
                exc_info=True,
            )

    roles = _assign_semantic_colors(palette[:8])
    nested_tokens = from_meta.get("tokens") if isinstance(from_meta.get("tokens"), dict) else {}
    margin = from_meta.get("margin") or (nested_tokens or {}).get("margin")
    if not margin and isinstance(layout.get("marginPx"), dict):
        margin = layout["marginPx"]
    gap = from_meta.get("gap") or (nested_tokens or {}).get("gap")
    if not gap and layout.get("gapMinPx"):
        gap = {"min": layout["gapMinPx"]}

    vision_structure = None
    for key in ("visionStructure", "structure"):
        cand = from_meta.get(key) if isinstance(from_meta, dict) else None
        if cand is None and isinstance(meta, dict):
            cand = meta.get(key)
        if isinstance(cand, dict) and cand:
            vision_structure = cand
            break

    return {
        "id": sid,
        "name": name,
        "grade": grade,
        "tags": tags,
        "comment": comment[:240],
        "palette": palette[:8],
        "colorRoles": roles,
        "layout": layout,
        "type": from_meta.get("type") or (nested_tokens or {}).get("type"),
        "radius": from_meta.get("radius") or (nested_tokens or {}).get("radius"),
        "spacing": from_meta.get("spacing") or (nested_tokens or {}).get("spacing"),
        "margin": margin,
        "gap": gap,
        "mood": from_meta.get("mood"),
        "extraTokens": nested_tokens if nested_tokens else None,
        "visionStructure": vision_structure,
        "source": "host_token_extract",
    }


def _fmt_val(val: Any) -> str:
    if isinstance(val, dict):
        return ", ".join(f"{k}={v}" for k, v in val.items())
    if isinstance(val, list):
        return ", ".join(str(x) for x in val)
    return str(val)


def _format_layout_lines(layout: dict[str, Any]) -> list[str]:
    """Concrete 排版 lines for one sample."""
    if not isinstance(layout, dict) or not layout:
        return []
    lines: list[str] = []
    mp = layout.get("marginPx")
    pct = layout.get("marginPct")
    if isinstance(mp, dict) and mp:
        bits = [f"{k}={v}px" for k, v in mp.items()]
        lines.append("  LAYOUT.marginPx: " + ", ".join(bits))
    if isinstance(pct, dict) and pct:
        lines.append(
            "  LAYOUT.marginPct: "
            + ", ".join(f"{k}={v}%" for k, v in pct.items())
        )
    for key, label in (
        ("gapMinPx", "LAYOUT.gapMin"),
        ("contentFillPct", "LAYOUT.contentFill"),
        ("density", "LAYOUT.density"),
        ("columns", "LAYOUT.columns"),
        ("gravity", "LAYOUT.gravity"),
        ("hierarchyHint", "LAYOUT.hierarchy"),
        ("aspect", "LAYOUT.aspect"),
    ):
        val = layout.get(key)
        if val is None or val == "":
            continue
        suffix = "%" if key == "contentFillPct" else ("px" if key == "gapMinPx" else "")
        lines.append(f"  {label}: {val}{suffix}")
    by = layout.get("bandsY")
    bx = layout.get("bandsX")
    if isinstance(by, dict) and by:
        lines.append(
            "  LAYOUT.bandsY: "
            + ", ".join(f"{k}={v}%" for k, v in by.items())
            + " (content mass)"
        )
    if isinstance(bx, dict) and bx:
        lines.append(
            "  LAYOUT.bandsX: "
            + ", ".join(f"{k}={v}%" for k, v in bx.items())
            + " (content mass)"
        )
    for key in ("meta_layout", "meta_composition", "meta_modules", "meta_hierarchy"):
        val = layout.get(key)
        if val is None or val == "" or val == {} or val == []:
            continue
        lines.append(f"  LAYOUT.{key[5:]}: {_fmt_val(val)}")
    return lines


def format_sample_token_lines(analyzed: dict[str, Any], *, verb: str) -> list[str]:
    """Lines for one sample's concrete tokens (color + 排版)."""
    grade = analyzed.get("grade") or "?"
    name = analyzed.get("name") or "?"
    lines = [f"- [{grade}] {name} — runtime tokens ({verb}):"]
    palette = analyzed.get("palette") or []
    if palette:
        lines.append(f"  PALETTE: {', '.join(str(c) for c in palette)}")
    roles = analyzed.get("colorRoles") or {}
    if isinstance(roles, dict) and roles:
        lines.append("  COLOR_ROLES: " + ", ".join(f"{k}={v}" for k, v in roles.items()))
    layout = analyzed.get("layout") if isinstance(analyzed.get("layout"), dict) else {}
    lines.extend(_format_layout_lines(layout or {}))
    for key, label in (
        ("type", "TYPE"),
        ("radius", "RADIUS"),
        ("spacing", "SPACING"),
        ("margin", "MARGIN"),
        ("gap", "GAP"),
        ("mood", "MOOD"),
    ):
        val = analyzed.get(key)
        if val is None or val == "" or val == {} or val == []:
            continue
        # Skip margin/gap if already covered by LAYOUT.*
        if key in ("margin", "gap") and layout:
            continue
        lines.append(f"  {label}: {_fmt_val(val)}")
    comment = (analyzed.get("comment") or "").strip()
    if comment:
        lines.append(f"  备注：{comment[:200]}")
    vs = analyzed.get("visionStructure")
    if isinstance(vs, dict) and vs:
        try:
            from services.design.aesthetics.structure_extract import (
                format_structure_guidance,
            )

            block = format_structure_guidance(vs)
            if block:
                for ln in block.split("\n"):
                    lines.append(f"  {ln}" if not ln.startswith("USER_REF") else ln)
        except Exception:
            logger.debug("format_structure_guidance failed", exc_info=True)
    if not palette and not roles and not layout and not comment and not vs:
        lines.append(
            "  （无法抽取色板/布局 — 请使用场景 DESIGN_TOKENS 基线）"
        )
    return lines


def build_aesthetic_token_guidance(
    *,
    scene: str,
    good_refs: list[dict[str, Any]],
    ok_refs: list[dict[str, Any]] | None = None,
    bad_refs: list[dict[str, Any]] | None = None,
    user_ref_urls: list[str] | None = None,
    canvas_w: int = 0,
    canvas_h: int = 0,
    slim_corpus: bool = False,
) -> tuple[str, list[dict[str, Any]]]:
    """
    Runtime analysis block: scene DS + user refs (PRIMARY) + corpus samples.
    When the user attaches reference images, those tokens outrank corpus GOOD.
    slim_corpus=True: user + optional BAD only (no GOOD/OK token dump).
    """
    goods = [r for r in (good_refs or []) if isinstance(r, dict)]
    mids = [r for r in (ok_refs or []) if isinstance(r, dict)]
    bads = [r for r in (bad_refs or []) if isinstance(r, dict)]
    if slim_corpus:
        goods = []
        mids = []
        bads = bads[:1]
    user_urls = [
        str(u).strip()
        for u in (user_ref_urls or [])
        if isinstance(u, str) and str(u).strip()
    ][:4]
    user_rows: list[dict[str, Any]] = [
        {
            "id": f"user-ref-{i}",
            "name": f"USER_REF_{i}",
            "grade": "user",
            "tags": "user-reference",
            "comment": "User-provided reference — highest priority for color + layout.",
            "imageUrl": url,
        }
        for i, url in enumerate(user_urls)
    ]

    if not user_rows and not goods and not mids and not bads:
        return "", []

    analyzed: list[dict[str, Any]] = []
    has_user = bool(user_rows)
    try:
        from services.design.prompt_pack_store import resolve_prompt_body

        tok_hdr = resolve_prompt_body("agent.prompt.aesthetic_tokens_header").strip()
    except Exception:
        tok_hdr = ""
    lines: list[str] = (
        [ln for ln in tok_hdr.splitlines() if ln.strip()]
        if tok_hdr
        else [
            "AESTHETIC_DESIGN_TOKENS（运行时已分析 — 必须遵守；不要凭截图瞎猜）：",
            "在 tool_ops 中使用十六进制色 + 布局度量：fill/color/fontSize/cornerRadius/x/y/width/"
            "height/padding/gap/margin。对齐 marginPx、gapMin、density、columns、gravity。",
        ]
    )
    if has_user:
        lines.append(
            "优先级：用户参考令牌优先。"
            "存在用户附件时省略语料优秀/可用；反例仅作规避。"
        )
    else:
        lines.append(
            "优秀 = 目标布局与配色；可用 = 请超越该基线；反例 = 避开这些模式。"
        )

    # Scene design-system baseline (spacing/type/radius/component metrics).
    try:
        from services.design.token_store import format_token_block, resolve_token_pack

        pack = resolve_token_pack(scene=scene)
        block = format_token_block(pack)
        if block:
            lines.extend(["", "SCENE_BASELINE " + block.split("\n", 1)[0]])
            for ln in block.split("\n")[1:]:
                lines.append(ln)
    except Exception:
        logger.debug("resolve_token_pack failed scene=%s", scene, exc_info=True)

    def _section(rows: list[dict[str, Any]], *, title: str, verb: str) -> None:
        if not rows:
            return
        lines.append("")
        lines.append(title)
        for r in rows:
            a = analyze_sample_tokens(r, canvas_w=canvas_w, canvas_h=canvas_h)
            analyzed.append(a)
            lines.extend(format_sample_token_lines(a, verb=verb))

    if has_user:
        _section(
            user_rows,
            title="用户参考令牌（主参考 — 优先模仿）：",
            verb="模仿用户",
        )
        if goods:
            _section(
                goods,
                title="语料优秀（次要 — 仅补缺口；勿覆盖用户）：",
                verb="次要",
            )
    else:
        _section(goods, title="优秀样本令牌（模仿配色 + 排版）：", verb="模仿")

    _section(mids, title="可用样本令牌（请超越）：", verb="超越")
    _section(
        bads,
        title="反例样本令牌（避开 — 勿复用这些配色/布局失败）：",
        verb="避开",
    )

    # PRIMARY_OVERRIDE: user refs beat corpus GOOD.
    primary_pool = [a for a in analyzed if a.get("grade") == "user"]
    if not primary_pool:
        primary_pool = [a for a in analyzed if a.get("grade") == "good"]
    if primary_pool:
        top = primary_pool[0]
        lines.append("")
        parts: list[str] = []
        if top.get("palette"):
            parts.append(f"palette {', '.join(top['palette'][:6])}")
        lay = top.get("layout") if isinstance(top.get("layout"), dict) else {}
        if isinstance(lay, dict) and lay.get("marginPx"):
            mp = lay["marginPx"]
            parts.append(
                f"marginPx safeMin≥{mp.get('safeMin')} "
                f"gapMin≥{lay.get('gapMinPx', mp.get('safeMin'))} "
                f"density={lay.get('density')} columns={lay.get('columns')} "
                f"gravity={lay.get('gravity')}"
            )
        if parts:
            src = "用户参考" if top.get("grade") == "user" else "顶级优秀样本"
            lines.append(
                f"主覆盖来自{src}："
                + "; ".join(parts)
                + "（除非 USER_PROMPT 另有覆盖）。"
            )

    return "\n".join(lines), analyzed


def merge_design_token_meta(
    base: dict[str, Any] | None,
    overlay: dict[str, Any] | None,
) -> dict[str, Any]:
    """Merge token metas — overlay wins on non-empty values (Admin edits beat auto extract)."""
    out: dict[str, Any] = {}
    if isinstance(base, dict):
        for k, v in base.items():
            if v is None or v == "" or v == [] or v == {}:
                continue
            out[k] = v
    if isinstance(overlay, dict):
        for k, v in overlay.items():
            if v is None or v == "" or v == [] or v == {}:
                continue
            out[k] = v
    return out


def extract_design_tokens_meta(
    *,
    image_url: str,
    name: str = "",
    grade: str = "good",
    tags: str = "",
    comment: str = "",
    canvas_w: int = 0,
    canvas_h: int = 0,
) -> dict[str, Any]:
    """Runtime-extract DESIGN_TOKENS shaped for ``design_quality_sample.meta_json``.

    Prefer storing this at Admin save time so runtime lookups skip re-download.
    """
    url = (image_url or "").strip()
    if not url:
        raise ValueError("imageUrl required")
    analyzed = analyze_sample_tokens(
        {
            "name": name or "sample",
            "grade": grade or "good",
            "tags": tags or "",
            "comment": comment or "",
            "imageUrl": url,
        },
        canvas_w=canvas_w,
        canvas_h=canvas_h,
    )
    layout = analyzed.get("layout") if isinstance(analyzed.get("layout"), dict) else {}
    meta: dict[str, Any] = {
        "palette": list(analyzed.get("palette") or [])[:8],
        "colorRoles": analyzed.get("colorRoles") or {},
        "margin": analyzed.get("margin"),
        "gap": analyzed.get("gap"),
        "type": analyzed.get("type"),
        "radius": analyzed.get("radius"),
        "spacing": analyzed.get("spacing"),
        "mood": analyzed.get("mood"),
        "layout": layout,
        "density": layout.get("density") if isinstance(layout, dict) else None,
        "columns": layout.get("columns") if isinstance(layout, dict) else None,
        "tokensSource": "host_auto",
    }
    if isinstance(analyzed.get("extraTokens"), dict):
        meta["tokens"] = analyzed["extraTokens"]
    return merge_design_token_meta({}, meta)
