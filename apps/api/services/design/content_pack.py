"""Compatibility shim — prefer ``services.design.prompts.content_pack``."""
from __future__ import annotations

import sys

from services.design.prompts import content_pack as _impl

sys.modules[__name__] = _impl
