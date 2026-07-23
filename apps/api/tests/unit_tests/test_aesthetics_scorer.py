"""Unit tests for aesthetics scorer helpers (no torch required for cosine)."""

from __future__ import annotations

import pytest

np = pytest.importorskip("numpy")

from services.design.aesthetics.scorer import _blend, _bytes_to_vec, _cosine, _gaps


@pytest.mark.unit
def test_cosine_identical():
    v = np.ones(8, dtype=np.float32)
    blob = v.tobytes(order="C")
    a = _bytes_to_vec(blob)
    assert _cosine(a, a) == pytest.approx(1.0, abs=1e-5)


@pytest.mark.unit
def test_cosine_orthogonal():
    a = np.array([1, 0, 0, 0], dtype=np.float32)
    b = np.array([0, 1, 0, 0], dtype=np.float32)
    assert _cosine(a, b) == pytest.approx(0.0, abs=1e-5)


@pytest.mark.unit
def test_blend_weights():
    assert _blend(1.0, 0.0, 0.0) == pytest.approx(0.4)
    assert _blend(0.0, 1.0, 0.0) == pytest.approx(0.3)
    assert _blend(1.0, 1.0, 1.0) == pytest.approx(1.0)


@pytest.mark.unit
def test_gaps_when_below_threshold():
    gaps = _gaps(
        layout_sim=0.4,
        color_sim=0.9,
        aesthetic_sim=0.9,
        score=0.6,
        threshold=0.72,
        nearest={"id": 1, "name": "hero", "comment": "留白充足"},
    )
    assert any(g["kind"] == "layout" for g in gaps)
    assert "留白充足" in gaps[0]["hint"]
