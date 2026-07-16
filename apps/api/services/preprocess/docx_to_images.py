"""Word → PDF (LibreOffice) → page images."""

from pathlib import Path

from services.docx_converter import docx_to_pdf
from services.preprocess.pdf_to_images import pdf_to_images


def docx_to_images(docx_path: Path, out_dir: Path, dpi: int = 200, poppler_path: str | None = None) -> list[Path]:
    pdf_path = docx_to_pdf(docx_path)
    return pdf_to_images(pdf_path, out_dir, dpi=dpi, poppler_path=poppler_path)
