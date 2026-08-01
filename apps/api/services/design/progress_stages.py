"""Compatibility shim — prefer ``services.design.runtime.progress_stages``."""
from __future__ import annotations

import sys

from services.design.runtime import progress_stages as _impl

sys.modules[__name__] = _impl
