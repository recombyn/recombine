"""Compatibility shim — prefer ``services.design.ops.action_registry``."""
from __future__ import annotations

import sys

from services.design.ops import action_registry as _impl

sys.modules[__name__] = _impl
