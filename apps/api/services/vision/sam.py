"""Lightweight SAM hook — optional MobileSAM / segment_anything + checkpoint."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from config.settings import settings


def available() -> bool:
    try:
        import mobile_sam  # type: ignore  # noqa: F401

        return True
    except ImportError:
        try:
            import segment_anything  # type: ignore  # noqa: F401

            return True
        except ImportError:
            return False


def _checkpoint() -> Path | None:
    raw = settings.sam_checkpoint
    if not raw:
        return None
    path = Path(raw)
    return path if path.is_file() else None


def segment_regions(image_path: Path) -> list[dict[str, Any]]:
    """
    Return top mask proposals as axis-aligned boxes when SAM + checkpoint are ready.
    Each item: {x,y,width,height,score,area}
    """
    ckpt = _checkpoint()
    if not available() or ckpt is None:
        return []

    try:
        import cv2
        import numpy as np
        import torch
    except ImportError:
        return []

    image = cv2.imread(str(image_path))
    if image is None:
        return []
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    generator = None
    try:
        from mobile_sam import SamAutomaticMaskGenerator, sam_model_registry

        model_type = settings.sam_model_type or "vit_t"
        sam = sam_model_registry[model_type](checkpoint=str(ckpt))
        device = "cuda" if torch.cuda.is_available() else "cpu"
        sam.to(device=device)
        generator = SamAutomaticMaskGenerator(sam)
    except Exception:
        try:
            from segment_anything import SamAutomaticMaskGenerator, sam_model_registry

            model_type = settings.sam_model_type or "vit_b"
            sam = sam_model_registry[model_type](checkpoint=str(ckpt))
            device = "cuda" if torch.cuda.is_available() else "cpu"
            sam.to(device=device)
            generator = SamAutomaticMaskGenerator(sam)
        except Exception:
            return []

    try:
        masks = generator.generate(image_rgb)
    except Exception:
        return []

    h, w = image.shape[:2]
    min_area = max(256, int(h * w * settings.sam_min_area_ratio))
    regions: list[dict[str, Any]] = []
    for mask in masks or []:
        area = float(mask.get("area") or 0)
        if area < min_area:
            continue
        bbox = mask.get("bbox")  # XYWH
        if not bbox or len(bbox) < 4:
            continue
        x, y, bw, bh = map(float, bbox[:4])
        regions.append(
            {
                "x": x,
                "y": y,
                "width": bw,
                "height": bh,
                "score": float(mask.get("predicted_iou") or mask.get("stability_score") or 0),
                "area": area,
            }
        )

    regions.sort(key=lambda r: r["area"], reverse=True)
    return regions[: settings.sam_max_regions]
