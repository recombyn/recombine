"""Compatibility shim — prefer ``services.design.ops.validate``."""
from __future__ import annotations

import sys

from services.design.ops import validate as _impl

sys.modules[__name__] = _impl
