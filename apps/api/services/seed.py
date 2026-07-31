"""Seed fonts + official plaza cases from apps/api/data (not C-end mock)."""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any

from services.db import connect, init_schema
from services.plaza.cover import cover_json_dumps
from services.plaza.ensure_cover import ensure_cover_artboard

logger = logging.getLogger(__name__)

_CASE_TITLES_ZH: dict[str, str] = {
    "case-resume-fresh": "\u6e05\u723d\u7b80\u5386",
    "case-resume-classic": "\u7ecf\u5178\u4fa7\u680f\u7b80\u5386",
    "case-poster-event": "\u6d3b\u52a8\u6d77\u62a5",
    "case-poster-promo": "\u4fc3\u9500\u6d77\u62a5",
    "case-ui-dashboard": "\u540e\u53f0\u4eea\u8868\u76d8",
    "case-ui-mobile": "\u79fb\u52a8\u4efb\u52a1\u9875",
}

_OFFICIAL_USER_ID = "user_official"
_OFFICIAL_AUTHOR = "recombyn"
# Same-origin static asset — Plaza feed cards need a real avatar URL.
_OFFICIAL_AVATAR = "/logo192.png"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _web_public() -> Path:
    return _repo_root() / "apps" / "web" / "public"


def _api_data() -> Path:
    return Path(__file__).resolve().parents[1] / "data"


def _slug(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", (text or "").strip()).strip("_").lower()
    return (s or "font")[:48]


def seed_fonts() -> int:
    """Insert fonts from fonts_seed.json. Skip families that already exist in DB."""
    init_schema()
    path = _api_data() / "fonts_seed.json"
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


def _default_official_case_entries(data_dir: Path) -> list[dict[str, str]]:
    """Build index entries from known titles when index.json lists no cases."""
    out: list[dict[str, str]] = []
    for cid in _CASE_TITLES_ZH:
        stem = cid.removeprefix("case-")
        name = f"{stem}.json"
        if not (data_dir / name).is_file():
            continue
        if "poster" in stem:
            category = "poster"
        elif "mobile" in stem:
            category = "mobile"
        else:
            category = "website"
        out.append({"id": cid, "file": name, "category": category})
    return out


def seed_official_plaza_cases() -> int:
    """Seed approved plaza_submissions from api/data/official_cases. Skip existing ids."""
    init_schema()
    data_dir = _api_data() / "official_cases"
    index_path = data_dir / "index.json"
    cases: list[Any] = []
    if index_path.is_file():
        try:
            index = json.loads(index_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as err:
            logger.warning("plaza cases seed failed to read index: %s", err)
            index = None
        if isinstance(index, dict) and isinstance(index.get("cases"), list):
            cases = index["cases"]
    else:
        logger.warning("plaza cases seed: missing %s — using file fallback", index_path)

    if not cases:
        cases = _default_official_case_entries(data_dir)
        if cases:
            logger.warning(
                "plaza cases seed: index cases empty — seeding %s file(s) from titles map",
                len(cases),
            )
    if not cases:
        return 0

    now = time.time()
    inserted = 0
    with connect() as conn:
        for case in cases:
            if not isinstance(case, dict):
                continue
            cid = str(case.get("id") or "").strip()
            if not cid:
                continue
            existing = conn.execute(
                "SELECT id FROM plaza_submissions WHERE id = ?",
                (cid,),
            ).fetchone()
            if existing:
                continue

            file_rel = str(case.get("file") or "").strip()
            if not file_rel:
                continue
            name = Path(file_rel).name
            doc_path = data_dir / name
            if not doc_path.is_file():
                logger.warning("plaza case doc missing: %s", doc_path)
                continue
            try:
                document = json.loads(doc_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as err:
                logger.warning("plaza case doc invalid %s: %s", doc_path, err)
                continue
            if not isinstance(document, dict):
                continue

            title = _CASE_TITLES_ZH.get(cid) or str(case.get("nameKey") or cid)
            category = str(case.get("category") or "website").strip().lower() or "website"
            if category not in ("website", "mobile", "image", "poster", "video"):
                category = "website"
            document = ensure_cover_artboard(document, title=title)
            raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
            cover_raw = cover_json_dumps(document)

            conn.execute(
                """
                INSERT INTO plaza_submissions (
                    id, project_id, user_id, author_name, author_avatar,
                    title, category, document_json, cover_json, status,
                    created_at, updated_at, reviewed_at, reviewed_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)
                """,
                (
                    cid,
                    cid,
                    _OFFICIAL_USER_ID,
                    _OFFICIAL_AUTHOR,
                    _OFFICIAL_AVATAR,
                    title,
                    category,
                    raw,
                    cover_raw,
                    now,
                    now,
                    now,
                    _OFFICIAL_USER_ID,
                ),
            )
            inserted += 1
        conn.commit()
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
    Official seeds may still auto-inject a board when none exist;
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
    plaza = seed_official_plaza_cases()
    avatars = heal_official_avatars()
    covers = heal_plaza_covers()
    return {
        "fonts": fonts,
        "plaza": plaza,
        "avatarsHealed": avatars,
        "coversHealed": covers,
    }
