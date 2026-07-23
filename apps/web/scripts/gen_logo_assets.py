from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public"


def _find_source() -> Path:
    candidates = [
        ROOT / "public" / "logo512.png",
        ROOT / "public" / "logo192.png",
    ]
    assets = ROOT.parents[1] / "assets"
    if assets.is_dir():
        candidates.extend(sorted(assets.glob("**/*799_32*.png"), reverse=True))
        candidates.extend(sorted(assets.glob("**/*logo*.png"), reverse=True))
    for p in candidates:
        if p.is_file():
            return p
    raise FileNotFoundError("No logo source image found")


def _remove_white_matte(im: Image.Image, threshold: int = 244) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            spread = max(r, g, b) - min(r, g, b)
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if r >= threshold and g >= threshold and b >= threshold:
                px[x, y] = (255, 255, 255, 0)
            elif lum >= 250 and spread < 14:
                px[x, y] = (255, 255, 255, 0)
            elif lum >= 238 and spread < 8 and a < 255:
                px[x, y] = (r, g, b, 0)
    return im


def _trim_alpha(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def _fit_on_square(mark: Image.Image, size: int, pad_ratio: float = 0.1) -> Image.Image:
    """Transparent mark scaled inside a square (for logo-mark.png)."""
    side = size
    inner = int(side * (1 - pad_ratio * 2))
    mw, mh = mark.size
    scale = min(inner / mw, inner / mh)
    nw, nh = max(1, int(mw * scale)), max(1, int(mh * scale))
    scaled = mark.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(scaled, ((side - nw) // 2, (side - nh) // 2), scaled)
    return canvas


def _on_white_square(mark: Image.Image, size: int, pad_ratio: float = 0.1) -> Image.Image:
    rgba = _fit_on_square(mark, size, pad_ratio)
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    canvas.paste(rgba, (0, 0), rgba)
    return canvas


def main() -> None:
    src = _find_source()
    OUT.mkdir(parents=True, exist_ok=True)

    base = Image.open(src).convert("RGBA")
    if base.mode != "RGBA":
        base = base.convert("RGBA")

    # If source is already a white tile, strip matte first.
    mark = _trim_alpha(_remove_white_matte(base))
    mark_hi = _fit_on_square(mark, 512, pad_ratio=0.1)
    mark_hi.save(OUT / "logo-mark.png")

    for name, size in [
        ("logo192.png", 192),
        ("logo512.png", 512),
        ("apple-touch-icon.png", 180),
        ("favicon-512.png", 512),
    ]:
        _on_white_square(mark, size).save(OUT / name)

    _on_white_square(mark, 64).save(
        OUT / "favicon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)],
    )

    buf = io.BytesIO()
    _on_white_square(mark, 512).save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        f'<image href="data:image/png;base64,{b64}" width="512" height="512"/>'
        "</svg>"
    )
    (OUT / "favicon.svg").write_text(svg, encoding="utf-8")
    print("generated logo assets from", src, "->", OUT)


if __name__ == "__main__":
    main()
