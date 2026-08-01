"""Cold-archive heavy design blobs (result_svg / chat thinking) into design_cold_blob."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from services.db import connect
from services.design.admin.blob_codec import pack_text_blob

logger = logging.getLogger(__name__)

KIND_TASK_SVG = "task_svg"
KIND_CHAT_THINKING = "chat_thinking"

DEFAULT_RETENTION_DAYS = 30
DEFAULT_BATCH = 80


def run_cold_archive(
    *,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    batch: int = DEFAULT_BATCH,
) -> dict[str, Any]:
    """Move old result_svg / long thinking into compress archive; clear hot columns."""
    days = max(1, int(retention_days or DEFAULT_RETENTION_DAYS))
    take = max(1, min(int(batch or DEFAULT_BATCH), 500))
    cutoff = time.time() - days * 86400
    out = {
        "ok": True,
        "cutoff": cutoff,
        "taskSvgArchived": 0,
        "thinkingArchived": 0,
        "errors": [],
    }
    try:
        out["taskSvgArchived"] = _archive_task_svgs(cutoff, take)
    except Exception as exc:
        logger.exception("archive task svg failed")
        out["errors"].append(f"task_svg:{exc}")
    try:
        out["thinkingArchived"] = _archive_chat_thinking(cutoff, take)
    except Exception as exc:
        logger.exception("archive chat thinking failed")
        out["errors"].append(f"chat_thinking:{exc}")
    if out["errors"]:
        out["ok"] = False
    return out


def _archive_task_svgs(cutoff: float, take: int) -> int:
    now = time.time()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, result_svg, created_at, status
            FROM design_task
            WHERE created_at < ?
              AND result_svg IS NOT NULL
              AND LENGTH(result_svg) > 200
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (cutoff, take),
        ).fetchall()
        n = 0
        for r in rows:
            tid = str(r["id"])
            svg = r["result_svg"] or ""
            if not str(svg).strip():
                continue
            blob = pack_text_blob(str(svg))
            meta = json.dumps(
                {
                    "status": r["status"],
                    "chars": len(str(svg)),
                },
                ensure_ascii=False,
            )
            conn.execute(
                """
                INSERT INTO design_cold_blob (
                    kind, ref_id, compress_blob, meta_json, source_created_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    KIND_TASK_SVG,
                    tid,
                    blob,
                    meta,
                    float(r["created_at"] or 0) or None,
                    now,
                ),
            )
            conn.execute(
                """
                UPDATE design_task
                SET result_svg=NULL, updated_at=?
                WHERE id=?
                """,
                (now, tid),
            )
            n += 1
        conn.commit()
    return n


def _archive_chat_thinking(cutoff: float, take: int) -> int:
    now = time.time()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, thinking, created_at
            FROM chat_messages
            WHERE created_at < ?
              AND thinking IS NOT NULL
              AND LENGTH(thinking) > 400
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (cutoff, take),
        ).fetchall()
        n = 0
        for r in rows:
            mid = str(r["id"])
            thinking = r["thinking"] or ""
            if not str(thinking).strip():
                continue
            blob = pack_text_blob(str(thinking))
            meta = json.dumps({"chars": len(str(thinking))}, ensure_ascii=False)
            conn.execute(
                """
                INSERT INTO design_cold_blob (
                    kind, ref_id, compress_blob, meta_json, source_created_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    KIND_CHAT_THINKING,
                    mid,
                    blob,
                    meta,
                    float(r["created_at"] or 0) or None,
                    now,
                ),
            )
            conn.execute(
                "UPDATE chat_messages SET thinking=NULL WHERE id=?",
                (mid,),
            )
            n += 1
        conn.commit()
    return n
