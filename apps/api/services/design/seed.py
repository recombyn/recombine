"""Compatibility shim — prefer ``services.design.readpath.seed``."""
from __future__ import annotations

import sys

from services.design.readpath import seed as _impl

sys.modules[__name__] = _impl
