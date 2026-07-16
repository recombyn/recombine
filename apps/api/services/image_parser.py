"""Image parse entry — delegates to phase-2 vision stack."""

from pathlib import Path

from services.vision import analyze_page_images


def parse_image(file_path: Path) -> list[dict]:
    result = analyze_page_images([file_path])
    return result.get("blocks") or []
