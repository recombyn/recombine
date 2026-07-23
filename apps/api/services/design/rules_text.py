"""Shared rule / text helpers for the design agent."""
from __future__ import annotations

import logging
import time
from typing import Any

_log = logging.getLogger(__name__)

def _as_text(value: Any, default: str = "") -> str:
    """Coerce rule / request values to str before .strip() — DB/JSON may yield ints."""
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)

def _rule_text(rules: dict[str, Any] | None, key: str, default: str = "") -> str:
    rules = rules or {}
    if key not in rules or rules.get(key) is None:
        return default
    return _as_text(rules.get(key), default)

def _stage(t0: float, label: str, **extra: Any) -> None:
    """Always-visible stage timer for diagnosing design-run stalls."""
    bits = " ".join(f"{k}={v!r}" for k, v in extra.items())
    msg = f"[design_run] +{time.time() - t0:6.2f}s  {label}" + (f"  {bits}" if bits else "")
    _log.info(msg)
    print(msg, flush=True)

def _rule_flag_on(rules: dict[str, str], key: str, default: str = "1") -> bool:
    return str(rules.get(key, default)).strip().lower() not in ("0", "false", "off", "no")

