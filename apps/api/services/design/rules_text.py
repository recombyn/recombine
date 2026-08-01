"""Compatibility shim — prefer ``services.design.prompts.rules_text``."""
from __future__ import annotations

import sys

from services.design.prompts import rules_text as _impl

sys.modules[__name__] = _impl
