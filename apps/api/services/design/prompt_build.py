"""Compatibility shim — prefer ``services.design.prompts.prompt_build``."""
from __future__ import annotations

import sys

from services.design.prompts import prompt_build as _impl

sys.modules[__name__] = _impl
