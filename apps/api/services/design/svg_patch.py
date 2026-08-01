"""Compatibility shim — prefer ``services.design.ops.svg_patch``."""
from __future__ import annotations

import sys

from services.design.ops import svg_patch as _impl

sys.modules[__name__] = _impl
