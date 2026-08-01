"""Compatibility shim — prefer ``services.design.runtime.agent_controller``."""
from __future__ import annotations

import sys

from services.design.runtime import agent_controller as _impl

sys.modules[__name__] = _impl
