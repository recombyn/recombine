"""Image views for CLIP three-tower encoding: layout / color / aesthetic."""

from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def _to_rgb(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        return bg
    if img.mode != "RGB":
        return img.convert("RGB")
    return img


def load_pil(data: bytes) -> Image.Image:
    img = Image.open(BytesIO(data))
    img.load()
    return _to_rgb(img)


def aesthetic_view(img: Image.Image, size: int = 224) -> Image.Image:
    """Full RGB render — overall aesthetic tower."""
    return ImageOps.fit(img, (size, size), method=Image.Resampling.LANCZOS)


def layout_view(img: Image.Image, size: int = 224) -> Image.Image:
    """
    Structure-focused view: grayscale + edges so CLIP sees layout, not palette.
    """
    g = ImageOps.grayscale(img)
    g = ImageOps.autocontrast(g)
    edges = g.filter(ImageFilter.FIND_EDGES)
    soft = g.filter(ImageFilter.SMOOTH_MORE)
    mixed = Image.blend(soft, edges, 0.55)
    mixed = ImageEnhance.Contrast(mixed).enhance(1.4)
    rgb = Image.merge("RGB", (mixed, mixed, mixed))
    return ImageOps.fit(rgb, (size, size), method=Image.Resampling.LANCZOS)


def color_view(img: Image.Image, size: int = 224, grid: int = 8) -> Image.Image:
    """
    Palette mosaic: downscale to grid then upscale — emphasizes color distribution.
    """
    small = img.resize((grid, grid), Image.Resampling.BOX)
    mosaic = small.resize((size, size), Image.Resampling.NEAREST)
    return mosaic
