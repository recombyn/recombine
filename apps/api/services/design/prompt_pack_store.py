"""Compatibility shim — prefer ``services.design.prompts.prompt_pack_store``."""
from __future__ import annotations

import sys

from services.design.prompts import prompt_pack_store as _impl

sys.modules[__name__] = _impl
