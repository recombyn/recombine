"""Seed official library: styles / templates / brushes / prompt patterns."""

from __future__ import annotations

import json
import time
from typing import Any

from urllib.parse import quote

from services.db import connect


def _brush_cover(
    *,
    brush_id: str,
    size_factor: float = 1.0,
    thinning: float = 0.05,
    simulate_pressure: bool = False,
) -> str:
    """Distinct stroke preview per brush (width / opacity / taper / texture)."""
    sf = max(0.5, min(2.5, float(size_factor or 1.0)))
    th = max(0.0, min(0.95, float(thinning or 0.0)))
    base_w = max(2.5, min(24.0, 7.0 * sf))
    # Shared swoosh path
    d = "M36 148 C78 36 198 64 286 88"
    stroke = "#1A1A1A"
    opacity = 1.0
    linecap = "round"
    dash = ""
    layers: list[str] = []

    bid = (brush_id or "").strip().lower()
    if bid in ("watercolor",):
        opacity = 0.38
        layers.append(
            f'<path d="{d}" stroke="{stroke}" fill="none" stroke-width="{base_w * 1.55:.1f}" '
            f'stroke-linecap="round" opacity="0.18"/>'
        )
    elif bid in ("airbrush",):
        opacity = 0.22
        layers.append(
            f'<path d="{d}" stroke="{stroke}" fill="none" stroke-width="{base_w * 1.8:.1f}" '
            f'stroke-linecap="round" opacity="0.12"/>'
        )
        layers.append(
            f'<path d="{d}" stroke="{stroke}" fill="none" stroke-width="{base_w * 1.15:.1f}" '
            f'stroke-linecap="round" opacity="0.2"/>'
        )
    elif bid in ("chalk",):
        opacity = 0.75
        dash = ' stroke-dasharray="1.5 2.5"'
        linecap = "round"
    elif bid in ("marker",):
        linecap = "butt"
        opacity = 0.9
        base_w = max(base_w, 10.0)
    elif bid in ("pencil-hb", "pencil"):
        opacity = 0.65
        base_w = max(2.2, base_w * 0.85)
        dash = ' stroke-dasharray="0.8 1.6"'
    elif bid in ("soft",):
        opacity = 0.55
        layers.append(
            f'<path d="{d}" stroke="{stroke}" fill="none" stroke-width="{base_w * 1.35:.1f}" '
            f'stroke-linecap="round" opacity="0.22"/>'
        )
    elif bid in ("ink", "calligraphy", "fountain") or (simulate_pressure and th >= 0.45):
        # Tapered ribbon (pressure + thinning)
        # Approximate with filled polygon along the curve
        tip = max(1.2, base_w * (1.0 - th) * 0.35)
        mid = base_w
        # Simple filled taper: thick middle, thin ends via two overlapping strokes
        layers.append(
            f'<path d="{d}" stroke="{stroke}" fill="none" stroke-width="{mid:.1f}" '
            f'stroke-linecap="round" opacity="0.35"/>'
        )
        base_w = tip * 1.8 if bid == "fountain" else max(tip * 2.2, 3.5)
        opacity = 0.95
    elif bid in ("solid",):
        opacity = 1.0
        linecap = "round"

    layers.append(
        f'<path d="{d}" stroke="{stroke}" fill="none" stroke-width="{base_w:.1f}" '
        f'stroke-linecap="{linecap}" opacity="{opacity:.2f}"{dash}/>'
    )
    # Width legend bar so cards are obviously different
    legend_w = max(8, min(120, int(28 * sf)))
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'>"
        "<rect fill='#F7F7F5' width='320' height='200'/>"
        + "".join(layers)
        + f"<rect x='24' y='172' width='{legend_w}' height='8' rx='4' fill='#1A1A1A' opacity='0.35'/>"
        + "</svg>"
    )
    return "data:image/svg+xml," + quote(svg, safe="")


_COVER = {
    "flat": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect fill='%23E8F4FF' width='320' height='200'/%3E%3Crect x='40' y='40' width='100' height='70' rx='12' fill='%234F8CFF'/%3E%3C/svg%3E",
    "poster": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect fill='%23FF6B4A' width='320' height='200'/%3E%3Ctext x='40' y='110' fill='white' font-size='28'%3ESALE%3C/text%3E%3C/svg%3E",
    "illust": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect fill='%23FFF8F0' width='320' height='200'/%3E%3Ccircle cx='160' cy='90' r='48' fill='%23FFD6A5'/%3E%3C/svg%3E",
    "brush": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect fill='%23F7F7F5' width='320' height='200'/%3E%3Cpath d='M40 140 C80 40 200 70 290 90' stroke='%231A1A1A' fill='none' stroke-width='10' stroke-linecap='round'/%3E%3C/svg%3E",
    "prompt": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect fill='%23F0F4F8' width='320' height='200'/%3E%3Crect x='36' y='48' width='248' height='24' rx='6' fill='%23D0DCE8'/%3E%3C/svg%3E",
}

def _brush(brush_id, label, *, size_factor, simulate_pressure=False, thinning=0.05, smoothing=0.45, streamline=0.35, tags="", sort_order=100):
    return {
        "name": label,
        "kind": "brush",
        "scene": "image",
        "coverUrl": _brush_cover(
            brush_id=brush_id,
            size_factor=size_factor,
            thinning=thinning,
            simulate_pressure=simulate_pressure,
        ),
        "tags": tags or ("brush," + label),
        "description": "pencil brush: " + label,
        "enabled": True,
        "sortOrder": sort_order,
        "meta": {
            "brushId": brush_id,
            "label": label,
            "sizeFactor": size_factor,
            "simulatePressure": simulate_pressure,
            "kind": "freehand",
            "options": {"thinning": thinning, "smoothing": smoothing, "streamline": streamline},
        },
    }


def _prompt(name, scene, template, *, example, tags, sort_order=100):
    return {
        "name": name,
        "kind": "prompt",
        "scene": scene,
        "coverUrl": _COVER["prompt"],
        "tags": tags,
        "description": example,
        "enabled": True,
        "sortOrder": sort_order,
        "meta": {"template": template, "example": example, "scene": scene},
    }

def _seed_items():
    items = [
        {
            "name": "\u6241\u5e73 UI \u98ce\u683c\u5305",
            "kind": "style",
            "scene": "website",
            "coverUrl": _COVER["flat"],
            "tags": "flat,ui",
            "description": "Flat UI style pack for tools.",
            "enabled": True,
            "sortOrder": 10,
            "meta": {
                "palette": ["#4F8CFF", "#1A1A1A", "#F5F7FA"],
                "type": "Inter, system-ui",
                "radius": 12,
                "spacing": 8,
                "mood": "clean flat UI",
            },
        },
        {
            "name": "\u7535\u5546\u5927\u4fc3\u6d77\u62a5\u98ce",
            "kind": "style",
            "scene": "poster",
            "coverUrl": _COVER["poster"],
            "tags": "sale,poster",
            "description": "Warm promo poster style.",
            "enabled": True,
            "sortOrder": 20,
            "meta": {
                "palette": ["#FF6B4A", "#FFB347", "#FFFFFF"],
                "type": "Impact, sans-serif",
                "radius": 4,
                "spacing": 16,
                "ratio": "9:16",
                "mood": "warm promo",
            },
        },
        {
            "name": "\u624b\u7ed8\u63d2\u753b\u98ce\u683c\u5305",
            "kind": "style",
            "scene": "image",
            "coverUrl": _COVER["illust"],
            "tags": "illustration,flat",
            "description": "Hand-drawn sticker illustration style.",
            "enabled": True,
            "sortOrder": 30,
            "meta": {
                "stroke": 3,
                "palette": ["#FFD6A5", "#FDFFB6", "#CAFFBF"],
                "type": "rounded sans",
                "radius": 20,
                "spacing": 12,
                "mood": "hand-drawn sticker",
            },
        },
        {
            "name": "\u79fb\u52a8\u7aef\u767b\u5f55\u9875\u6a21\u677f",
            "kind": "template",
            "scene": "website",
            "coverUrl": _COVER["flat"],
            "tags": "login,390x844",
            "description": "Mobile login page skeleton.",
            "enabled": True,
            "sortOrder": 40,
            "meta": {"canvas": "390x844", "modules": ["logo", "title", "email", "password", "cta"]},
        },
        {
            "name": "\u7ad6\u7248\u6d3b\u52a8\u6d77\u62a5\u6a21\u677f",
            "kind": "template",
            "scene": "poster",
            "coverUrl": _COVER["poster"],
            "tags": "1080x1920,event",
            "description": "Hero / headline / CTA poster template.",
            "enabled": True,
            "sortOrder": 50,
            "meta": {"canvas": "1080x1920", "zones": ["hero", "headline", "cta"]},
        },
        {
            "name": "\u7ebf\u6027\u56fe\u6807\u5957\u4ef6",
            "kind": "icon",
            "scene": "website",
            "coverUrl": _COVER["flat"],
            "tags": "icon,24px",
            "description": "24px linear icon kit notes.",
            "enabled": True,
            "sortOrder": 60,
            "meta": {"grid": 24, "stroke": 1.5},
        },
    ]
    items.extend([
        _prompt(
            "\u6d77\u62a5\u63d0\u793a\u8bcd \u00b7 \u5927\u4fc3",
            "poster",
            "\u4e3a\u300c{{brand}}\u300d\u8bbe\u8ba1\u7ad6\u7248\u5927\u4fc3\u6d77\u62a5\u3002\u4e3b\u9898\uff1a{{theme}}\uff1b\u4e3b\u8272\uff1a{{color}}\uff1b\u5fc5\u987b\u5305\u542b\u4e3b\u6807\u9898\u3001\u526f\u6807\u9898\u3001\u4f18\u60e0\u4fe1\u606f\u3001\u5e95\u90e8 CTA\u3002\u9ad8\u5bf9\u6bd4\uff0c\u8f93\u51fa\u5b8c\u6574 SVG\u3002",
            example="\u4e3a\u300c\u67e0\u840c\u5e02\u96c6\u300d\u8bbe\u8ba1\u7ad6\u7248\u5927\u4fc3\u6d77\u62a5\u3002\u4e3b\u9898\uff1a\u590f\u65e5\u9c9c\u679c\u8282\uff1b\u4e3b\u8272\uff1a\u6a59\u7ea2\u3002",
            tags="prompt,poster",
            sort_order=70,
        ),
        _prompt(
            "\u63d2\u753b\u63d0\u793a\u8bcd \u00b7 \u8d34\u7eb8",
            "image",
            "\u753b\u4e00\u7ec4\u300c{{subject}}\u300d\u624b\u7ed8\u8d34\u7eb8\u63d2\u753b\uff0c\u98ce\u683c\uff1a{{style}}\uff0c\u80cc\u666f\u7559\u767d\uff0c\u7c97\u63cf\u8fb9\u3001\u4e0d\u8d85\u8fc7 5 \u8272\uff1b\u6b63\u65b9\u5f62\u753b\u5e03\uff0c\u8f93\u51fa SVG\u3002",
            example="\u753b\u4e00\u7ec4\u300c\u5c0f\u72d0\u72f8\u4e0a\u73ed\u300d\u624b\u7ed8\u8d34\u7eb8\u63d2\u753b\uff0c\u98ce\u683c\uff1a\u65e5\u7cfb\u53ef\u7231\u3002",
            tags="prompt,illustration",
            sort_order=80,
        ),
        _prompt(
            "\u7ed8\u753b\u63d0\u793a\u8bcd \u00b7 \u753b\u7b14",
            "image",
            "\u5728\u753b\u5e03\u4e0a\u624b\u7ed8\u300c{{subject}}\u300d\u3002\u5efa\u8bae\u7b14\u5237\uff1a{{brush}}\uff1b\u7ebf\u5bbd\u7ea6 {{width}}\uff1b\u5148\u8d77\u7a3f\u8f6e\u5ed3\uff0c\u518d\u8865\u7ec6\u8282\uff1b\u4ee5\u77e2\u91cf\u7b14\u89e6\u4e3a\u4e3b\u3002",
            example="\u5728\u753b\u5e03\u4e0a\u624b\u7ed8\u300c\u5496\u5561\u676f\u300d\u3002\u5efa\u8bae\u7b14\u5237\uff1a\u6bdb\u7b14\uff1b\u7ebf\u5bbd\u7ea6 4\u3002",
            tags="prompt,drawing,brush",
            sort_order=90,
        ),
        _prompt(
            "UI \u63d0\u793a\u8bcd \u00b7 \u5de5\u5177\u9875",
            "website",
            "\u8bbe\u8ba1\u300c{{product}}\u300d\u7684 {{page}} \u754c\u9762\uff08{{size}}\uff09\u3002\u4fe1\u606f\u5c42\u7ea7\u6e05\u6670\uff0c\u4e3b\u6309\u94ae\u7a81\u51fa\uff1b\u4e0d\u8981\u88c5\u9970\u6027\u63d2\u56fe\uff1b\u8f93\u51fa\u5b8c\u6574 SVG\u3002",
            example="\u8bbe\u8ba1\u300c\u7b80\u5386\u7f16\u8f91\u5668\u300d\u7684\u9996\u9875\u754c\u9762\uff081280x800\uff09\u3002",
            tags="prompt,ui",
            sort_order=100,
        ),
    ])
    items.extend([
        _brush("solid", "\u786c\u7b14", size_factor=1.0, tags="brush,solid", sort_order=200),
        _brush("calligraphy", "\u6bdb\u7b14", size_factor=1.35, simulate_pressure=True, thinning=0.72, smoothing=0.55, streamline=0.42, tags="brush,calligraphy", sort_order=210),
        _brush("marker", "\u9a6c\u514b\u7b14", size_factor=1.6, thinning=0.08, smoothing=0.35, streamline=0.25, tags="brush,marker", sort_order=220),
        _brush("soft", "\u8f6f\u7b14", size_factor=1.25, simulate_pressure=True, thinning=0.45, smoothing=0.7, streamline=0.65, tags="brush,soft", sort_order=230),
        _brush("fountain", "\u94a2\u7b14", size_factor=0.95, simulate_pressure=True, thinning=0.55, smoothing=0.5, streamline=0.4, tags="brush,fountain", sort_order=240),
        _brush("pencil-hb", "\u7d20\u63cf", size_factor=0.85, simulate_pressure=True, thinning=0.35, smoothing=0.4, streamline=0.3, tags="brush,pencil", sort_order=250),
        _brush("watercolor", "\u6c34\u5f69", size_factor=1.8, simulate_pressure=True, thinning=0.5, smoothing=0.78, streamline=0.7, tags="brush,watercolor", sort_order=260),
        _brush("ink", "\u58a8\u6c34", size_factor=1.2, simulate_pressure=True, thinning=0.68, smoothing=0.62, streamline=0.5, tags="brush,ink", sort_order=270),
        _brush("chalk", "\u7c89\u7b14", size_factor=1.45, simulate_pressure=True, thinning=0.22, smoothing=0.25, streamline=0.2, tags="brush,chalk", sort_order=280),
        _brush("airbrush", "\u55b7\u67aa", size_factor=2.0, simulate_pressure=True, thinning=0.3, smoothing=0.85, streamline=0.75, tags="brush,airbrush", sort_order=290),
    ])
    return items


def seed_library_if_empty() -> int:
    with connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM design_library_item").fetchone()
        if int((row or {}).get("c") or 0) > 0:
            return 0
        now = time.time()
        n = 0
        for item in _seed_items():
            meta = item.get("meta")
            meta_json = json.dumps(meta, ensure_ascii=False) if meta is not None else None
            conn.execute(
                "INSERT INTO design_library_item (name, kind, scene, cover_url, tags, description, enabled, sort_order, meta_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    item["name"], item["kind"], item["scene"], item.get("coverUrl") or "",
                    item.get("tags") or "", item.get("description") or "",
                    1 if item.get("enabled", True) else 0, int(item.get("sortOrder") or 0),
                    meta_json, now, now,
                ),
            )
            n += 1
        conn.commit()
        return n



def refresh_brush_covers() -> int:
    """Update existing brush rows so each preview reflects sizeFactor / thinning."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, meta_json FROM design_library_item WHERE kind = 'brush'"
        ).fetchall()
        n = 0
        now = time.time()
        for r in rows:
            try:
                meta = json.loads(r["meta_json"] or "{}")
            except Exception:
                meta = {}
            if not isinstance(meta, dict):
                meta = {}
            brush_id = str(meta.get("brushId") or "").strip()
            if not brush_id:
                continue
            opts = meta.get("options") if isinstance(meta.get("options"), dict) else {}
            cover = _brush_cover(
                brush_id=brush_id,
                size_factor=float(meta.get("sizeFactor") or 1),
                thinning=float(opts.get("thinning") or 0.05),
                simulate_pressure=bool(meta.get("simulatePressure")),
            )
            conn.execute(
                "UPDATE design_library_item SET cover_url = ?, updated_at = ? WHERE id = ?",
                (cover, now, int(r["id"])),
            )
            n += 1
        conn.commit()
        return n


_BRUSH_COVERS_READY = False


def ensure_library_seed() -> None:
    # Do not auto-insert demo library items (admin may clear the library).
    # Official demos: call seed_library_if_empty() explicitly if needed.
    # Brush cover refresh once per process — every /catalog call used to UPDATE all
    # brush rows on remote MySQL and time out the Vite proxy (HTTP 500).
    global _BRUSH_COVERS_READY
    if _BRUSH_COVERS_READY:
        return
    refresh_brush_covers()
    _BRUSH_COVERS_READY = True


def list_public_brushes() -> list[dict[str, Any]]:
    from services.design.readpath.catalog import ensure_design_catalog
    from services.design.readpath.library_store import _pub

    ensure_design_catalog()
    ensure_library_seed()
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM design_library_item WHERE kind = 'brush' AND enabled = 1 ORDER BY sort_order ASC, id ASC"
        ).fetchall()
    out = []
    for r in rows:
        item = _pub(r)
        meta = item.get("meta") or {}
        brush_id = str(meta.get("brushId") or "").strip()
        if not brush_id:
            continue
        out.append({
            "id": brush_id,
            "label": str(meta.get("label") or item["name"]),
            "sizeFactor": float(meta.get("sizeFactor") or 1),
            "simulatePressure": bool(meta.get("simulatePressure")),
            "kind": str(meta.get("kind") or "freehand"),
            "options": meta.get("options") if isinstance(meta.get("options"), dict) else {},
            "stampSrc": meta.get("stampSrc"),
            "spacingFactor": meta.get("spacingFactor"),
            "libraryId": item["id"],
        })
    return out
