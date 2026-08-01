"""Compatibility shim — prefer ``services.design.prompts.knowledge_store``."""
from __future__ import annotations

import sys

from services.design.prompts import knowledge_store as _impl

sys.modules[__name__] = _impl
