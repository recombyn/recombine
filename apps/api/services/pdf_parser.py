"""Extract text blocks with coordinates via pdfplumber."""

from pathlib import Path


def parse_pdf(file_path: Path) -> list[dict]:
    try:
        import pdfplumber
    except ImportError:
        return []

    blocks: list[dict] = []
    with pdfplumber.open(file_path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            for word in page.extract_words() or []:
                blocks.append(
                    {
                        "type": "text",
                        "page": page_index,
                        "text": word.get("text", ""),
                        "x": word.get("x0", 0),
                        "y": word.get("top", 0),
                        "width": word.get("x1", 0) - word.get("x0", 0),
                        "height": word.get("bottom", 0) - word.get("top", 0),
                        "font_size": word.get("height", 12),
                    }
                )
    return blocks
