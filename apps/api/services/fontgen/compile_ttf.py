"""Compile calibrated vector glyphs into a TTF via fontTools."""

from __future__ import annotations

from typing import Any

from services.fontgen.calibrate import ASCENDER, DESCENDER, EM


def compile_ttf(
    glyphs: list[dict[str, Any]],
    *,
    family_name: str,
    style_name: str = "Regular",
) -> bytes:
    """
    Build a TrueType font from calibrated glyphs.

    Each glyph: ``{ char, contours: [[(x,y),...]], advance }`` in em units.
    """
    try:
        from fontTools.fontBuilder import FontBuilder
        from fontTools.pens.ttGlyphPen import TTGlyphPen
    except ImportError as err:
        raise RuntimeError(
            "fonttools is required for TTF compile (pip install fonttools)"
        ) from err

    family = (family_name or "RecombynAI").strip()[:60] or "RecombynAI"
    style = (style_name or "Regular").strip()[:40] or "Regular"

    glyph_order = [".notdef"]
    advance_widths: dict[str, int] = {".notdef": 500}
    cmap: dict[int, str] = {}
    tt_glyphs: dict[str, Any] = {".notdef": _empty_glyph()}

    used_names: set[str] = {".notdef"}
    for g in glyphs:
        ch = g.get("char") or ""
        if not ch:
            continue
        name = _glyph_name(ch, used_names)
        used_names.add(name)
        glyph_order.append(name)
        advance_widths[name] = int(round(float(g.get("advance") or 500)))
        cmap[ord(ch)] = name
        tt_glyphs[name] = _contours_to_glyph(g.get("contours") or [])

    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(tt_glyphs)
    metrics = {
        name: (int(advance_widths[name]), 0) for name in glyph_order
    }
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    fb.setupOS2(
        sTypoAscender=ASCENDER,
        sTypoDescender=DESCENDER,
        sCapHeight=700,
        sxHeight=500,
        usWinAscent=ASCENDER,
        usWinDescent=abs(DESCENDER),
    )
    fb.setupNameTable(
        {
            "familyName": family,
            "styleName": style,
            "uniqueFontIdentifier": f"{family}-{style}-Recombyn",
            "fullName": f"{family} {style}",
            "psName": _ps_name(family, style),
            "version": "Version 1.000",
        }
    )
    fb.setupPost()
    return _save_bytes(fb)


def _save_bytes(fb: Any) -> bytes:
    from io import BytesIO

    buf = BytesIO()
    fb.font.save(buf)
    return buf.getvalue()


def _glyph_name(ch: str, used: set[str]) -> str:
    if ch == " ":
        base = "space"
    elif ch.isalnum():
        base = f"uni{ord(ch):04X}" if not ch.isascii() else (
            f"A_{ch}" if ch.isupper() else f"a_{ch}" if ch.islower() else f"d_{ch}"
        )
        # Keep unique simple names for ASCII letters/digits
        if ch.isascii() and ch.isalnum():
            base = f"g_{ord(ch):04X}"
    else:
        base = f"uni{ord(ch):04X}"
    name = base
    i = 2
    while name in used:
        name = f"{base}_{i}"
        i += 1
    return name


def _ps_name(family: str, style: str) -> str:
    raw = f"{family}-{style}".replace(" ", "")
    return "".join(c for c in raw if c.isalnum() or c in "-_")[:63] or "RecombynAI-Regular"


def _empty_glyph() -> Any:
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    pen = TTGlyphPen(None)
    return pen.glyph()


def _contours_to_glyph(contours: list[list[tuple[float, float]]]) -> Any:
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    pen = TTGlyphPen(None)
    for ring in contours:
        if len(ring) < 3:
            continue
        # Ensure CCW for outer paths â€?fontTools/TrueType: on-curve points
        pts = [(float(x), float(y)) for x, y in ring]
        # Close without duplicating start
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue
        pen.moveTo(pts[0])
        for p in pts[1:]:
            pen.lineTo(p)
        pen.closePath()
    return pen.glyph()
