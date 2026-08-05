"""Unit tests for SVG raster + threshold percentile helpers."""

from __future__ import annotations

import pytest

from app.services.design.aesthetics.calibrate import _percentile
from app.services.design.aesthetics.svg_raster import svg_to_png_bytes


@pytest.mark.unit
def test_percentile_basic():
    vals = [0.1, 0.2, 0.3, 0.4, 0.5]
    assert _percentile(vals, 0) == pytest.approx(0.1)
    assert _percentile(vals, 100) == pytest.approx(0.5)
    assert _percentile(vals, 50) == pytest.approx(0.3)


@pytest.mark.unit
def test_svg_to_png_bytes_rect():
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">'
        '<rect x="10" y="10" width="80" height="40" fill="#3366ff"/>'
        '<text x="20" y="70" fill="#111" font-size="16">Hello</text>'
        "</svg>"
    )
    png = svg_to_png_bytes(svg, max_edge=128)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(png) > 50
