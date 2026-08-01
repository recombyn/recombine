"""Compatibility shim — prefer ``services.design.prompts.system_prompt_store``."""
from __future__ import annotations

import sys

from services.design.prompts import system_prompt_store as _impl

sys.modules[__name__] = _impl
