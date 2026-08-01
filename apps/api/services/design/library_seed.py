"""Compatibility shim — prefer ``services.design.readpath.library_seed``."""
from __future__ import annotations

import sys

from services.design.readpath import library_seed as _impl

sys.modules[__name__] = _impl
