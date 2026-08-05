"""Resolve Poppler bin directory for pdf2image."""

from __future__ import annotations

import os
import shutil
from functools import lru_cache
from pathlib import Path


_WINDOWS_CANDIDATES = (
    r"C:\Program Files\poppler\Library\bin",
    r"C:\Program Files\poppler\bin",
    r"C:\poppler\Library\bin",
    r"C:\poppler\bin",
    r"C:\Program Files (x86)\poppler\Library\bin",
    r"C:\Program Files (x86)\poppler\bin",
)


def _dir_has_pdftoppm(path: Path) -> bool:
    if not path.is_dir():
        return False
    return (path / "pdftoppm.exe").is_file() or (path / "pdftoppm").is_file()


@lru_cache(maxsize=1)
def resolve_poppler(configured: str | None = None) -> str | None:
    """
    Return directory containing pdftoppm, or None.
    Prefer settings / POPPLER_PATH, then PATH, then common Windows installs.
    """
    candidates: list[str] = []
    if configured and configured.strip():
        candidates.append(configured.strip())
    env = os.environ.get("POPPLER_PATH")
    if env:
        candidates.append(env)

    which = shutil.which("pdftoppm") or shutil.which("pdftoppm.exe")
    if which:
        candidates.append(str(Path(which).resolve().parent))

    if os.name == "nt":
        candidates.extend(_WINDOWS_CANDIDATES)

    for raw in candidates:
        if not raw:
            continue
        p = Path(raw)
        if p.is_file():
            p = p.parent
        if _dir_has_pdftoppm(p):
            return str(p.resolve())
    return None
