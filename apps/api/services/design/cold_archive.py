"""Compatibility shim — prefer ``services.design.admin.cold_archive``."""
from __future__ import annotations

import sys

from services.design.admin import cold_archive as _impl

sys.modules[__name__] = _impl
