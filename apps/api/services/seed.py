"""Seed fonts from apps/api/data/public|private; heal existing plaza rows."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from services.db import connect, init_schema
from services.plaza.cover import cover_json_dumps
from services.plaza.ensure_cover import ensure_cover_artboard

logger = logging.getLogger(__name__)

_OFFICIAL_USER_ID = "user_official"
# Same-origin static asset — Plaza feed cards need a real avatar URL.
_OFFICIAL_AVATAR = "/logo192.png"


def _resolve_seed_file(*parts: str) -> Path:
    from config.settings import resolve_data_file

    return resolve_data_file(*parts)


def seed_fonts() -> int:
    """Insert fonts from fonts_seed.json. Skip families that already exist in DB."""
    init_schema()
    path = _resolve_seed_file("fonts_seed.json")
    if not path.is_file():
        logger.warning("fonts seed skipped: missing %s", path)
        return 0

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        logger.warning("fonts seed failed to read %s: %s", path, err)
        return 0

    if not isinstance(raw, list):
        return 0

    from services import fonts_store

    inserted = 0
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        family = str(item.get("family") or "").strip()
        if not family:
            continue
        if fonts_store.get_font_by_family(family):
            continue
        display = str(item.get("displayName") or family).strip() or family
        children = item.get("children")
        if not isinstance(children, list):
            children = []
        fonts_store.upsert_font(
            family=family,
            display_name=display,
            children=children,
            sort_order=i,
        )
        inserted += 1
    return inserted


def heal_official_avatars() -> int:
    """Backfill avatar URL on official plaza rows that were seeded without one."""
    init_schema()
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE plaza_submissions
            SET author_avatar = ?
            WHERE user_id = ?
              AND (author_avatar IS NULL OR author_avatar = '')
            """,
            (_OFFICIAL_AVATAR, _OFFICIAL_USER_ID),
        )
        conn.commit()
        return int(getattr(cur, "rowcount", 0) or 0)


def heal_plaza_covers() -> int:
    """
    Backfill cover_json from artboards.
    Legacy official rows may still auto-inject a board when none exist;
    user posts keep their document (cover = active / first artboard).
    """
    init_schema()
    updated = 0
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, title, document_json, cover_json
            FROM plaza_submissions
            """
        ).fetchall()
        for row in rows:
            try:
                document = json.loads(row["document_json"])
            except (TypeError, json.JSONDecodeError):
                continue
            if not isinstance(document, dict):
                continue
            title = str(row["title"] or "")
            is_official = str(row["user_id"] or "") == _OFFICIAL_USER_ID
            # Only official demo cases may auto-inject 「封面」; user posts stay as-is.
            next_doc = (
                ensure_cover_artboard(document, title=title) if is_official else document
            )
            cover_raw = cover_json_dumps(next_doc)
            next_doc_raw = json.dumps(next_doc, ensure_ascii=False, separators=(",", ":"))
            try:
                prev_cover = row["cover_json"]
            except (KeyError, IndexError, TypeError):
                prev_cover = None
            if prev_cover == cover_raw and row["document_json"] == next_doc_raw:
                continue
            conn.execute(
                """
                UPDATE plaza_submissions
                SET document_json = ?, cover_json = ?
                WHERE id = ?
                """,
                (next_doc_raw, cover_raw, row["id"]),
            )
            updated += 1
        conn.commit()
    return updated


def run_seeds() -> dict[str, Any]:
    fonts = seed_fonts()
    avatars = heal_official_avatars()
    covers = heal_plaza_covers()
    return {
        "fonts": fonts,
        "avatarsHealed": avatars,
        "coversHealed": covers,
    }
