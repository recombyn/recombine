"""Compatibility shim — prefer ``services.design.runtime.models_route``."""
from __future__ import annotations

import sys

from services.design.runtime import models_route as _impl

sys.modules[__name__] = _impl
