"""PDF → page images via pdf2image + poppler."""

from pathlib import Path

from app.services.preprocess.poppler import resolve_poppler


def pdf_to_images(pdf_path: Path, out_dir: Path, dpi: int = 200, poppler_path: str | None = None) -> list[Path]:
    from pdf2image import convert_from_path

    out_dir.mkdir(parents=True, exist_ok=True)
    resolved = resolve_poppler(poppler_path)
    kwargs: dict = {
        "dpi": dpi,
        "fmt": "png",
        "paths_only": False,
    }
    if resolved:
        kwargs["poppler_path"] = resolved

    try:
        images = convert_from_path(str(pdf_path), **kwargs)
    except Exception as exc:  # noqa: BLE001
        hint = (
            "Poppler not found. Install Poppler and set POPPLER_PATH to the bin folder "
            r"(e.g. C:\Program Files\poppler\Library\bin), or add pdftoppm to PATH."
        )
        raise RuntimeError(f"{hint} Underlying error: {exc}") from exc

    paths: list[Path] = []
    for index, image in enumerate(images, start=1):
        dest = out_dir / f"{index:04d}.png"
        image.save(dest, "PNG")
        paths.append(dest)
    return paths
