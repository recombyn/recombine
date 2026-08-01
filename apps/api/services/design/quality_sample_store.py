"""Compatibility shim — prefer ``services.design.admin.quality_sample_store``."""
from __future__ import annotations

import sys

from services.design.admin import quality_sample_store as _impl

sys.modules[__name__] = _impl
