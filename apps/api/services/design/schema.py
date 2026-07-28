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
            kind VARCHAR(32) NOT NULL,
            title VARCHAR(128) NOT NULL,
            body {text} NOT NULL,
            when_to_use {text},
            scenes VARCHAR(128) NOT NULL DEFAULT 'all',
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
    _ensure_canvas_tool_kind_column(conn, mysql=mysql)
    _ensure_canvas_tool_args_schema_column(conn, mysql=mysql)
    _ensure_global_rule_meta_columns(conn, mysql=mysql)
    _ensure_design_dict_description_column(conn, mysql=mysql)
    conn.commit()


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
