"""Compatibility shim — prefer ``services.design.runtime.decision_log``."""
from __future__ import annotations

import sys

from services.design.runtime import decision_log as _impl

sys.modules[__name__] = _impl
