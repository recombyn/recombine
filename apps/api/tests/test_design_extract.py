"""Tests for design-file preview extraction (zip packages)."""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from services.design_extract import design_file_to_images


def _png_bytes() -> bytes:
    # Minimal 1x1 PNG
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def _write_zip(path: Path, members: dict[str, bytes]) -> None:
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in members.items():
            zf.writestr(name, data)


def test_xd_prefers_preview_png(tmp_path: Path) -> None:
    pkg = tmp_path / "board.xd"
    _write_zip(
        pkg,
        {
            "resources/icons/icon.png": _png_bytes(),
            "preview.png": _png_bytes(),
        },
    )
    out = tmp_path / "pages"
    images = design_file_to_images(pkg, out)
    assert len(images) == 1
    assert images[0].name.startswith("0001")
    assert images[0].read_bytes() == _png_bytes()


def test_axure_rp_collects_images(tmp_path: Path) -> None:
    pkg = tmp_path / "proto.rp"
    _write_zip(
        pkg,
        {
            "images/page1.png": _png_bytes(),
            "images/page2.jpg": _png_bytes(),
            "images/icons/favicon.png": _png_bytes(),
        },
    )
    images = design_file_to_images(pkg, tmp_path / "pages")
    assert len(images) >= 1
    assert all(p.exists() for p in images)


def test_modern_fig_rejected(tmp_path: Path) -> None:
    fig = tmp_path / "file.fig"
    fig.write_bytes(b"fig-kiwi-not-a-zip")
    with pytest.raises(ValueError, match="Figma"):
        design_file_to_images(fig, tmp_path / "pages")
