"""Compatibility shim — prefer ``services.design.ops.image_hydrate``."""
from __future__ import annotations

import sys

from services.design.ops import image_hydrate as _impl

sys.modules[__name__] = _impl
