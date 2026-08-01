"""Compatibility shim — prefer ``services.design.runtime.llm_step``."""
from __future__ import annotations

import sys

from services.design.runtime import llm_step as _impl

sys.modules[__name__] = _impl
