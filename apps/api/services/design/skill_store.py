"""Compatibility shim — prefer ``services.design.prompts.skill_store``."""
from __future__ import annotations

import sys

from services.design.prompts import skill_store as _impl

sys.modules[__name__] = _impl
