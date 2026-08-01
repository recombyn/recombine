"""Bootstrap design catalog when DB is empty.

Prompts/rules are not shipped in the repo — Admin must configure them (or restore a DB dump).
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def seed_design_catalog_if_empty() -> None:
    """Legacy check — runtime skills are upserted by ``ensure_design_skills``."""
    from services.db import connect

    with connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM design_skill").fetchone()
        n = int(row["c"]) if row is not None else 0
    if n <= 0:
        logger.warning(
            "design_skill is empty before ensure_design_skills — "
            "will seed from design_skills_seed.json on catalog boot."
        )
