"""Compatibility shim — prefer ``services.design.runtime.scene_feedback``."""
from __future__ import annotations

import sys

from services.design.runtime import scene_feedback as _impl

sys.modules[__name__] = _impl
