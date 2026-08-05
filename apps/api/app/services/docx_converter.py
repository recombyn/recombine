"""Convert DOCX to PDF using LibreOffice; text-only fallback via python-docx."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from app.core.config import settings
from app.services.libreoffice import resolve_libreoffice


def docx_to_pdf(docx_path: Path) -> Path:
    soffice = resolve_libreoffice(settings.libreoffice_path)
    if not soffice:
        raise FileNotFoundError(
            "LibreOffice not found. Install LibreOffice and set LIBREOFFICE_PATH "
            r'(e.g. C:\Program Files\LibreOffice\program\soffice.exe), '
            "or rely on text-only fallback."
        )

    out_dir = Path(tempfile.mkdtemp())
    cmd = [
        soffice,
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        str(out_dir),
        str(docx_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"LibreOffice convert failed ({proc.returncode}): {err}")

    pdf_path = out_dir / f"{docx_path.stem}.pdf"
    if not pdf_path.exists():
        # LO sometimes lowercases / renames — pick any pdf in out_dir
        pdfs = list(out_dir.glob("*.pdf"))
        if not pdfs:
            raise FileNotFoundError(f"LibreOffice did not produce PDF for {docx_path}")
        pdf_path = pdfs[0]
    return pdf_path


def docx_to_text_blocks(docx_path: Path) -> list[dict]:
    """Layout-free paragraph extraction when LibreOffice is unavailable."""
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError("python-docx is required for DOCX text fallback") from exc

    doc = Document(str(docx_path))
    blocks: list[dict] = []
    y = 40.0
    line_h = 22.0
    for para in doc.paragraphs:
        text = (para.text or "").strip()
        if not text:
            y += line_h * 0.5
            continue
        font_size = 14.0
        try:
            runs = para.runs
            if runs and runs[0].font and runs[0].font.size:
                font_size = max(10.0, float(runs[0].font.size.pt))
        except Exception:
            pass
        blocks.append(
            {
                "type": "text",
                "page": 0,
                "text": text,
                "x": 40,
                "y": y,
                "width": 714,
                "height": max(line_h, font_size * 1.4),
                "font_size": font_size,
                "source": "python-docx",
            }
        )
        y += max(line_h, font_size * 1.6)
    return blocks
