"""Compatibility shim — prefer ``services.design.admin.admin_store``."""
from __future__ import annotations

import sys

from services.design.admin import admin_store as _impl

sys.modules[__name__] = _impl
