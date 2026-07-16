"""Import pipeline: preprocess → vision (phase 2) → Scene JSON, with PDF fallback."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Literal

from config.settings import settings
from scene_builder.models import empty_document
from services.design_extract import design_file_to_images
from services.docx_converter import docx_to_pdf, docx_to_text_blocks
from services.pdf_parser import parse_pdf
from services.preprocess import pdf_to_images
from services.raster_fallback import page_images_as_blocks
from services.scene_builder import build_scene_response
from services.storage import upload_page_images
from services.vision import analyze_page_images
from services.vision.merge_blocks import merge_text_blocks

SourceType = Literal["pdf", "docx", "image", "design"]


def _job_pages_dir(job_id: str | None) -> Path:
    base = Path(settings.result_dir)
    if job_id:
        return base / job_id / "pages"
    return base / "_sync" / "pages"


def _rel_page_paths(paths: list[Path]) -> list[str]:
    root = Path(settings.result_dir).resolve()
    rel: list[str] = []
    for path in paths:
        try:
            rel.append(str(path.resolve().relative_to(root)).replace("\\", "/"))
        except ValueError:
            rel.append(str(path).replace("\\", "/"))
    return rel


def _prepare_page_images(source_type: SourceType, file_path: Path, job_id: str | None) -> tuple[list[Path], Path | None]:
    """Return (page_image_paths, pdf_path_for_text_parse)."""
    pages_dir = _job_pages_dir(job_id)
    if pages_dir.exists():
        shutil.rmtree(pages_dir, ignore_errors=True)
    pages_dir.mkdir(parents=True, exist_ok=True)

    poppler = settings.poppler_path or None
    dpi = settings.import_dpi

    if source_type == "pdf":
        images = pdf_to_images(file_path, pages_dir, dpi=dpi, poppler_path=poppler)
        return images, file_path

    if source_type == "docx":
        pdf_path = docx_to_pdf(file_path)
        images = pdf_to_images(pdf_path, pages_dir, dpi=dpi, poppler_path=poppler)
        return images, pdf_path

    if source_type == "design":
        images = design_file_to_images(file_path, pages_dir)
        return images, None

    suffix = file_path.suffix.lower() or ".png"
    dest = pages_dir / f"0001{suffix}"
    shutil.copy2(file_path, dest)
    return [dest], None


def run_import(source_type: SourceType, file_path: Path, job_id: str | None = None) -> dict:
    warnings: list[str] = []
    page_images: list[Path] = []
    pdf_for_parse: Path | None = None
    engines: list[str] = []
    palette: list[str] = []
    width = settings.scene_target_width
    height = 1123

    try:
        page_images, pdf_for_parse = _prepare_page_images(source_type, file_path, job_id)
    except Exception as exc:  # noqa: BLE001
        warnings.append(f"preprocess failed: {exc}")
        if source_type == "docx":
            try:
                pdf_for_parse = docx_to_pdf(file_path)
            except Exception as docx_exc:  # noqa: BLE001
                warnings.append(f"docx→pdf failed: {docx_exc}")
        elif source_type == "pdf":
            pdf_for_parse = file_path

    blocks: list[dict] = []

    # Phase 2: prefer vision on page rasters
    if settings.use_vision and page_images:
        vision = analyze_page_images(page_images)
        warnings.extend(vision.get("warnings") or [])
        engines.extend(vision.get("engines") or [])
        palette = vision.get("palette") or []
        width = int(vision.get("width") or width)
        height = int(vision.get("height") or height)
        blocks = vision.get("blocks") or []

    # Fallback: digital PDF text layer
    if not blocks and source_type in ("pdf", "docx"):
        target = pdf_for_parse or (file_path if source_type == "pdf" else None)
        if target is not None:
            try:
                blocks = parse_pdf(target)
                if blocks:
                    blocks = merge_text_blocks(blocks)
                    engines.append("pdfplumber")
                    engines.append("merge")
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"pdf parse failed: {exc}")

    # DOCX last resort: paragraph text without layout fidelity
    if not blocks and source_type == "docx":
        try:
            blocks = docx_to_text_blocks(file_path)
            if blocks:
                engines.append("python-docx")
                warnings.append("LibreOffice unavailable; used text-only DOCX fallback (layout approximate)")
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"docx text fallback failed: {exc}")

    # Always keep something editable when we have page rasters (image / PDF without OCR)
    if not blocks and page_images:
        blocks, width, height = page_images_as_blocks(page_images, target_w=settings.scene_target_width)
        if blocks:
            engines.append("raster-fallback")
            warnings.append(
                "OCR produced no text layers; imported page image(s) as canvas images. "
                "Install OCR extras for editable text: pip install -e '.[ocr]'"
            )

    if not blocks:
        warnings.append("No blocks extracted; returned empty document")

    document = (
        build_scene_response(blocks, width=width, height=height) if blocks else empty_document(width, height)
    )
    page_count = max(len(page_images), 1)

    page_rels, object_keys, object_urls = ([], [], [])
    if page_images:
        try:
            page_rels, object_keys, object_urls = upload_page_images(job_id, page_images)
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"storage upload failed: {exc}")
            page_rels = _rel_page_paths(page_images)

    return {
        "job_id": job_id,
        "status": "done",
        "document": document,
        "meta": {
            "source_type": source_type,
            "page_count": page_count,
            "page_images": page_rels or _rel_page_paths(page_images),
            "object_keys": object_keys,
            "object_urls": object_urls,
            "palette": palette,
            "engines": engines,
            "warnings": warnings,
        },
    }
