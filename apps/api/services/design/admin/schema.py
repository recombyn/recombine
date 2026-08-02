"""Design skill schema — skill / group / flow / task / layer_lock / global_rule."""

from __future__ import annotations

from typing import Any


def ensure_design_tables(conn: Any, *, mysql: bool) -> None:
    """Idempotent create for design-skill tables."""
    pk = "BIGINT PRIMARY KEY AUTO_INCREMENT" if mysql else "INTEGER PRIMARY KEY AUTOINCREMENT"
    text = "LONGTEXT" if mysql else "TEXT"
    blob = "LONGBLOB" if mysql else "BLOB"
    engine = " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" if mysql else ""

    statements = [
        f"""
        CREATE TABLE IF NOT EXISTS design_skill (
            id {pk},
            name VARCHAR(128) NOT NULL,
            skill_key VARCHAR(64) NULL,
            category VARCHAR(32) NOT NULL,
            prompt_positive {text} NOT NULL,
            prompt_negative {text},
            when_to_use {text},
            preferred_tools {text},
            allowed_resources {text},
            triggers {text},
            mutex_group VARCHAR(64) NULL,
            version INTEGER NOT NULL DEFAULT 1,
            pack_version VARCHAR(32) NULL,
            description {text},
            logo {text},
            locales {text},
            source VARCHAR(16) NOT NULL DEFAULT 'admin',
            namespace VARCHAR(16) NOT NULL DEFAULT 'user',
            owner_user_id VARCHAR(64) NULL,
            input_schema {text},
            output_schema {text},
            sort_weight INTEGER NOT NULL DEFAULT 0,
            scenes VARCHAR(128) NOT NULL DEFAULT 'all',
            default_model VARCHAR(32) NOT NULL DEFAULT 'doubao',
            max_retries INTEGER NOT NULL DEFAULT 2,
            enabled INTEGER NOT NULL DEFAULT 1,
            output_format VARCHAR(64) NOT NULL DEFAULT 'json',
            allow_user_model_override INTEGER NOT NULL DEFAULT 0,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_skill_revision (
            id {pk},
            skill_id BIGINT NOT NULL,
            skill_key VARCHAR(64) NOT NULL,
            namespace VARCHAR(16) NOT NULL DEFAULT 'user',
            version INTEGER NOT NULL,
            pack_version VARCHAR(32) NULL,
            snapshot {text} NOT NULL,
            source VARCHAR(16) NOT NULL DEFAULT 'admin',
            created_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_user_skill_pref (
            id {pk},
            user_id VARCHAR(64) NOT NULL,
            skill_key VARCHAR(64) NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            updated_at DOUBLE NOT NULL,
            UNIQUE(user_id, skill_key)
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_skill_group (
            id {pk},
            name VARCHAR(128) NOT NULL,
            skill_ids {text} NOT NULL,
            scenes VARCHAR(128) NOT NULL DEFAULT 'all',
            priority INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_execute_flow (
            id {pk},
            scene VARCHAR(32) NOT NULL UNIQUE,
            skill_ids {text} NOT NULL,
            force_validate_flags {text},
            step_token_caps {text},
            fail_strategy VARCHAR(32) NOT NULL DEFAULT 'retry_step',
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_task (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            canvas_id VARCHAR(64),
            scene VARCHAR(32),
            skill_group_id BIGINT,
            task_type VARCHAR(32) NOT NULL,
            user_selected_model VARCHAR(64),
            actual_models {text},
            target_layer_id VARCHAR(128),
            current_skill_index INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'queued',
            hold_credits INTEGER NOT NULL DEFAULT 0,
            charged_credits INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            prompt {text},
            canvas_size VARCHAR(64),
            result_svg {text},
            error_message {text},
            meta_json {text},
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_layer_lock (
            id {pk},
            canvas_id VARCHAR(64) NOT NULL,
            layer_id VARCHAR(128) NOT NULL,
            locked INTEGER NOT NULL DEFAULT 1,
            allowed_skills {text},
            forbidden_attrs {text},
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_global_rule (
            id {pk},
            rule_key VARCHAR(64) NOT NULL UNIQUE,
            rule_value {text} NOT NULL,
            description {text},
            enabled INTEGER NOT NULL DEFAULT 1,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_canvas_tool (
            id {pk},
            op_key VARCHAR(64) NOT NULL UNIQUE,
            kind VARCHAR(32) NOT NULL DEFAULT 'node',
            label VARCHAR(128) NOT NULL DEFAULT '',
            model_hint {text},
            args_schema {text},
            enabled INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_dict (
            id {pk},
            dict_type VARCHAR(32) NOT NULL,
            code VARCHAR(64) NOT NULL,
            label VARCHAR(128) NOT NULL,
            description {text},
            sort_order INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL,
            UNIQUE(dict_type, code)
        ){engine}
        """,

        f"""
        CREATE TABLE IF NOT EXISTS design_library_item (
            id {pk},
            name VARCHAR(128) NOT NULL,
            kind VARCHAR(32) NOT NULL DEFAULT 'style',
            scene VARCHAR(64) NOT NULL DEFAULT 'all',
            cover_url {text},
            tags VARCHAR(255) NOT NULL DEFAULT '',
            description {text},
            enabled INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            meta_json {text},
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_quality_sample (
            id {pk},
            name VARCHAR(128) NOT NULL DEFAULT '',
            scene VARCHAR(32) NOT NULL DEFAULT 'website',
            grade VARCHAR(16) NOT NULL DEFAULT 'good',
            tags VARCHAR(512) NOT NULL DEFAULT '',
            comment_text {text},
            image_url {text} NOT NULL,
            origin_path {text},
            thumb_webp {blob},
            layout_emb {blob},
            color_emb {blob},
            aesthetic_emb {blob},
            emb_dim INTEGER NOT NULL DEFAULT 512,
            emb_model VARCHAR(64) NOT NULL DEFAULT 'openclip-vit-b-32',
            embed_status VARCHAR(32) NOT NULL DEFAULT 'pending',
            embed_error {text},
            enabled INTEGER NOT NULL DEFAULT 1,
            meta_json {text},
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_cold_blob (
            id {pk},
            kind VARCHAR(32) NOT NULL,
            ref_id VARCHAR(64) NOT NULL,
            compress_blob {blob} NOT NULL,
            meta_json {text},
            source_created_at DOUBLE,
            created_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_knowledge (
            id {pk},
            kind VARCHAR(32) NOT NULL,
            title VARCHAR(128) NOT NULL,
            body {text} NOT NULL,
            when_to_use {text},
            scenes VARCHAR(128) NOT NULL DEFAULT 'all',
            skill_categories VARCHAR(128) NOT NULL DEFAULT 'all',
            sort_order INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_prompt_pack (
            id {pk},
            kind VARCHAR(128) NOT NULL,
            pack_type VARCHAR(32) NOT NULL DEFAULT 'need',
            title VARCHAR(128) NOT NULL,
            body {text} NOT NULL,
            when_to_use {text},
            scenes VARCHAR(128) NOT NULL DEFAULT 'all',
            used_by VARCHAR(256) NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_system_prompt (
            id {pk},
            prompt_key VARCHAR(128) NOT NULL UNIQUE,
            label VARCHAR(128) NOT NULL DEFAULT '',
            description {text},
            body {text} NOT NULL,
            group_key VARCHAR(32) NOT NULL DEFAULT 'agent_prompt',
            selectable INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_token_pack (
            id {pk},
            name VARCHAR(128) NOT NULL,
            scenes VARCHAR(128) NOT NULL DEFAULT 'all',
            tokens_json {text} NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            note {text},
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_optimize_patch (
            id {pk},
            kind VARCHAR(32) NOT NULL,
            target_key VARCHAR(128) NOT NULL,
            patch_json {text} NOT NULL,
            rationale {text},
            flags_json {text},
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            fingerprint VARCHAR(64) NOT NULL,
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL,
            applied_at DOUBLE
        ){engine}
        """,
        f"""
        CREATE TABLE IF NOT EXISTS design_stage_review (
            id {pk},
            task_id VARCHAR(64) NOT NULL,
            user_id VARCHAR(64) NOT NULL,
            scene VARCHAR(32),
            skill_index INTEGER NOT NULL DEFAULT 0,
            skill_id BIGINT,
            skill_name VARCHAR(128),
            skill_category VARCHAR(32),
            rating INTEGER NOT NULL DEFAULT 0,
            verdict VARCHAR(32) NOT NULL DEFAULT 'pass',
            comment {text},
            preview_svg {text},
            tokens INTEGER NOT NULL DEFAULT 0,
            model_actual VARCHAR(64),
            created_at DOUBLE NOT NULL
        ){engine}
        """,

    ]

    for sql in statements:
        try:
            conn.execute(sql)
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            raise
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_design_task_user ON design_task(user_id, created_at)"
            if not mysql
            else "CREATE INDEX idx_design_task_user ON design_task(user_id, created_at)"
        )
    except Exception:
        pass
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_design_layer_canvas ON design_layer_lock(canvas_id)"
            if not mysql
            else "CREATE INDEX idx_design_layer_canvas ON design_layer_lock(canvas_id)"
        )
    except Exception:
        pass
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_design_stage_review_created ON design_stage_review(created_at)"
            if not mysql
            else "CREATE INDEX idx_design_stage_review_created ON design_stage_review(created_at)"
        )
    except Exception:
        pass
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_design_quality_scene_grade ON design_quality_sample(scene, grade, enabled)"
            if not mysql
            else "CREATE INDEX idx_design_quality_scene_grade ON design_quality_sample(scene, grade, enabled)"
        )
    except Exception:
        pass
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_design_cold_kind_ref ON design_cold_blob(kind, ref_id)"
            if not mysql
            else "CREATE INDEX idx_design_cold_kind_ref ON design_cold_blob(kind, ref_id)"
        )
    except Exception:
        pass
    _ensure_quality_sample_media_columns(conn, mysql=mysql)
    _ensure_design_skill_key_column(conn, mysql=mysql)
    _ensure_design_skill_runtime_columns(conn, mysql=mysql)
    _ensure_design_skill_revision_table(conn, mysql=mysql)
    _ensure_design_user_skill_pref_table(conn, mysql=mysql)
    _ensure_canvas_tool_kind_column(conn, mysql=mysql)
    _ensure_canvas_tool_args_schema_column(conn, mysql=mysql)
    _ensure_global_rule_meta_columns(conn, mysql=mysql)
    _ensure_design_dict_description_column(conn, mysql=mysql)
    _ensure_prompt_pack_kind_width(conn, mysql=mysql)
    _ensure_prompt_pack_type_column(conn, mysql=mysql)
    conn.commit()


def _ensure_prompt_pack_kind_width(conn: Any, *, mysql: bool) -> None:
    """Allow prompt_key-sized kinds (agent.prompt.* / aesthetics.*)."""
    try:
        if mysql:
            conn.execute(
                "ALTER TABLE design_prompt_pack MODIFY COLUMN kind VARCHAR(128) NOT NULL"
            )
        else:
            # SQLite cannot widen in place; recreate is heavy — new installs use 128.
            pass
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_prompt_pack_type_column(conn: Any, *, mysql: bool) -> None:
    """Add pack_type (need|system); backfill from kind when missing."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'design_prompt_pack'
                  AND COLUMN_NAME = 'pack_type'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) <= 0:
                conn.execute(
                    "ALTER TABLE design_prompt_pack "
                    "ADD COLUMN pack_type VARCHAR(32) NOT NULL DEFAULT 'need'"
                )
        else:
            cols = {
                str(r["name"])
                for r in conn.execute("PRAGMA table_info(design_prompt_pack)").fetchall()
            }
            if "pack_type" not in cols:
                conn.execute(
                    "ALTER TABLE design_prompt_pack "
                    "ADD COLUMN pack_type VARCHAR(32) NOT NULL DEFAULT 'need'"
                )
        # Backfill: system keys → system; everything else stays need.
        conn.execute(
            """
            UPDATE design_prompt_pack
            SET pack_type = 'system'
            WHERE COALESCE(pack_type, '') IN ('', 'need')
              AND (
                kind LIKE 'agent.prompt.%'
                OR kind LIKE 'agent.persona.%'
                OR kind LIKE 'aesthetics.prompt.%'
                OR kind = 'aesthetics.vision.structure_schema'
                OR kind = 'precheck.router_system'
              )
            """
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_prompt_pack_used_by_column(conn: Any, *, mysql: bool) -> None:
    """Add used_by (CSV of graph/product stages: decide,paint,…)."""
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'design_prompt_pack'
                  AND COLUMN_NAME = 'used_by'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) <= 0:
                conn.execute(
                    "ALTER TABLE design_prompt_pack "
                    "ADD COLUMN used_by VARCHAR(256) NOT NULL DEFAULT ''"
                )
        else:
            cols = {
                str(r["name"])
                for r in conn.execute("PRAGMA table_info(design_prompt_pack)").fetchall()
            }
            if "used_by" not in cols:
                conn.execute(
                    "ALTER TABLE design_prompt_pack "
                    "ADD COLUMN used_by VARCHAR(256) NOT NULL DEFAULT ''"
                )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_design_dict_description_column(conn: Any, *, mysql: bool) -> None:
    """Add description on design_dict (idempotent)."""
    text = "LONGTEXT" if mysql else "TEXT"
    try:
        if mysql:
            row = conn.execute(
                """
                SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'design_dict'
                  AND COLUMN_NAME = 'description'
                """
            ).fetchone()
            if int((row or {}).get("c") or 0) > 0:
                return
            conn.execute(f"ALTER TABLE design_dict ADD COLUMN description {text} NULL")
        else:
            cols = {
                str(r["name"] if "name" in r.keys() else r[1])
                for r in conn.execute("PRAGMA table_info(design_dict)").fetchall()
            }
            if "description" in cols:
                return
            conn.execute(f"ALTER TABLE design_dict ADD COLUMN description {text}")
    except Exception:
        pass


def _ensure_global_rule_meta_columns(conn: Any, *, mysql: bool) -> None:
    """Add description / enabled on design_global_rule (idempotent)."""
    text = "LONGTEXT" if mysql else "TEXT"
    cols = (
        ("description", f"{text} NULL"),
        ("enabled", "INTEGER NOT NULL DEFAULT 1"),
    )
    try:
        if mysql:
            for name, col_def in cols:
                row = conn.execute(
                    """
                    SELECT COUNT(*) AS c FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'design_global_rule'
                      AND COLUMN_NAME = ?
                    """,
                    (name,),
                ).fetchone()
                if int((row or {}).get("c") or 0) > 0:
                    continue
                conn.execute(f"ALTER TABLE design_global_rule ADD COLUMN {name} {col_def}")
        else:
            existing = {
                str(r["name"])
                for r in conn.execute("PRAGMA table_info(design_global_rule)").fetchall()
            }
            for name, col_def in cols:
                if name in existing:
                    continue
                conn.execute(f"ALTER TABLE design_global_rule ADD COLUMN {name} {col_def}")
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_canvas_tool_args_schema_column(conn: Any, *, mysql: bool) -> None:
    try:
        if mysql:
            conn.execute(
                "ALTER TABLE design_canvas_tool ADD COLUMN args_schema TEXT NULL"
            )
        else:
            conn.execute(
                "ALTER TABLE design_canvas_tool ADD COLUMN args_schema TEXT"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_canvas_tool_kind_column(conn: Any, *, mysql: bool) -> None:
    try:
        conn.execute(
            "ALTER TABLE design_canvas_tool ADD COLUMN kind VARCHAR(32) NOT NULL DEFAULT 'node'"
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_design_skill_key_column(conn: Any, *, mysql: bool) -> None:
    """Add skill_key on installs created before the column existed."""
    try:
        if mysql:
            conn.execute(
                "ALTER TABLE design_skill ADD COLUMN skill_key VARCHAR(64) NULL"
            )
        else:
            conn.execute(
                "ALTER TABLE design_skill ADD COLUMN skill_key VARCHAR(64) NULL"
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _ensure_design_skill_runtime_columns(conn: Any, *, mysql: bool) -> None:
    """Pluggable skill columns: when/tools/triggers/mutex/version/source/pack meta."""
    text = "LONGTEXT" if mysql else "TEXT"
    varchar16 = "VARCHAR(16)"
    varchar32 = "VARCHAR(32)"
    varchar64 = "VARCHAR(64)"
    for col, col_def in (
        ("when_to_use", text),
        ("preferred_tools", text),
        ("triggers", text),
        ("mutex_group", f"{varchar64} NULL"),
        ("version", "INTEGER DEFAULT 1"),
        ("pack_version", f"{varchar32} NULL"),
        ("description", text),
        ("logo", text),
        ("locales", text),
        ("source", f"{varchar16} DEFAULT 'admin'"),
        ("allowed_resources", text),
        ("namespace", f"{varchar16} NOT NULL DEFAULT 'user'"),
        ("owner_user_id", f"{varchar64} NULL"),
        ("input_schema", text),
        ("output_schema", text),
    ):
        try:
            if mysql:
                conn.execute(
                    f"ALTER TABLE design_skill ADD COLUMN {col} {col_def}"
                )
            else:
                conn.execute(
                    f"ALTER TABLE design_skill ADD COLUMN {col} {col_def}"
                )
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass


def _ensure_design_skill_revision_table(conn: Any, *, mysql: bool) -> None:
    """Version history snapshots for pin / rollback."""
    pk = "BIGINT PRIMARY KEY AUTO_INCREMENT" if mysql else "INTEGER PRIMARY KEY AUTOINCREMENT"
    text = "LONGTEXT" if mysql else "TEXT"
    engine = " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" if mysql else ""
    try:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS design_skill_revision (
                id {pk},
                skill_id BIGINT NOT NULL,
                skill_key VARCHAR(64) NOT NULL,
                namespace VARCHAR(16) NOT NULL DEFAULT 'user',
                version INTEGER NOT NULL,
                pack_version VARCHAR(32) NULL,
                snapshot {text} NOT NULL,
                source VARCHAR(16) NOT NULL DEFAULT 'admin',
                created_at DOUBLE NOT NULL
            ){engine}
            """
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_design_skill_rev_key_ver "
            "ON design_skill_revision(skill_key, version)"
            if not mysql
            else "CREATE INDEX idx_design_skill_rev_key_ver "
            "ON design_skill_revision(skill_key, version)"
        )
    except Exception:
        pass


def _ensure_design_user_skill_pref_table(conn: Any, *, mysql: bool) -> None:
    """Per-user enable/disable overlay for official (and any) skills."""
    pk = "BIGINT PRIMARY KEY AUTO_INCREMENT" if mysql else "INTEGER PRIMARY KEY AUTOINCREMENT"
    engine = " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" if mysql else ""
    try:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS design_user_skill_pref (
                id {pk},
                user_id VARCHAR(64) NOT NULL,
                skill_key VARCHAR(64) NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                updated_at DOUBLE NOT NULL,
                UNIQUE(user_id, skill_key)
            ){engine}
            """
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_design_user_skill_pref_user "
            "ON design_user_skill_pref(user_id)"
            if not mysql
            else "CREATE INDEX idx_design_user_skill_pref_user "
            "ON design_user_skill_pref(user_id)"
        )
    except Exception:
        pass


def _ensure_quality_sample_media_columns(conn: Any, *, mysql: bool) -> None:
    """Add origin_path / thumb_webp on existing installs."""
    text = "LONGTEXT" if mysql else "TEXT"
    blob = "LONGBLOB" if mysql else "BLOB"
    alters = (
        ("origin_path", text),
        ("thumb_webp", blob),
    )
    for col, col_def in alters:
        try:
            if mysql:
                conn.execute(
                    f"ALTER TABLE design_quality_sample ADD COLUMN {col} {col_def} NULL"
                )
            else:
                conn.execute(
                    f"ALTER TABLE design_quality_sample ADD COLUMN {col} {col_def}"
                )
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
