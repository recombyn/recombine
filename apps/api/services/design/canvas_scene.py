"""Compatibility shim — prefer ``services.design.readpath.canvas_scene``."""
from __future__ import annotations

import sys

from services.design.readpath import canvas_scene as _impl

sys.modules[__name__] = _impl
