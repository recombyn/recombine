"""Resolve LibreOffice executable across platforms."""

from __future__ import annotations

import os
import shutil
from functools import lru_cache
from pathlib import Path


_WINDOWS_CANDIDATES = (
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    r"C:\Program Files\LibreOffice\program\soffice.com",
)


@lru_cache(maxsize=1)
def resolve_libreoffice(configured: str | None = None) -> str | None:
    """
    Return absolute path to soffice, or None if not found.
    Prefer explicit config / env, then PATH, then common Windows install dirs.
    """
    candidates: list[str] = []
    if configured and configured.strip() and configured.strip() not in {"soffice", "soffice.exe"}:
        candidates.append(configured.strip())
    env = os.environ.get("LIBREOFFICE_PATH")
    if env:
        candidates.append(env)

    which = shutil.which("soffice") or shutil.which("soffice.exe")
    if which:
        candidates.append(which)

    if os.name == "nt":
        candidates.extend(_WINDOWS_CANDIDATES)

    candidates.append("soffice")

    for path in candidates:
        if not path:
            continue
        p = Path(path)
        if p.is_file():
            return str(p.resolve())
        # bare command still on PATH
        found = shutil.which(path)
        if found:
            return found
    return None
