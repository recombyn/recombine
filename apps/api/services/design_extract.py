"""Extract page/preview rasters from design-tool files (PSD, XD, Axure, Figma).

Layer-accurate vector import is out of scope for phase 1: we rasterize (or pull
embedded previews) and reuse the existing vision / raster-fallback pipeline.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
_MAX_PAGES = 24

# Prefer filenames that look like artboard / page previews.
_PREVIEW_NAME = re.compile(
    r"(preview|thumbnail|rendition|artboard|screenshot|cover|page[-_]?\d*)",
    re.IGNORECASE,
)


def design_file_to_images(file_path: Path, out_dir: Path) -> list[Path]:
    """Write one or more page images under out_dir; return ordered paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = file_path.suffix.lower()

    if suffix == ".psd":
        return _psd_to_images(file_path, out_dir)
    if suffix in (".xd", ".rp"):
        return _zip_package_to_images(file_path, out_dir, label=suffix.lstrip("."))
    if suffix == ".fig":
        return _fig_to_images(file_path, out_dir)

    raise ValueError(
        f"Unsupported design format '{suffix}'. "
        "Supported: .psd (Photoshop), .xd (Adobe XD), .rp (Axure), .fig (legacy zip)."
    )


def _psd_to_images(file_path: Path, out_dir: Path) -> list[Path]:
    try:
        from psd_tools import PSDImage
    except ImportError as exc:
        raise RuntimeError(
            "Photoshop (.psd) import requires optional deps: "
            "pip install -e '.[design]' (psd-tools, Pillow)"
        ) from exc

    psd = PSDImage.open(file_path)
    composite = psd.composite()
    if composite is None:
        raise ValueError("Could not composite PSD layers into a preview image")

    dest = out_dir / "0001.png"
    composite.convert("RGBA").save(dest)
    return [dest]


def _fig_to_images(file_path: Path, out_dir: Path) -> list[Path]:
    # Older / some exports are zip packages with embedded bitmaps.
    if zipfile.is_zipfile(file_path):
        return _zip_package_to_images(file_path, out_dir, label="fig")

    raise ValueError(
        "Modern Figma .fig files are a proprietary binary format and cannot be "
        "parsed locally yet. Export the frame as PDF or PNG from Figma "
        "(File → Export), then import that file instead."
    )


def _zip_package_to_images(file_path: Path, out_dir: Path, label: str) -> list[Path]:
    if not zipfile.is_zipfile(file_path):
        raise ValueError(f"{label.upper()} file is not a valid zip package: {file_path.name}")

    preferred_roots = (
        "preview.png",
        "preview.jpg",
        "preview.jpeg",
        "thumbnail.png",
        "resources/graphics/preview.png",
        "resources/preview.png",
        "meta/preview.png",
    )

    with zipfile.ZipFile(file_path) as zf:
        names = [n for n in zf.namelist() if not n.endswith("/") and not n.startswith("__MACOSX")]
        by_lower = {n.lower().replace("\\", "/"): n for n in names}

        chosen: list[str] = []
        for root in preferred_roots:
            hit = by_lower.get(root)
            if hit:
                chosen.append(hit)

        if not chosen:
            images = [
                n
                for n in names
                if Path(n).suffix.lower() in _IMAGE_EXTS and _looks_like_useful_image(n)
            ]
            images.sort(key=_image_sort_key)
            chosen = images[:_MAX_PAGES]

        if not chosen:
            raise ValueError(
                f"No preview images found inside {label.upper()} package. "
                "Try exporting PDF/PNG from the design tool, then import that file."
            )

        out: list[Path] = []
        for i, member in enumerate(chosen[:_MAX_PAGES], start=1):
            ext = Path(member).suffix.lower() or ".png"
            if ext not in _IMAGE_EXTS:
                ext = ".png"
            dest = out_dir / f"{i:04d}{ext}"
            with zf.open(member) as src, dest.open("wb") as dst:
                dst.write(src.read())
            out.append(dest)
        return out


def _looks_like_useful_image(name: str) -> bool:
    lower = name.lower().replace("\\", "/")
    # Skip tiny icons / UI chrome often packed in Axure/XD.
    if any(part in lower for part in ("/icon", "/icons/", "favicon", "sprite", "cursor")):
        return False
    if "/node_modules/" in lower:
        return False
    return True


def _image_sort_key(name: str) -> tuple[int, int, str]:
    lower = name.lower().replace("\\", "/")
    # Higher priority (lower rank) for preview-like names and shallow paths.
    rank = 0 if _PREVIEW_NAME.search(Path(lower).name) else 1
    depth = lower.count("/")
    return (rank, depth, lower)
