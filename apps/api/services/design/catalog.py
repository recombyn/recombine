"""Compatibility shim — prefer ``services.design.readpath.catalog``."""
from __future__ import annotations

import sys

from services.design.readpath import catalog as _impl

sys.modules[__name__] = _impl
