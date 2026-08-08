"""Ensure / sync / hot-reload for design skills."""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

from sqlmodel import Session

from app import crud
from app.core import db as core_db

from . import constants as _c
from .constants import (
    NS_CORE,
    RETIRED_NEED_PROMPT_KINDS,
    SOURCE_ADMIN,
    SOURCE_FILE,
    SOURCE_SEED,
    _DISK_SIGNATURE,
    _HOT_RELOAD_STOP,
    _HOT_RELOAD_THREAD,
    _META_NAMES,
    _PROTECTED_FROM_FILE,
    _PROTECTED_FROM_SEED,
    _SKILLS_LOCK,
    _SKILLS_READY,
)
from .keys import _normalize_namespace, _normalize_source
from .pack_io import (
    _SEED,
    _file_skills_dirs,
    _load_file_skills,
    _skill_md_path,
    _skills_seed_path,
)
from .runtime import (
    _parse_allowed_resources,
    _parse_preferred_tools,
    _parse_triggers,
    _row_get,
    invalidate_skill_key_cache,
    save_skill_revision,
)
from .schema import validate_skill_io_schema, validate_skill_meta

logger = logging.getLogger(__name__)


def _triggers_json(item: dict[str, Any]) -> str:
    return json.dumps(_parse_triggers(item.get("triggers")), ensure_ascii=False)

def _preferred_json(item: dict[str, Any]) -> str:
    preferred = item.get("preferred_tools") or item.get("preferredTools") or []
    return json.dumps(preferred if isinstance(preferred, list) else [], ensure_ascii=False)

def _allowed_resources_json(item: dict[str, Any], *, source: str) -> str | None:
    raw = item.get("allowed_resources")
    if raw is None:
        raw = item.get("allowedResources")
    parsed = _parse_allowed_resources(raw)
    if parsed is None:
        if source == SOURCE_ADMIN:
            return json.dumps(["tools"], ensure_ascii=False)
        if source in (SOURCE_SEED, SOURCE_FILE):
            return json.dumps(
                ["knowledge", "aesthetics", "tools"], ensure_ascii=False
            )
        return None
    return json.dumps(parsed, ensure_ascii=False)

def _schema_json(item: dict[str, Any], *keys: str) -> str | None:
    for k in keys:
        if k in item and item.get(k) is not None:
            obj, errs = validate_skill_io_schema(item.get(k), field=k)
            if errs or obj is None:
                return None if obj is None else json.dumps(obj, ensure_ascii=False)
            return json.dumps(obj, ensure_ascii=False)
    return None

def _upsert_owned_skill(
    session: Session,
    item: dict[str, Any],
    *,
    source: str,
    now: float,
    skip_sources: frozenset[str],
) -> None:
    from app.models import DesignSkill

    key = str(item.get("skill_key") or "").strip()
    if not key:
        return
    meta_errs = validate_skill_meta({**item, "skill_key": key}, source=source)
    if meta_errs:
        logger.warning("skip skill upsert %s (%s): %s", key, source, ",".join(meta_errs))
        return
    namespace = _normalize_namespace(item.get("namespace"), source=source)
    name = str(item.get("name") or key).strip() or key
    category = str(item.get("category") or "agent").strip() or "agent"
    when = str(item.get("when_to_use") or item.get("whenToUse") or "").strip()
    pos = str(item.get("prompt_positive") or item.get("promptPositive") or "")
    neg = str(item.get("prompt_negative") or item.get("promptNegative") or "")
    scenes = str(item.get("scenes") or "all").strip() or "all"
    sort_weight = int(item.get("sort_weight") or item.get("sortWeight") or 0)
    mutex = str(item.get("mutex_group") or item.get("mutexGroup") or "").strip()
    version = int(item.get("version") or 1)
    pack_version = str(item.get("pack_version") or item.get("packVersion") or version).strip()
    description = str(item.get("description") or "").strip()
    logo = str(item.get("logo") or "").strip()
    locales_obj = item.get("locales") if isinstance(item.get("locales"), dict) else {}
    try:
        locales_json = json.dumps(locales_obj, ensure_ascii=False) if locales_obj else ""
    except Exception:
        locales_json = ""
    preferred_json = _preferred_json(item)
    triggers_json = _triggers_json(item)
    allowed_json = _allowed_resources_json(item, source=source)
    input_schema_json = _schema_json(item, "input_schema", "inputSchema")
    output_schema_json = _schema_json(item, "output_schema", "outputSchema")
    owner_user_id = str(item.get("owner_user_id") or item.get("ownerUserId") or "").strip() or None

    row = crud.get_design_skill_by_key(session=session, skill_key=key)
    skill_id: int | None = None
    next_ver = version
    if row:
        src = _normalize_source(_row_get(row, "source"), default=source)
        # Community seed is cold-start only: never update / never reclaim admin rows.
        if source == SOURCE_SEED:
            return
        if src in skip_sources:
            return
        try:
            cur_ver = int(_row_get(row, "version") or 0)
        except (TypeError, ValueError):
            cur_ver = 0
        next_ver = (
            max(version, cur_ver + 1)
            if source in (SOURCE_SEED, SOURCE_FILE)
            else max(version, 1)
        )
        skill_id = int(row.id or 0) or None
        row.name = name
        row.category = category
        row.prompt_positive = pos
        row.prompt_negative = neg
        row.when_to_use = when
        row.preferred_tools = preferred_json
        if allowed_json is not None:
            row.allowed_resources = allowed_json
        row.triggers = triggers_json
        row.mutex_group = mutex
        row.version = next_ver
        row.pack_version = pack_version
        row.description = description
        row.logo = logo
        row.locales = locales_json
        row.source = source
        row.namespace = namespace
        if owner_user_id:
            row.owner_user_id = owner_user_id
        if input_schema_json is not None:
            row.input_schema = input_schema_json
        if output_schema_json is not None:
            row.output_schema = output_schema_json
        row.sort_weight = sort_weight
        row.scenes = scenes
        row.enabled = 1
        row.updated_at = now
        session.add(row)
    else:
        default_allowed = allowed_json or json.dumps(
            ["knowledge", "aesthetics", "tools"]
            if source != SOURCE_ADMIN
            else ["tools"],
            ensure_ascii=False,
        )
        row = DesignSkill(
            skill_key=key,
            name=name,
            category=category,
            prompt_positive=pos,
            prompt_negative=neg,
            when_to_use=when,
            preferred_tools=preferred_json,
            allowed_resources=default_allowed,
            triggers=triggers_json,
            mutex_group=mutex,
            version=version,
            pack_version=pack_version,
            description=description,
            logo=logo,
            locales=locales_json,
            source=source,
            namespace=namespace,
            owner_user_id=owner_user_id,
            input_schema=input_schema_json,
            output_schema=output_schema_json,
            sort_weight=sort_weight,
            scenes=scenes,
            default_model="doubao",
            max_retries=2,
            enabled=1,
            output_format="json",
            allow_user_model_override=0,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        session.flush()
        skill_id = int(row.id or 0) or None
        next_ver = version

    if skill_id:
        save_skill_revision(
            session,
            skill_id=skill_id,
            item={
                "skillKey": key,
                "name": name,
                "description": description,
                "category": category,
                "whenToUse": when,
                "promptPositive": pos,
                "promptNegative": neg,
                "preferredTools": json.loads(preferred_json) if preferred_json else [],
                "allowedResources": json.loads(allowed_json) if allowed_json else None,
                "inputSchema": json.loads(input_schema_json) if input_schema_json else None,
                "outputSchema": json.loads(output_schema_json) if output_schema_json else None,
                "triggers": json.loads(triggers_json) if triggers_json else [],
                "mutexGroup": mutex or None,
                "version": next_ver,
                "packVersion": pack_version,
                "namespace": namespace,
                "source": source,
                "scenes": scenes,
                "sortWeight": sort_weight,
            },
        )

def _skills_disk_signature() -> str:
    parts: list[str] = []
    try:
        seed_path = _skills_seed_path()
        if seed_path.is_file():
            st = seed_path.stat()
            parts.append(f"seed:{st.st_mtime_ns}:{st.st_size}")
    except Exception:
        parts.append("seed:missing")
    for root in _file_skills_dirs():
        for pack in sorted(p for p in root.iterdir() if p.is_dir()):
            try:
                meta_m = 0
                body_m = 0
                for name in _META_NAMES:
                    mp = pack / name
                    if mp.is_file():
                        meta_m = mp.stat().st_mtime_ns
                        break
                sp = _skill_md_path(pack)
                if sp is not None:
                    body_m = sp.stat().st_mtime_ns
                parts.append(f"{root.name}/{pack.name}:{meta_m}:{body_m}")
            except Exception:
                parts.append(f"{root.name}/{pack.name}:err")
    return "|".join(parts)

def ensure_design_skills(*, force: bool = False) -> None:
    """Upsert seed + file skills; never overwrite admin."""
    if _c._SKILLS_READY and not force:
        return
    with _c._SKILLS_LOCK:
        if _c._SKILLS_READY and not force:
            return
        now = time.time()
        from app.services.db import init_schema
        from app.services.design.admin.schema import ensure_design_tables_boot

        init_schema()
        ensure_design_tables_boot()
        with Session(core_db.engine) as session:
            for item in _SEED:
                seeded = dict(item)
                seeded.setdefault("namespace", NS_CORE)
                seeded.setdefault(
                    "allowed_resources",
                    ["knowledge", "aesthetics", "tools"],
                )
                _upsert_owned_skill(
                    session,
                    seeded,
                    source=SOURCE_SEED,
                    now=now,
                    skip_sources=_PROTECTED_FROM_SEED,
                )
            for item in _load_file_skills():
                _upsert_owned_skill(
                    session,
                    item,
                    source=SOURCE_FILE,
                    now=now,
                    skip_sources=_PROTECTED_FROM_FILE,
                )
            _bump_unchanged_seed_skill_bodies(session, now=now)
            # Retired need_* packs (design_spec/vision/aesthetics) → Skills; delete leftovers.
            try:
                crud.delete_design_prompt_packs_by_kinds(
                    session=session, kinds=list(RETIRED_NEED_PROMPT_KINDS)
                )
            except Exception:
                pass
            session.commit()
        invalidate_skill_key_cache()
        _c._DISK_SIGNATURE = _skills_disk_signature()
        _c._SKILLS_READY = True


# Short phrases that must appear in the current seed body for each skill.
# SOURCE_SEED rows missing any listed marker (that exists in seed) get replaced.
# Prefer bumping ``version`` in design_skills_seed.json; markers catch same-version drift.
# Do not hardcode prior full bodies here.
_SEED_SKILL_BODY_MARKERS: dict[str, tuple[str, ...]] = {
    "canvas_edit": (
        "boolean_op",
        "brush_ops",
        "motion_lottie",
        "Clear / wipe board",
    ),
    "design_methodology": (
        "Prefer **1–3** tightly matched",
        "motion_lottie",
        "brush_ops",
        "MUST `create_frame`",
        "Exception only if the user explicitly refuses",
    ),
    "vision_extract": (
        "Finished poster/design",
        "letteringText",
        "~≥90%",
    ),
    "image_gen": (
        "Available fonts",
        "Poster / festive / illustrated hero",
        "Typography gate (~90% similarity)",
    ),
}

def _norm_skill_body(text: str) -> str:
    return str(text or "").replace("\r\n", "\n").strip()

def _bump_unchanged_seed_skill_bodies(session: Any, *, now: float) -> None:
    """Sync SOURCE_SEED skill bodies when seed version is newer or markers are missing."""
    seed_by_key = {
        str(it.get("skill_key") or "").strip(): it
        for it in _SEED
        if isinstance(it, dict) and str(it.get("skill_key") or "").strip()
    }
    for key, seed_item in seed_by_key.items():
        new_pos = str(seed_item.get("prompt_positive") or "").strip()
        new_neg = str(seed_item.get("prompt_negative") or "")
        if not new_pos:
            continue
        row = crud.get_design_skill_by_key(session=session, skill_key=key)
        if not row:
            continue
        src = _normalize_source(_row_get(row, "source"), default=SOURCE_SEED)
        if src != SOURCE_SEED:
            continue
        try:
            seed_ver = int(seed_item.get("version") or 0)
            cur_ver = int(_row_get(row, "version") or 0)
        except (TypeError, ValueError):
            seed_ver, cur_ver = 0, 0
        cur = _norm_skill_body(str(_row_get(row, "prompt_positive") or ""))
        new_norm = _norm_skill_body(new_pos)
        markers = tuple(
            m for m in (_SEED_SKILL_BODY_MARKERS.get(key) or ()) if m in new_norm
        )
        missing_marker = bool(markers) and any(m not in cur for m in markers)
        version_bump = seed_ver > cur_ver
        stale = version_bump or missing_marker
        preferred_json = _preferred_json(seed_item)
        cur_prefs = str(_row_get(row, "preferred_tools") or "").strip()
        prefs_changed = bool(preferred_json) and preferred_json != cur_prefs
        body_changed = cur != new_norm
        if not body_changed and not (stale and prefs_changed):
            continue
        if body_changed and not stale:
            continue
        if body_changed:
            row.prompt_positive = new_pos
            if new_neg:
                row.prompt_negative = new_neg
        if stale and prefs_changed:
            row.preferred_tools = preferred_json
        if stale:
            row.version = max(cur_ver, seed_ver)
        row.updated_at = now
        session.add(row)

def stop_skills_hot_reload() -> None:
    _c._HOT_RELOAD_STOP.set()
    t = _c._HOT_RELOAD_THREAD
    _c._HOT_RELOAD_THREAD = None
    if t and t.is_alive() and t is not threading.current_thread():
        try:
            t.join(timeout=1.5)
        except Exception:
            pass


def start_skills_hot_reload() -> bool:
    """Poll seed + file-pack mtimes and force-resync when they change."""
    try:
        from app.core.config import settings

        enabled = bool(getattr(settings, "design_skills_hot_reload", True))
        interval = float(getattr(settings, "design_skills_hot_reload_interval_sec", 2.0) or 2.0)
    except Exception:
        enabled = True
        interval = 2.0
    if not enabled:
        return False
    interval = max(0.5, min(interval, 60.0))
    stop_skills_hot_reload()
    _c._HOT_RELOAD_STOP.clear()

    def _loop() -> None:
        while not _c._HOT_RELOAD_STOP.wait(interval):
            try:
                sig = _skills_disk_signature()
                prev = _c._DISK_SIGNATURE
                if prev is None:
                    _c._DISK_SIGNATURE = sig
                    continue
                if sig != prev:
                    logger.info("design skills disk change detected — hot reload")
                    ensure_design_skills(force=True)
            except Exception:
                logger.exception("design skills hot reload failed")

    t = threading.Thread(target=_loop, name="design-skills-hot-reload", daemon=True)
    _c._HOT_RELOAD_THREAD = t
    t.start()
    return True


def reload_skills_if_disk_changed() -> bool:
    """One-shot check used by tests / admin; returns True if reloaded."""
    sig = _skills_disk_signature()
    if _c._DISK_SIGNATURE is not None and sig == _c._DISK_SIGNATURE:
        return False
    ensure_design_skills(force=True)
    return True
