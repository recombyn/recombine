"""Background removal (抠图) — free local rembg only.

Two cutout modes (meta.cutoutMode):
  - ``hair`` (default): portrait / fine-hair — alpha matting, gentle refine
  - ``product``: hard edges — no matting, morph + defringe cleanup

Models (first available wins, cached per name):
  hair → birefnet-portrait → birefnet-general → isnet → u2net
  product → birefnet-general → isnet → u2net
"""

from __future__ import annotations

import base64
import io
import logging
import threading
from typing import Any, Literal

import httpx

logger = logging.getLogger(__name__)

CutoutMode = Literal["hair", "product"]

_session_lock = threading.Lock()
_sessions: dict[str, Any] = {}

_HAIR_MODELS = (
    "birefnet-portrait",
    "birefnet_portrait",
    "birefnet-general",
    "birefnet_general",
    "isnet-general-use",
    "u2net",
)

_PRODUCT_MODELS = (
    "birefnet-general",
    "birefnet_general",
    "isnet-general-use",
    "u2net",
)


def parse_cutout_mode(meta: dict[str, Any] | None) -> CutoutMode:
    """Default hair/portrait; product when explicitly requested."""
    m = meta or {}
    raw = str(
        m.get("cutoutMode")
        or m.get("cutout_mode")
        or m.get("mode")
        or ""
    ).strip().lower()
    if raw in ("product", "hard", "hardedge", "hard-edge", "object", "goods"):
        return "product"
    if raw in ("hair", "portrait", "person", "people", "fine"):
        return "hair"
    # Legacy flags
    if m.get("hardEdge") is True or m.get("hard_edge") is True:
        return "product"
    if m.get("preserveHair") is False or m.get("preserve_hair") is False:
        return "product"
    return "hair"


async def _load_bytes(image_ref: str) -> bytes:
    ref = (image_ref or "").strip()
    if not ref:
        raise ValueError("image is required")
    if ref.startswith("data:"):
        try:
            _, b64 = ref.split(",", 1)
        except ValueError as exc:
            raise ValueError("invalid data URL") from exc
        return base64.b64decode(b64)
    if ref.startswith("http://") or ref.startswith("https://"):
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
            resp = await client.get(ref)
            if resp.status_code >= 400:
                raise ValueError(f"failed to download image ({resp.status_code})")
            return resp.content
    raise ValueError("image must be a data URL or https URL")


def _png_data_url_from_pil(img) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def rembg_available() -> bool:
    try:
        import rembg  # noqa: F401
        from PIL import Image  # noqa: F401

        return True
    except ImportError:
        return False


def get_rembg_session(mode: CutoutMode = "hair"):
    """Lazy rembg session; prefer portrait weights for hair mode."""
    candidates = _HAIR_MODELS if mode == "hair" else _PRODUCT_MODELS
    last_err: Exception | None = None
    from rembg import new_session

    for name in candidates:
        if name in _sessions:
            return _sessions[name], name
        with _session_lock:
            if name in _sessions:
                return _sessions[name], name
            try:
                sess = new_session(name)
                _sessions[name] = sess
                logger.info("rembg session ready: %s (mode=%s)", name, mode)
                return sess, name
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                continue

    # Absolute fallback
    fallback = "default"
    with _session_lock:
        if fallback not in _sessions:
            try:
                _sessions[fallback] = new_session()
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(f"rembg session init failed: {last_err or exc}") from exc
        return _sessions[fallback], fallback


def cutout_rgba_from_bytes(raw: bytes, mode: CutoutMode = "hair"):
    """Run rembg → PIL RGBA. Hair uses matting; product uses hard refine."""
    from rembg import remove
    from PIL import Image

    src = Image.open(io.BytesIO(raw))
    session, _ = get_rembg_session(mode)

    if mode == "hair":
        # Soft alpha for flyaway hair / translucent edges.
        try:
            out = remove(
                src,
                session=session,
                post_process_mask=True,
                alpha_matting=True,
                alpha_matting_foreground_threshold=270,
                alpha_matting_background_threshold=20,
                alpha_matting_erode_size=11,
            )
        except TypeError:
            try:
                out = remove(src, session=session, post_process_mask=True, alpha_matting=True)
            except TypeError:
                out = remove(src, session=session, post_process_mask=True)
        except Exception:
            # Matting can fail on some images; keep mask without matting.
            try:
                out = remove(src, session=session, post_process_mask=True)
            except Exception:
                out = remove(src, session=session)
    else:
        try:
            out = remove(src, session=session, post_process_mask=True)
        except TypeError:
            out = remove(src, session=session)
        except Exception:
            out = remove(src, session=session)

    if isinstance(out, (bytes, bytearray)):
        rgba = Image.open(io.BytesIO(out)).convert("RGBA")
    else:
        rgba = out.convert("RGBA")

    if mode == "product":
        return _refine_product_edges(rgba)
    return _refine_hair_edges(rgba)


def _refine_hair_edges(img):
    """Keep soft alpha strands; only light haze cleanup (no erode)."""
    import numpy as np
    from PIL import Image

    if img.mode != "RGBA":
        img = img.convert("RGBA")
    arr = np.asarray(img).copy()
    if arr.size == 0:
        return img

    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3].astype(np.float32)
    if float(alpha.max()) < 8:
        return img

    # Drop near-empty haze only — do not morph/erode (kills hair).
    alpha_out = np.where(alpha < 3, 0, alpha).astype(np.uint8)
    rgb = rgb.copy()
    rgb[alpha_out == 0] = 0
    return Image.fromarray(np.dstack([rgb, alpha_out]), mode="RGBA")


def _refine_product_edges(img):
    """
    Hard-edge cleanup for products / logos:
    morph close + slight erode + feather + defringe.
    """
    import cv2
    import numpy as np
    from PIL import Image

    if img.mode != "RGBA":
        img = img.convert("RGBA")
    arr = np.asarray(img).copy()
    if arr.size == 0:
        return img

    rgb = arr[:, :, :3].astype(np.float32)
    alpha = arr[:, :, 3].astype(np.uint8)
    if int(alpha.max()) < 8:
        return img

    side = max(arr.shape[0], arr.shape[1])
    k = 3 if side < 800 else (5 if side < 1600 else 7)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=1)
    erode_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    alpha = cv2.erode(alpha, erode_k, iterations=1)

    blur = 3 if side < 1200 else 5
    alpha_f = cv2.GaussianBlur(alpha.astype(np.float32), (blur, blur), 0)
    alpha_f = np.clip(alpha_f, 0, 255)

    solid = (alpha_f >= 250).astype(np.uint8)
    if solid.max() == 0:
        solid = (alpha_f >= 180).astype(np.uint8)

    if solid.max() > 0:
        seed = np.zeros_like(rgb)
        known = solid.astype(bool)
        seed[known] = rgb[known]
        grown = (solid * 255).astype(np.uint8)
        filled = seed.copy()
        dil_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        for _ in range(max(2, k)):
            grown_next = cv2.dilate(grown, dil_k, iterations=1)
            for c in range(3):
                ch = filled[:, :, c]
                ch_dil = cv2.dilate(ch, dil_k, iterations=1)
                newly = (grown_next > 0) & (grown == 0)
                ch[newly] = ch_dil[newly]
                filled[:, :, c] = ch
            grown = grown_next

        edge = (alpha_f > 1) & (alpha_f < 250)
        if edge.any():
            t = np.clip((250.0 - alpha_f) / 250.0, 0.0, 1.0)
            t = np.where(edge, np.minimum(t * 1.35, 1.0), 0.0)[..., None]
            rgb = rgb * (1.0 - t) + filled * t

    alpha_out = np.where(alpha_f < 4, 0, alpha_f).astype(np.uint8)
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    rgb[alpha_out == 0] = 0
    return Image.fromarray(np.dstack([rgb, alpha_out]), mode="RGBA")


def _cutout_plate(raw: bytes, *, tol: int = 28):
    """Knock out near-uniform plate color sampled from corners (no rembg/cv2)."""
    from PIL import Image

    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    px = img.load()
    w, h = img.size
    samples = [
        px[2, 2][:3],
        px[w - 3, 2][:3],
        px[2, h - 3][:3],
        px[w - 3, h - 3][:3],
    ]
    # Median-ish plate color from corners
    br = sorted(s[0] for s in samples)[1]
    bg = sorted(s[1] for s in samples)[1]
    bb = sorted(s[2] for s in samples)[1]
    out = img.copy()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = opx[x, y]
            if abs(r - br) <= tol and abs(g - bg) <= tol and abs(b - bb) <= tol:
                opx[x, y] = (r, g, b, 0)
    return out


def _cutout_grabcut(raw: bytes, mode: CutoutMode = "hair"):
    import cv2
    import numpy as np
    from PIL import Image

    arr = np.frombuffer(raw, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("could not decode image")
    h, w = bgr.shape[:2]
    margin_x = max(4, w // 12)
    margin_y = max(4, h // 12)
    rect = (margin_x, margin_y, max(1, w - 2 * margin_x), max(1, h - 2 * margin_y))
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    binary = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
    binary = cv2.GaussianBlur(binary, (5, 5), 0)
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = binary
    ys, xs = np.where(binary > 8)
    if len(xs) and len(ys):
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        rgba = rgba[y0:y1, x0:x1]
    pil = Image.fromarray(cv2.cvtColor(rgba, cv2.COLOR_BGRA2RGBA))
    if mode == "product":
        return _refine_product_edges(pil)
    return _refine_hair_edges(pil)


def _trim_transparent(img):
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    pad = 2
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(img.width, r + pad)
    b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


async def remove_background(
    image: str,
    *,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Cut out the main subject; return transparent PNG data URL.

    Returns ``{ image, kind, engine, model, mode, width, height }``.
    """
    mode = parse_cutout_mode(meta)
    raw = await _load_bytes(image)
    engine = "rembg"
    model_name = "u2net"

    try:
        if not rembg_available():
            raise ImportError("rembg not installed")
        _, model_name = get_rembg_session(mode)
        rgba = cutout_rgba_from_bytes(raw, mode=mode)
        engine = f"rembg/{model_name}"
    except Exception as rembg_exc:  # noqa: BLE001
        try:
            engine = "grabcut"
            model_name = "grabcut"
            rgba = _cutout_grabcut(raw, mode=mode)
            logger.warning("rembg unavailable (%s); used GrabCut", rembg_exc)
        except Exception as grab_exc:  # noqa: BLE001
            try:
                # Lightweight fallback (no rembg/cv2): knock out near-uniform plate
                # color from corners — enough for lettering / solid-bg cutouts.
                engine = "plate"
                model_name = "plate"
                rgba = _cutout_plate(raw)
                logger.warning(
                    "rembg/grabcut unavailable (rembg=%s; grabcut=%s); used plate cutout",
                    rembg_exc,
                    grab_exc,
                )
            except Exception as plate_exc:  # noqa: BLE001
                raise RuntimeError(
                    "去背景失败。请安装免费本地依赖: pip install -e '.[vision]' "
                    f"(rembg)。详情: rembg={rembg_exc}; grabcut={grab_exc}; "
                    f"plate={plate_exc}"
                ) from plate_exc

    rgba = _trim_transparent(rgba)
    return {
        "image": _png_data_url_from_pil(rgba),
        "kind": "removeBg",
        "engine": engine,
        "model": model_name,
        "mode": mode,
        "width": int(rgba.width),
        "height": int(rgba.height),
    }
