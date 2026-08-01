"""Compatibility shim — prefer ``services.design.admin.schema``."""
from __future__ import annotations

import sys

from services.design.admin import schema as _impl

sys.modules[__name__] = _impl
