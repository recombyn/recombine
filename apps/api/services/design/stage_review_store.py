"""Compatibility shim — prefer ``services.design.admin.stage_review_store``."""
from __future__ import annotations

import sys

from services.design.admin import stage_review_store as _impl

sys.modules[__name__] = _impl
