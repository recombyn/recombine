from __future__ import annotations

from pathlib import Path
from typing import Any

from config.settings import settings


def available() -> bool:
    try:
        import simple_lama_inpainting  # type: ignore  # noqa: F401

        return True
    except ImportError:
        try:
            import lama_cleaner  # type: ignore  # noqa: F401

            return True
        except ImportError:
            return False


def _build_mask_from_regions(image_shape: tuple[int, int], regions: list[dict]) -> Any | None:
    try:
        import numpy as np
    except ImportError:
        return None
    h, w = image_shape
    mask = np.zeros((h, w), dtype=np.uint8)
    for region in regions or []:
        x = int(max(0, region.get("x") or 0))
        y = int(max(0, region.get("y") or 0))
        bw = int(max(1, region.get("width") or 1))
        bh = int(max(1, region.get("height") or 1))
        mask[y : min(h, y + bh), x : min(w, x + bw)] = 255
    if mask.max() == 0:
        return None
    return mask


def inpaint(
    image_path: Path,
    mask_path: Path | None = None,
    out_path: Path | None = None,
    regions: list[dict] | None = None,
) -> Path | None:
    """
    Inpaint using mask file or SAM region boxes.
    Returns output path or None when unavailable / no mask.
    """
    if not available():
        return None

    try:
        import cv2
        import numpy as np
    except ImportError:
        return None

    image = cv2.imread(str(image_path))
    if image is None:
        return None

    mask = None
    if mask_path and Path(mask_path).is_file():
        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    elif regions:
        mask = _build_mask_from_regions(image.shape[:2], regions)

    if mask is None:
        return None

    dest = out_path or image_path.with_name(f"{image_path.stem}_inpainted{image_path.suffix}")

    # Prefer simple-lama-inpainting
    try:
        from simple_lama_inpainting import SimpleLama
        from PIL import Image

        lama = SimpleLama()
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        result = lama(Image.fromarray(rgb), Image.fromarray(mask))
        out_bgr = cv2.cvtColor(np.array(result), cv2.COLOR_RGB2BGR)
        cv2.imwrite(str(dest), out_bgr)
        return dest
    except Exception:
        pass

    # OpenCV Telea fallback (no external LaMa weights)
    try:
        out_bgr = cv2.inpaint(image, mask, 3, cv2.INPAINT_TELEA)
        cv2.imwrite(str(dest), out_bgr)
        return dest
    except Exception:
        return None
