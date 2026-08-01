"""Compatibility shim — prefer ``services.design.runtime.flow_runtime``."""
from __future__ import annotations

import sys

from services.design.runtime import flow_runtime as _impl

sys.modules[__name__] = _impl
