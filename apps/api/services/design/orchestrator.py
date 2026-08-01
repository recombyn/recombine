"""Compatibility shim — prefer ``services.design.runtime.orchestrator``."""
from __future__ import annotations

import sys

from services.design.runtime import orchestrator as _impl

sys.modules[__name__] = _impl
