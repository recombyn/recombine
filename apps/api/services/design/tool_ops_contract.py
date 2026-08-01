"""Compatibility shim — prefer ``services.design.ops.tool_ops_contract``."""
from __future__ import annotations

import sys

from services.design.ops import tool_ops_contract as _impl

sys.modules[__name__] = _impl
