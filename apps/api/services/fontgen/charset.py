"""Default character sets for AI font generation."""

from __future__ import annotations

# Latin A–Z, a–z, 0–9 — matches current product scope.
DEFAULT_LATIN_CHARSET = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789"
)

# Space + basic punctuation for usable TTF installs.
DEFAULT_EXTRA_CHARS = " .,!?;:'\"-()[]{}"
