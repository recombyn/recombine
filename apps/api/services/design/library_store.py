"""Compatibility shim — prefer ``services.design.readpath.library_store``."""
from __future__ import annotations

import sys

from services.design.readpath import library_store as _impl

sys.modules[__name__] = _impl
