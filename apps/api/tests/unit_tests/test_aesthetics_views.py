"""Unit tests for aesthetics views (no torch required)."""

from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from services.design.aesthetics.views import (
    aesthetic_view,
    color_view,
    layout_view,
    load_pil,
)


def _png_bytes(color: tuple[int, int, int] = (40, 120, 200), size=(64, 48)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.unit
def test_load_pil_and_views_are_224_rgb():
    raw = _png_bytes()
    pil = load_pil(raw)
    assert pil.mode == "RGB"
    for fn in (aesthetic_view, layout_view, color_view):
        out = fn(pil, size=224)
        assert out.size == (224, 224)
        assert out.mode == "RGB"


@pytest.mark.unit
def test_layout_view_is_near_grayscale():
    pil = load_pil(_png_bytes((200, 40, 40)))
    lay = layout_view(pil, size=64)
    px = lay.getpixel((32, 32))
    assert abs(px[0] - px[1]) < 8 and abs(px[1] - px[2]) < 8


@pytest.mark.unit
def test_clip_status_without_extras():
    from services.design.aesthetics.clip_encoder import clip_status

    st = clip_status()
    assert "available" in st
    assert st["model"] == "openclip-vit-b-32"
    assert st["dim"] == 512
