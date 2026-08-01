"""Compatibility shim — prefer ``services.design.admin.blob_codec``."""
from __future__ import annotations

import sys

from services.design.admin import blob_codec as _impl

sys.modules[__name__] = _impl
