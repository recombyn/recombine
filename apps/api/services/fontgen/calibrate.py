"""Glyph metric calibration — baseline, weight, side bearings."""

from __future__ import annotations

from typing import Any


# Em square used by compile_ttf
EM = 1000
# Baseline from top of em box (y increases upward in font space)
ASCENDER = 800
DESCENDER = -200
CAP_HEIGHT = 700
X_HEIGHT = 500


def calibrate_glyphs(glyphs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Normalize vector glyphs into a shared em-box.

    Input glyph: ``{ char, contours, width, height, engine? }``
    Output adds: ``{ units: {contours in font space}, lsb, rsb, advance, ymin, ymax }``
    """
    # Measure global ink extents in image space (excluding space)
    ink_glyphs = [g for g in glyphs if g.get("char") != " " and g.get("contours")]
    if not ink_glyphs:
        return [_empty_space(g.get("char", " ")) for g in glyphs]

    all_ys: list[float] = []
    all_xs: list[float] = []
    for g in ink_glyphs:
        for ring in g["contours"]:
            for x, y in ring:
                all_xs.append(x)
                all_ys.append(y)
    min_x, max_x = min(all_xs), max(all_xs)
    min_y, max_y = min(all_ys), max(all_ys)
    span_y = max(1.0, max_y - min_y)
    # Map image Y-down → font Y-up into [DESCENDER, ASCENDER]
    target_h = ASCENDER - DESCENDER

    out: list[dict[str, Any]] = []
    for g in glyphs:
        ch = g.get("char") or "?"
        if ch == " " or not g.get("contours"):
            out.append(_empty_space(ch))
            continue

        rings_font: list[list[tuple[float, float]]] = []
        xs: list[float] = []
        ys: list[float] = []
        for ring in g["contours"]:
            mapped: list[tuple[float, float]] = []
            for x, y in ring:
                # Normalize Y relative to global ink box
                ny = (y - min_y) / span_y
                fy = ASCENDER - ny * target_h
                # X: keep relative within glyph, scale by same factor
                fx = ((x - min_x) / span_y) * target_h
                mapped.append((fx, fy))
                xs.append(fx)
                ys.append(fy)
            if len(mapped) >= 3:
                rings_font.append(mapped)

        if not rings_font:
            out.append(_empty_space(ch))
            continue

        g_min_x, g_max_x = min(xs), max(xs)
        g_min_y, g_max_y = min(ys), max(ys)
        # Shift glyph so its left is near 0 with small LSB
        lsb = 40.0
        shift = -g_min_x + lsb
        shifted = [[(x + shift, y) for x, y in ring] for ring in rings_font]
        g_max_x += shift
        rsb = 40.0
        advance = max(120.0, g_max_x + rsb)

        # Structural sanity: reject tiny / huge
        ink_w = g_max_x - lsb
        ink_h = g_max_y - g_min_y
        warnings: list[str] = []
        if ink_w < 20 or ink_h < 20:
            warnings.append("glyph_too_small")
        if ink_h > target_h * 1.2:
            warnings.append("glyph_too_tall")

        out.append(
            {
                "char": ch,
                "contours": shifted,
                "lsb": lsb,
                "rsb": rsb,
                "advance": advance,
                "ymin": g_min_y,
                "ymax": g_max_y,
                "warnings": warnings,
                "engine": g.get("engine"),
            }
        )
    return out


def _empty_space(ch: str) -> dict[str, Any]:
    adv = 280.0 if ch == " " else 200.0
    return {
        "char": ch,
        "contours": [],
        "lsb": 0.0,
        "rsb": 0.0,
        "advance": adv,
        "ymin": 0.0,
        "ymax": 0.0,
        "warnings": [],
        "engine": None,
    }
