"""Compatibility shim — prefer ``services.design.runtime.pipeline_support``."""
from __future__ import annotations

import sys

from services.design.runtime import pipeline_support as _impl

sys.modules[__name__] = _impl
