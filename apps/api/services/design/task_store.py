"""Compatibility shim — prefer ``services.design.admin.task_store``."""
from __future__ import annotations

import sys

from services.design.admin import task_store as _impl

sys.modules[__name__] = _impl
