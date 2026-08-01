"""Runtime skills for lc_design — pluggable catalog + need_skills + triggers + files.

Namespaces (conflict isolation):
  - core  — system seed skills (source=seed); bare keys kept for BC
  - ext   — server file packs under data/design_skills (source=file)
  - user  — admin / user-extension skills (source=admin); keys use ``user.<local>``

Also:
  - ACL: preferred_tools + allowed_resources; user skills never reopen unrestricted surface
  - I/O: pack/admin meta validation; need_skills pin/args vs input_schema; ops vs output_schema
  - Version: integer bump + pack_version + design_skill_revision snapshots; pin via ``key@N``
  - Hot reload: optional mtime watcher on seed JSON + file packs
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Any

from services.db import connect

logger = logging.getLogger(__name__)

_SKILLS_READY = False
_SKILLS_LOCK = threading.RLock()
_HOT_RELOAD_STOP = threading.Event()
_HOT_RELOAD_THREAD: threading.Thread | None = None
_DISK_SIGNATURE: str | None = None

SOURCE_SEED = "seed"
SOURCE_ADMIN = "admin"
SOURCE_FILE = "file"
_PROTECTED_FROM_SEED = frozenset({SOURCE_ADMIN, SOURCE_FILE})
_PROTECTED_FROM_FILE = frozenset({SOURCE_ADMIN, SOURCE_SEED})

NS_CORE = "core"
NS_EXT = "ext"
NS_USER = "user"
_VALID_NAMESPACES = frozenset({NS_CORE, NS_EXT, NS_USER})
_SOURCE_TO_NS = {
    SOURCE_SEED: NS_CORE,
    SOURCE_FILE: NS_EXT,
    SOURCE_ADMIN: NS_USER,
}

# Retired need_* prompt packs (methodology/vision/aesthetics → Skills). DELETE leftovers on sync.
RETIRED_NEED_PROMPT_KINDS = frozenset({"design_spec", "vision", "aesthetics"})

# Ops always allowed even when preferred_tools allowlist is active.
_ALWAYS_ALLOW_OPS = frozenset(
    {
        "ask_user",
        "update_node",
        "delete_nodes",
        "align_nodes",
        "distribute_nodes",
        "move_nodes",
        "resize_nodes",
        "reorder_nodes",
        "group_nodes",
        "ungroup_nodes",
    }
)

MAX_SKILL_DETAIL_CHARS = 14000
_FILE_SKILLS_DIR = Path(__file__).resolve().parents[2] / "data" / "design_skills"
_SEED_PATH = Path(__file__).resolve().parents[2] / "data" / "design_skills_seed.json"
_META_NAMES = ("_meta.json", "meta.json")
_NS_KEY_RE = re.compile(r"^(core|ext|user)[.:/](.+)$", re.IGNORECASE)
_PIN_RE = re.compile(r"^(.+?)@([0-9]+(?:\.[0-9]+){0,2})$")

_RUNTIME_SKILL_KEYS: frozenset[str] | None = None
_RUNTIME_SKILL_INDEX: dict[str, dict[str, Any]] | None = None


def _load_skills_seed() -> list[dict[str, Any]]:
    path = _SEED_PATH
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(parsed, dict):
        return []
    items = parsed.get("items") or []
    if not isinstance(items, list):
        return []
    return [x for x in items if isinstance(x, dict) and str(x.get("skill_key") or "").strip()]


_SEED = _load_skills_seed()
_SEED_BY_KEY: dict[str, dict[str, Any]] = {
    str(item.get("skill_key") or "").strip(): item for item in _SEED
}
_CORE_RESERVED_KEYS = frozenset(_SEED_BY_KEY.keys())


def _normalize_namespace(raw: Any, *, source: str | None = None) -> str:
    s = str(raw or "").strip().lower()
    if s in _VALID_NAMESPACES:
        return s
    if source:
        return _SOURCE_TO_NS.get(_normalize_source(source), NS_USER)
    return NS_USER


def split_namespace_key(raw: str) -> tuple[str | None, str]:
    """Return (namespace|None, local_key) from ``core.x`` / ``ext:x`` / bare ``x``."""
    s = str(raw or "").strip().lower()
    if not s:
        return None, ""
    m = _NS_KEY_RE.match(s)
    if m:
        return m.group(1).lower(), str(m.group(2) or "").strip()
    return None, s


def qualify_skill_key(namespace: str, local_key: str) -> str:
    ns = _normalize_namespace(namespace)
    _, local = split_namespace_key(local_key)
    local = local.strip().lower()
    if not local:
        return ""
    if ns == NS_CORE:
        # Core keeps bare storage keys for backward compatibility.
        return local
    return f"{ns}.{local}"


def skill_kind_for_namespace(namespace: str) -> str:
    return "core" if _normalize_namespace(namespace) == NS_CORE else "extension"


def parse_skill_pin(raw: str) -> tuple[str, int | None, str | None]:
    """Split ``key@2`` / ``key@1.0.0`` → (key, int_version|None, pack_version|None)."""
    s = str(raw or "").strip()
    if not s:
        return "", None, None
    m = _PIN_RE.match(s)
    if not m:
        return s, None, None
    base = str(m.group(1) or "").strip()
    pin = str(m.group(2) or "").strip()
    if re.fullmatch(r"\d+", pin):
        return base, max(1, int(pin)), None
    return base, None, pin


def _parse_json_object(raw: Any) -> dict[str, Any] | None:
    if raw is None or raw is False:
        return None
    if isinstance(raw, dict):
        return raw
    s = str(raw or "").strip()
    if not s:
        return None
    try:
        val = json.loads(s)
    except Exception:
        return None
    return val if isinstance(val, dict) else None


def validate_skill_io_schema(raw: Any, *, field: str) -> tuple[dict[str, Any] | None, list[str]]:
    """Strong-ish check: must be a JSON object (optional draft-like constraints)."""
    errs: list[str] = []
    if raw is None or raw == "" or raw is False:
        return None, errs
    obj = _parse_json_object(raw)
    if obj is None:
        errs.append(f"{field}_invalid_json_object")
        return None, errs
    t = obj.get("type")
    if t is not None and str(t).lower() not in ("object", "array", "string", "number", "boolean"):
        errs.append(f"{field}_unsupported_type:{t}")
    if "properties" in obj and not isinstance(obj.get("properties"), dict):
        errs.append(f"{field}_properties_must_be_object")
    if "required" in obj and not isinstance(obj.get("required"), list):
        errs.append(f"{field}_required_must_be_list")
    if "allowed_ops" in obj and not isinstance(obj.get("allowed_ops"), list):
        errs.append(f"{field}_allowed_ops_must_be_list")
    return obj, errs


def validate_against_schema(schema: dict[str, Any] | None, data: Any) -> list[str]:
    """Minimal JSON-Schema-like validator for skill input args / output contracts."""
    if not schema:
        return []
    errs: list[str] = []
    st = str(schema.get("type") or "object").lower()
    if st == "object":
        if data is None:
            data = {}
        if not isinstance(data, dict):
            return [f"expected_object_got_{type(data).__name__}"]
        props = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
        required = schema.get("required") if isinstance(schema.get("required"), list) else []
        for key in required:
            k = str(key)
            if k not in data:
                errs.append(f"missing_required:{k}")
        for key, sub in props.items():
            if key not in data or not isinstance(sub, dict):
                continue
            errs.extend(
                f"{key}.{e}" for e in validate_against_schema(sub, data.get(key))
            )
        return errs
    if st == "array":
        if not isinstance(data, list):
            return ["expected_array"]
        try:
            mn = int(schema["minItems"]) if "minItems" in schema else None
            mx = int(schema["maxItems"]) if "maxItems" in schema else None
        except (TypeError, ValueError):
            mn = mx = None
        if mn is not None and len(data) < mn:
            errs.append(f"minItems:{mn}")
        if mx is not None and len(data) > mx:
            errs.append(f"maxItems:{mx}")
        return errs
    if st == "string" and not isinstance(data, str):
        return ["expected_string"]
    if st == "number" and not isinstance(data, (int, float)):
        return ["expected_number"]
    if st == "boolean" and not isinstance(data, bool):
        return ["expected_boolean"]
    if "enum" in schema and isinstance(schema.get("enum"), list):
        if data not in schema["enum"]:
            errs.append("enum_mismatch")
    return errs


def validate_skill_meta(item: dict[str, Any], *, source: str) -> list[str]:
    """Validate seed/file/admin skill registration payload before upsert."""
    errs: list[str] = []
    key = str(item.get("skill_key") or item.get("skillKey") or "").strip()
    if not key:
        errs.append("skill_key_required")
    name = str(item.get("name") or "").strip()
    if not name:
        errs.append("name_required")
    body = str(item.get("prompt_positive") or item.get("promptPositive") or "").strip()
    if not body:
        errs.append("prompt_positive_required")
    ns = _normalize_namespace(
        item.get("namespace"), source=source
    )
    ns_prefix, local = split_namespace_key(key)
    if ns_prefix and ns_prefix != ns:
        errs.append(f"namespace_key_mismatch:{ns_prefix}!={ns}")
    local_key = local or key
    if source == SOURCE_ADMIN:
        if local_key in _CORE_RESERVED_KEYS or (
            ns_prefix == NS_CORE or (not ns_prefix and local_key in _CORE_RESERVED_KEYS)
        ):
            errs.append(f"core_key_reserved:{local_key}")
        if ns_prefix == NS_EXT:
            errs.append("user_skill_cannot_use_ext_namespace")
    if source == SOURCE_FILE and local_key in _CORE_RESERVED_KEYS:
        errs.append(f"file_pack_collides_core:{local_key}")
    prefs = item.get("preferred_tools") or item.get("preferredTools") or []
    if prefs is not None and not isinstance(prefs, (list, str)):
        errs.append("preferred_tools_invalid")
    _, in_errs = validate_skill_io_schema(
        item.get("input_schema") or item.get("inputSchema"), field="input_schema"
    )
    errs.extend(in_errs)
    _, out_errs = validate_skill_io_schema(
        item.get("output_schema") or item.get("outputSchema"), field="output_schema"
    )
    errs.extend(out_errs)
    ar = item.get("allowed_resources") or item.get("allowedResources")
    if ar is not None:
        parsed = _parse_allowed_resources(ar)
        if parsed is None and not isinstance(ar, list) and str(ar).strip():
            # empty list is valid; unparsable non-empty → error
            if _parse_allowed_resources(ar) is None and str(ar).strip() not in ("[]",):
                try:
                    json.loads(str(ar))
                except Exception:
                    errs.append("allowed_resources_invalid")
    return errs


def runtime_skill_keys() -> frozenset[str]:
    global _RUNTIME_SKILL_KEYS
    if _RUNTIME_SKILL_KEYS is not None:
        return _RUNTIME_SKILL_KEYS
    keys = {str(k).strip() for k in _SEED_BY_KEY if str(k).strip()}
    # Qualified aliases for core.
    for k in list(keys):
        keys.add(f"{NS_CORE}.{k}")
    try:
        with connect() as conn:
            rows = conn.execute(
                """
                SELECT skill_key, namespace FROM design_skill
                WHERE enabled = 1 AND skill_key IS NOT NULL AND TRIM(skill_key) != ''
                """
            ).fetchall()
            for r in rows:
                k = str(r["skill_key"] or "").strip()
                if not k:
                    continue
                keys.add(k)
                ns = _normalize_namespace(
                    _row_get(r, "namespace"),
                    source=None,
                )
                # If row has bare key, also accept qualified form.
                ns_prefix, local = split_namespace_key(k)
                if not ns_prefix:
                    keys.add(f"{ns}.{k}")
                    if ns == NS_CORE:
                        keys.add(k)
                else:
                    keys.add(local)
                    keys.add(k)
    except Exception:
        pass
    _RUNTIME_SKILL_KEYS = frozenset(keys)
    return _RUNTIME_SKILL_KEYS


def invalidate_skill_key_cache() -> None:
    global _RUNTIME_SKILL_KEYS, _RUNTIME_SKILL_INDEX
    _RUNTIME_SKILL_KEYS = None
    _RUNTIME_SKILL_INDEX = None


def reset_skills_ready_for_tests() -> None:
    """Test helper: force ensure_design_skills to run again."""
    global _SKILLS_READY, _RUNTIME_SKILL_KEYS, _RUNTIME_SKILL_INDEX, _DISK_SIGNATURE
    stop_skills_hot_reload()
    _SKILLS_READY = False
    _RUNTIME_SKILL_KEYS = None
    _RUNTIME_SKILL_INDEX = None
    _DISK_SIGNATURE = None


def _csv_has(csv: str, token: str) -> bool:
    parts = {p.strip().lower() for p in str(csv or "").split(",") if p.strip()}
    if not parts or "all" in parts:
        return True
    return token.strip().lower() in parts


def _row_get(r: Any, key: str, default: Any = None) -> Any:
    try:
        if hasattr(r, "keys") and key in r.keys():
            return r[key]
    except Exception:
        pass
    if isinstance(r, dict):
        return r.get(key, default)
    return default


def _parse_preferred_tools(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()][:24]
    s = str(raw or "").strip()
    if not s:
        return []
    try:
        val = json.loads(s)
        if isinstance(val, list):
            return [str(x).strip() for x in val if str(x).strip()][:24]
    except Exception:
        pass
    return [p.strip() for p in s.replace("；", ",").split(",") if p.strip()][:24]


_INTERNAL_RESOURCE_KINDS = frozenset({"knowledge", "aesthetics", "tools"})


def _parse_allowed_resources(raw: Any) -> list[str] | None:
    """None = unspecified; list may be empty (= deny all internal resources)."""
    if raw is None:
        return None
    if isinstance(raw, list):
        out = []
        for x in raw:
            k = str(x or "").strip().lower()
            if k in _INTERNAL_RESOURCE_KINDS and k not in out:
                out.append(k)
        return out
    s = str(raw or "").strip()
    if not s:
        return []
    try:
        val = json.loads(s)
        if isinstance(val, list):
            return _parse_allowed_resources(val)
    except Exception:
        pass
    parts = [p.strip().lower() for p in s.replace("；", ",").split(",") if p.strip()]
    return [p for p in parts if p in _INTERNAL_RESOURCE_KINDS]


def _parse_triggers(raw: Any) -> list[dict[str, Any]]:
    if raw is None or raw is False:
        return []
    if isinstance(raw, dict):
        return [raw]
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    s = str(raw or "").strip()
    if not s:
        return []
    try:
        val = json.loads(s)
    except Exception:
        return []
    if isinstance(val, dict):
        return [val]
    if isinstance(val, list):
        return [x for x in val if isinstance(x, dict)]
    return []


def _normalize_source(raw: Any, *, default: str = SOURCE_ADMIN) -> str:
    s = str(raw or "").strip().lower()
    if s in (SOURCE_SEED, SOURCE_ADMIN, SOURCE_FILE):
        return s
    return default


def _parse_pack_version(raw: Any) -> tuple[str, int]:
    """Return (label, sortable int). Accepts 1 / '1' / '1.0.0'."""
    s = str(raw if raw is not None else "1").strip() or "1"
    if re.fullmatch(r"-?\d+", s):
        return s, max(1, int(s))
    m = re.match(r"^(\d+)(?:\.(\d+))?(?:\.(\d+))?", s)
    if m:
        major = int(m.group(1))
        minor = int(m.group(2) or 0)
        patch = int(m.group(3) or 0)
        return s, max(1, major * 1_000_000 + minor * 1_000 + patch)
    return s, 1


def _read_json_file(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def _locale_pick(
    locales: Any, *, prefer: tuple[str, ...] = ("zh-CN", "zh", "en-US", "en")
) -> dict[str, Any]:
    if not isinstance(locales, dict):
        return {}
    for key in prefer:
        block = locales.get(key)
        if isinstance(block, dict):
            return block
    for block in locales.values():
        if isinstance(block, dict):
            return block
    return {}


def _resolve_pack_logo(pack_dir: Path, meta: dict[str, Any]) -> str:
    """Return path relative to design_skills root, or absolute URL, or ''."""
    raw = str(meta.get("logo") or "").strip()
    if raw.startswith(("http://", "https://", "data:")):
        return raw
    candidates: list[Path] = []
    if raw:
        p = Path(raw)
        # Never accept absolute paths outside the pack (path traversal / leakage).
        if p.is_absolute():
            return ""
        candidates.append(pack_dir / p)
        candidates.append(pack_dir / Path(raw).name)
    key = pack_dir.name
    candidates.extend(
        [
            pack_dir / f"{key}-logo.png",
            pack_dir / f"{key}-logo.svg",
            pack_dir / f"{key}-logo.webp",
            pack_dir / f"{key}-logo.jpg",
            pack_dir / "logo.png",
            pack_dir / "logo.svg",
            pack_dir / "logo.webp",
            pack_dir / "logo.jpg",
        ]
    )
    root = _FILE_SKILLS_DIR.resolve()
    for cand in candidates:
        try:
            if not cand.is_file():
                continue
            resolved = cand.resolve()
            try:
                rel = resolved.relative_to(root)
                return rel.as_posix()
            except ValueError:
                # Outside design_skills root — deny.
                continue
        except Exception:
            continue
    return ""


def _skill_item_from_parts(
    *,
    pack_dir: Path,
    meta: dict[str, Any],
    body: str,
    skill_md_path: Path,
) -> dict[str, Any] | None:
    """Build skill dict from _meta.json + SKILL.md body."""
    folder = pack_dir.name
    # _meta.json: `name` is technical id; displayName lives in locales.
    key = str(meta.get("skill_key") or meta.get("skillKey") or meta.get("name") or folder).strip()
    if not key or key in _SEED_BY_KEY:
        return None
    locales = meta.get("locales") if isinstance(meta.get("locales"), dict) else {}
    loc = _locale_pick(locales)
    display = str(
        loc.get("displayName")
        or loc.get("display_name")
        or meta.get("displayName")
        or meta.get("display_name")
        or meta.get("title")
        or key
    ).strip() or key
    description = str(
        loc.get("description")
        or meta.get("description")
        or meta.get("when_to_use")
        or meta.get("whenToUse")
        or ""
    ).strip()
    when = str(meta.get("when_to_use") or meta.get("whenToUse") or description).strip()
    pos = body.strip()
    if not pos:
        return None
    pack_label, ver_int = _parse_pack_version(meta.get("version") or meta.get("pack_version") or 1)
    logo = _resolve_pack_logo(pack_dir, meta)
    ns_prefix, stripped = split_namespace_key(key)
    if ns_prefix == NS_CORE:
        return None
    storage_key = qualify_skill_key(NS_EXT, stripped or key) if ns_prefix == NS_EXT else (
        stripped or key
    )
    # Bare file-pack keys stay bare for BC; namespace column still marks ext.
    if not ns_prefix:
        storage_key = (stripped or key).strip().lower()
    if storage_key in _SEED_BY_KEY or (stripped or key) in _SEED_BY_KEY:
        return None
    meta_errs = validate_skill_meta(
        {
            "skill_key": storage_key,
            "name": display,
            "prompt_positive": pos,
            "preferred_tools": meta.get("preferred_tools") or meta.get("preferredTools") or [],
            "allowed_resources": meta.get("allowed_resources")
            or meta.get("allowedResources"),
            "input_schema": meta.get("input_schema") or meta.get("inputSchema"),
            "output_schema": meta.get("output_schema") or meta.get("outputSchema"),
            "namespace": NS_EXT,
        },
        source=SOURCE_FILE,
    )
    if meta_errs:
        logger.warning("skip skill pack %s: %s", pack_dir.name, ",".join(meta_errs))
        return None
    return {
        "skill_key": storage_key,
        "name": display,
        "description": description,
        "category": str(meta.get("category") or "agent").strip() or "agent",
        "when_to_use": when,
        "prompt_positive": pos,
        "prompt_negative": str(meta.get("prompt_negative") or meta.get("promptNegative") or "").strip(),
        "scenes": str(meta.get("scenes") or "all").strip() or "all",
        "sort_weight": int(meta.get("sort_weight") or meta.get("sortWeight") or 0),
        "preferred_tools": meta.get("preferred_tools") or meta.get("preferredTools") or [],
        "allowed_resources": meta.get("allowed_resources")
        or meta.get("allowedResources"),
        "input_schema": meta.get("input_schema") or meta.get("inputSchema"),
        "output_schema": meta.get("output_schema") or meta.get("outputSchema"),
        "triggers": meta.get("triggers") or [],
        "mutex_group": str(meta.get("mutex_group") or meta.get("mutexGroup") or "").strip(),
        "version": ver_int,
        "pack_version": pack_label,
        "logo": logo,
        "locales": locales if isinstance(locales, dict) else {},
        "source": SOURCE_FILE,
        "namespace": NS_EXT,
        "_path": str(skill_md_path),
        "_pack": str(pack_dir),
    }


def _load_pack_dir(pack_dir: Path) -> dict[str, Any] | None:
    """Load one skill pack: requires `_meta.json` + `SKILL.md`."""
    if not pack_dir.is_dir():
        return None
    skill_md = pack_dir / "SKILL.md"
    if not skill_md.is_file():
        return None
    meta: dict[str, Any] | None = None
    for name in _META_NAMES:
        p = pack_dir / name
        if p.is_file():
            meta = _read_json_file(p)
            if meta:
                break
    if not meta:
        return None
    try:
        body = skill_md.read_text(encoding="utf-8").lstrip("\ufeff").strip()
    except Exception:
        return None
    return _skill_item_from_parts(
        pack_dir=pack_dir,
        meta=meta,
        body=body,
        skill_md_path=skill_md,
    )


def _load_file_skills() -> list[dict[str, Any]]:
    """Scan data/design_skills/* packs → skill dicts."""
    root = _FILE_SKILLS_DIR
    if not root.is_dir():
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for pack_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        item = _load_pack_dir(pack_dir)
        if not item:
            continue
        key = str(item.get("skill_key") or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _pub(r: Any) -> dict[str, Any]:
    key = str(_row_get(r, "skill_key") or "").strip()
    preferred = _parse_preferred_tools(_row_get(r, "preferred_tools"))
    triggers = _parse_triggers(_row_get(r, "triggers"))
    source = _normalize_source(_row_get(r, "source"), default=SOURCE_ADMIN)
    namespace = _normalize_namespace(_row_get(r, "namespace"), source=source)
    allowed_resources = _parse_allowed_resources(_row_get(r, "allowed_resources"))
    input_schema = _parse_json_object(_row_get(r, "input_schema"))
    output_schema = _parse_json_object(_row_get(r, "output_schema"))
    locales_raw = _row_get(r, "locales")
    locales: dict[str, Any] = {}
    if isinstance(locales_raw, dict):
        locales = locales_raw
    elif locales_raw:
        try:
            val = json.loads(str(locales_raw))
            if isinstance(val, dict):
                locales = val
        except Exception:
            locales = {}
    ns_prefix, local = split_namespace_key(key)
    qualified = key if ns_prefix else f"{namespace}.{key}" if key else ""
    return {
        "id": int(_row_get(r, "id") or 0),
        "skillKey": key or None,
        "qualifiedKey": qualified or None,
        "name": str(_row_get(r, "name") or ""),
        "description": str(_row_get(r, "description") or ""),
        "category": str(_row_get(r, "category") or ""),
        "whenToUse": str(_row_get(r, "when_to_use") or ""),
        "promptPositive": str(_row_get(r, "prompt_positive") or ""),
        "promptNegative": str(_row_get(r, "prompt_negative") or ""),
        "preferredTools": preferred,
        "allowedResources": allowed_resources,
        "inputSchema": input_schema,
        "outputSchema": output_schema,
        "triggers": triggers,
        "mutexGroup": str(_row_get(r, "mutex_group") or "").strip() or None,
        "version": int(_row_get(r, "version") or 1),
        "packVersion": str(_row_get(r, "pack_version") or "").strip() or None,
        "logo": str(_row_get(r, "logo") or "").strip() or None,
        "locales": locales,
        "source": source,
        "namespace": namespace,
        "skillKind": skill_kind_for_namespace(namespace),
        "ownerUserId": str(_row_get(r, "owner_user_id") or "").strip() or None,
        "sortWeight": int(_row_get(r, "sort_weight") or 0),
        "scenes": str(_row_get(r, "scenes") or "all"),
        "enabled": bool(int(_row_get(r, "enabled") or 0)),
        "_localKey": local or key,
    }


def list_runtime_skills(
    *,
    scene: str = "website",
    enabled_only: bool = True,
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    ensure_design_skills()
    scene_l = str(scene or "website").strip().lower() or "website"
    uid = str(user_id or "").strip() or None
    sql = "SELECT * FROM design_skill WHERE skill_key IS NOT NULL AND TRIM(skill_key) != ''"
    if enabled_only:
        sql += " AND enabled = 1"
    sql += " ORDER BY sort_weight DESC, id ASC"
    with connect() as conn:
        rows = conn.execute(sql).fetchall()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in rows:
        item = _pub(r)
        key = str(item.get("skillKey") or "").strip()
        if not key or key in seen:
            continue
        ns = str(item.get("namespace") or NS_USER)
        owner = str(item.get("ownerUserId") or "").strip() or None
        # User-owned extension skills are isolated to that user.
        if ns == NS_USER and owner and uid and owner != uid:
            continue
        if ns == NS_USER and owner and not uid:
            continue
        if not (
            _csv_has(item.get("scenes") or "all", scene_l)
            or _csv_has(item.get("scenes") or "all", "all")
        ):
            continue
        seen.add(key)
        out.append(item)
    return out


def resolve_storage_skill_key(raw: str, *, scene: str = "website") -> str | None:
    """Map bare / namespaced / legacy refs onto the storage skill_key."""
    base, _, _ = parse_skill_pin(raw)
    s = base.strip().lower()
    if not s:
        return None
    if s.startswith("skill."):
        s = s[6:]
    if s.startswith("skill_"):
        s = s[6:]
    ns, local = split_namespace_key(s)
    rows = list_runtime_skills(scene=scene, enabled_only=True)
    by_key = {str(r.get("skillKey") or "").strip().lower(): r for r in rows}

    def _match(want_ns: str | None, want_local: str) -> str | None:
        # Exact storage key
        if want_local in by_key and (
            want_ns is None or str(by_key[want_local].get("namespace")) == want_ns
        ):
            return want_local
        qualified = f"{want_ns}.{want_local}" if want_ns else ""
        if qualified and qualified in by_key:
            return qualified
        for k, row in by_key.items():
            row_ns = str(row.get("namespace") or "")
            row_local = str(row.get("_localKey") or k).lower()
            if want_ns and row_ns != want_ns:
                continue
            if row_local == want_local or k == want_local or k.endswith(f".{want_local}"):
                return k
        return None

    if ns:
        hit = _match(ns, local)
        if hit:
            return hit
        return None
    # Bare: prefer core → ext → user
    for prefer in (NS_CORE, NS_EXT, NS_USER):
        hit = _match(prefer, local)
        if hit:
            return hit
    if local in by_key:
        return local
    return None


def _apply_mutex(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep highest sortWeight per mutex_group (rows already weight-desc)."""
    seen_g: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in rows:
        g = str(r.get("mutexGroup") or "").strip().lower()
        if g:
            if g in seen_g:
                continue
            seen_g.add(g)
        out.append(r)
    return out


def format_skills_catalog(*, scene: str = "website", user_id: str | None = None) -> str:
    rows = list_runtime_skills(scene=scene, user_id=user_id)
    lines = [
        "Skill 目录（need_skills 申请正文；可用 `key` / `ns.key` / `key@版本`；"
        "简单加形/改色可直接 tool_ops；匹配 triggers 的 skill 会自动注入）："
    ]
    for r in rows:
        key = str(r.get("skillKey") or "").strip()
        if not key:
            continue
        name = str(r.get("name") or key).strip()
        when = str(r.get("whenToUse") or "").strip()
        ver = int(r.get("version") or 1)
        ns = str(r.get("namespace") or NS_USER)
        kind = str(r.get("skillKind") or skill_kind_for_namespace(ns))
        q = str(r.get("qualifiedKey") or key)
        line = f"- `{key}` [{ns}/{kind}] v{ver}"
        if q != key:
            line += f" alias:`{q}`"
        line += f" — {name}"
        if when:
            line += f"（{when[:80]}）"
        lines.append(line)
        if len(lines) >= 16:
            break
    if len(lines) == 1:
        lines.append("（暂无 runtime skill：Admin「Agent 技能」或 data/design_skills/*/_meta.json + SKILL.md）")
    return "\n".join(lines)


def _load_skill_revision_snapshot(
    *,
    skill_key: str,
    version: int | None = None,
    pack_version: str | None = None,
) -> dict[str, Any] | None:
    key = str(skill_key or "").strip()
    if not key:
        return None
    try:
        with connect() as conn:
            if version is not None:
                row = conn.execute(
                    """
                    SELECT snapshot FROM design_skill_revision
                    WHERE skill_key = ? AND version = ?
                    ORDER BY id DESC LIMIT 1
                    """,
                    (key, int(version)),
                ).fetchone()
            elif pack_version:
                row = conn.execute(
                    """
                    SELECT snapshot FROM design_skill_revision
                    WHERE skill_key = ? AND pack_version = ?
                    ORDER BY id DESC LIMIT 1
                    """,
                    (key, str(pack_version)),
                ).fetchone()
            else:
                return None
        if not row:
            return None
        snap = _parse_json_object(_row_get(row, "snapshot"))
        return snap
    except Exception:
        return None


def save_skill_revision(conn: Any, *, skill_id: int, item: dict[str, Any]) -> None:
    """Persist a version snapshot (best-effort; never breaks upsert)."""
    try:
        key = str(item.get("skillKey") or item.get("skill_key") or "").strip()
        if not key:
            return
        ver = int(item.get("version") or 1)
        snap = {
            k: item.get(k)
            for k in (
                "skillKey",
                "name",
                "description",
                "category",
                "whenToUse",
                "promptPositive",
                "promptNegative",
                "preferredTools",
                "allowedResources",
                "inputSchema",
                "outputSchema",
                "triggers",
                "mutexGroup",
                "version",
                "packVersion",
                "namespace",
                "source",
                "scenes",
                "sortWeight",
            )
        }
        conn.execute(
            """
            INSERT INTO design_skill_revision (
                skill_id, skill_key, namespace, version, pack_version, snapshot, source, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(skill_id),
                key,
                str(item.get("namespace") or NS_USER),
                ver,
                str(item.get("packVersion") or item.get("pack_version") or "") or None,
                json.dumps(snap, ensure_ascii=False),
                str(item.get("source") or SOURCE_ADMIN),
                time.time(),
            ),
        )
    except Exception:
        logger.debug("skill revision save failed", exc_info=True)


def format_skills_details(
    *,
    keys: list[str],
    scene: str = "website",
    max_chars: int = MAX_SKILL_DETAIL_CHARS,
    user_id: str | None = None,
    version_pins: dict[str, int | str] | None = None,
    input_args: dict[str, Any] | None = None,
) -> str:
    text, _errs = format_skills_details_checked(
        keys=keys,
        scene=scene,
        max_chars=max_chars,
        user_id=user_id,
        version_pins=version_pins,
        input_args=input_args,
    )
    return text


def format_skills_details_checked(
    *,
    keys: list[str],
    scene: str = "website",
    max_chars: int = MAX_SKILL_DETAIL_CHARS,
    user_id: str | None = None,
    version_pins: dict[str, int | str] | None = None,
    input_args: dict[str, Any] | None = None,
) -> tuple[str, list[str]]:
    """Return (details_markdown, validation_errors)."""
    wanted_raw = [str(k).strip() for k in (keys or []) if str(k).strip()]
    if not wanted_raw:
        return "", []
    load_all = any(k in ("*", "all") for k in wanted_raw)
    pins = version_pins or {}
    args_by_key = input_args or {}
    errs: list[str] = []
    resolved: list[dict[str, Any]] = []
    runtime = list_runtime_skills(scene=scene, user_id=user_id)
    by_key = {str(r.get("skillKey") or "").strip().lower(): r for r in runtime}

    if load_all:
        resolved = list(runtime)
    else:
        for raw in wanted_raw:
            base, pin_i, pin_p = parse_skill_pin(raw)
            storage = resolve_storage_skill_key(base, scene=scene)
            if not storage:
                errs.append(f"skill_unknown:{raw}")
                continue
            row = dict(by_key.get(storage) or {})
            if not row:
                errs.append(f"skill_unavailable:{storage}")
                continue
            pin = pins.get(storage, pins.get(base))
            if pin_i is not None:
                pin = pin_i
            elif pin_p is not None:
                pin = pin_p
            if pin is not None:
                snap = _load_skill_revision_snapshot(
                    skill_key=storage,
                    version=int(pin) if isinstance(pin, int) or str(pin).isdigit() else None,
                    pack_version=None if isinstance(pin, int) or str(pin).isdigit() else str(pin),
                )
                if snap:
                    row = {**row, **snap, "skillKey": storage}
                else:
                    # Pin miss: refuse silent upgrade
                    cur = int(row.get("version") or 0)
                    if isinstance(pin, int) or str(pin).isdigit():
                        if int(pin) != cur:
                            errs.append(f"skill_version_missing:{storage}@{pin}")
                            continue
                    elif str(row.get("packVersion") or "") != str(pin):
                        errs.append(f"skill_pack_version_missing:{storage}@{pin}")
                        continue
            schema = row.get("inputSchema") if isinstance(row.get("inputSchema"), dict) else None
            if schema:
                arg_errs = validate_against_schema(schema, args_by_key.get(storage) or {})
                if arg_errs:
                    errs.append(f"skill_input_invalid:{storage}:" + ",".join(arg_errs[:6]))
                    continue
            resolved.append(row)

    rows = _apply_mutex(resolved)
    parts: list[str] = [
        "以下为按需注入的 Skill 正文。按需采用；与用户明示冲突时以用户为准。"
        "用完后将 need_skills 设为 []。"
        "若列出 preferred_tools，优先使用这些 op（必要时可加 align/move 等布局工具）。"
        "core=系统核心；ext=服务器扩展包；user=用户扩展（权限更严）。"
    ]
    total = len(parts[0])
    used = 0
    for r in rows:
        key = str(r.get("skillKey") or "").strip().lower()
        if not key:
            continue
        name = str(r.get("name") or key)
        when = str(r.get("whenToUse") or "").strip()
        body = str(r.get("promptPositive") or "").strip()
        neg = str(r.get("promptNegative") or "").strip()
        tools = r.get("preferredTools") or []
        ver = int(r.get("version") or 1)
        ns = str(r.get("namespace") or NS_USER)
        head = f"## skill: {key} — {name} (v{ver}, ns={ns})"
        if when:
            head += f"\nwhen: {when}"
        if tools:
            head += "\npreferred_tools: " + ", ".join(str(t) for t in tools)
        out_schema = r.get("outputSchema") if isinstance(r.get("outputSchema"), dict) else None
        if out_schema and isinstance(out_schema.get("allowed_ops"), list):
            head += "\noutput_allowed_ops: " + ", ".join(
                str(t) for t in out_schema.get("allowed_ops") if str(t).strip()
            )
        block = f"{head}\n{body}".strip()
        if neg:
            block += f"\n\nforbid: {neg}"
        if total + len(block) + 2 > max_chars and used > 0:
            parts.append("…（其余 skill 因上下文预算省略，可下一回合再 need_skills）")
            break
        parts.append(block)
        total += len(block) + 2
        used += 1
        if load_all and used >= 12:
            break
    if used == 0:
        return "", errs
    return "\n\n".join(parts), errs


def _normalize_loaded_skill_keys(
    skill_keys: list[str], *, scene: str = "website"
) -> set[str]:
    """Map need_skills refs (bare / namespaced / aliases) → storage skill_keys."""
    raw = {str(k).strip().lower() for k in skill_keys if str(k).strip()}
    if not raw:
        return set()
    out: set[str] = set()
    for k in raw:
        hit = resolve_storage_skill_key(k, scene=scene)
        out.add((hit or k).lower())
    return out


def _iter_skills_for_keys(
    skill_keys: list[str], *, scene: str = "website"
):
    keys = _normalize_loaded_skill_keys(skill_keys, scene=scene)
    if not keys:
        return
    for r in list_runtime_skills(scene=scene):
        key = str(r.get("skillKey") or "").strip().lower()
        if key in keys:
            yield r


def preferred_tools_allowlist(
    skill_keys: list[str], *, scene: str = "website"
) -> set[str] | None:
    """Union of preferred_tools for loaded skills.

    None = no restriction (only platform seed/file skills with empty prefs).
    Custom admin skills without preferred_tools → hard-restrict to layout ops.
    """
    if not _normalize_loaded_skill_keys(skill_keys, scene=scene):
        return None
    allow: set[str] = set()
    any_pref = False
    any_custom_unscoped = False
    only_custom = True
    for r in _iter_skills_for_keys(skill_keys, scene=scene):
        source = str(r.get("source") or "").strip().lower()
        ns = str(r.get("namespace") or _SOURCE_TO_NS.get(source, NS_USER))
        if source in (SOURCE_SEED, SOURCE_FILE) or ns in (NS_CORE, NS_EXT):
            only_custom = False
        prefs = r.get("preferredTools") or []
        if prefs:
            any_pref = True
            allow.update(str(t).strip() for t in prefs if str(t).strip())
        elif source == SOURCE_ADMIN or ns == NS_USER:
            any_custom_unscoped = True
    if any_pref:
        allow |= _ALWAYS_ALLOW_OPS
        return allow
    if only_custom or any_custom_unscoped:
        # Custom skills must not inherit unrestricted canvas tool surface.
        return set(_ALWAYS_ALLOW_OPS)
    return None


def skill_resource_allowlist(
    skill_keys: list[str], *, scene: str = "website"
) -> set[str] | None:
    """Which internal need_* resources loaded skills may unlock.

    None = unrestricted (platform-only skills without explicit ACL).
    set() = deny knowledge / prompts / aesthetics.
    Any user-extension skill in the load set → never unrestricted.
    """
    if not _normalize_loaded_skill_keys(skill_keys, scene=scene):
        return None
    allowed: set[str] = set()
    saw_custom = False
    saw_platform_open = False
    for r in _iter_skills_for_keys(skill_keys, scene=scene):
        source = str(r.get("source") or "").strip().lower()
        ns = str(r.get("namespace") or _SOURCE_TO_NS.get(source, NS_USER))
        res = r.get("allowedResources")
        if isinstance(res, list):
            allowed.update(str(x).strip().lower() for x in res if str(x).strip())
            if source == SOURCE_ADMIN or ns == NS_USER:
                saw_custom = True
            continue
        if source in (SOURCE_SEED, SOURCE_FILE) or ns in (NS_CORE, NS_EXT):
            saw_platform_open = True
        elif source == SOURCE_ADMIN or ns == NS_USER:
            saw_custom = True
    # Hard isolation: user-extension skills never inherit unrestricted surface.
    if saw_custom:
        if not allowed:
            return {"tools"}
        return allowed | {"tools"}
    if saw_platform_open:
        return None
    return None


def filter_ops_by_skill_output_schema(
    ops: list[dict[str, Any]],
    *,
    skill_keys: list[str],
    scene: str = "website",
) -> tuple[list[dict[str, Any]], list[str]]:
    """Enforce union of output_schema.allowed_ops when declared by loaded skills."""
    if not _normalize_loaded_skill_keys(skill_keys, scene=scene):
        return list(ops or []), []
    allowed_ops: set[str] = set()
    any_schema = False
    for r in _iter_skills_for_keys(skill_keys, scene=scene):
        schema = r.get("outputSchema") if isinstance(r.get("outputSchema"), dict) else None
        if not schema:
            continue
        ops_list = schema.get("allowed_ops")
        if isinstance(ops_list, list) and ops_list:
            any_schema = True
            allowed_ops.update(str(x).strip() for x in ops_list if str(x).strip())
    if not any_schema:
        return list(ops or []), []
    allowed_ops |= _ALWAYS_ALLOW_OPS
    kept: list[dict[str, Any]] = []
    errs: list[str] = []
    for op in ops or []:
        if not isinstance(op, dict):
            continue
        name = str(op.get("name") or op.get("op_key") or "").strip()
        if not name or name in allowed_ops:
            kept.append(op)
            continue
        errs.append(f"op_not_in_skill_output_schema:{name}")
    return kept, errs


def filter_need_resources_by_skill_acl(
    *,
    skill_keys: list[str],
    scene: str,
    need_knowledge: list[str],
    need_aesthetics: bool,
) -> tuple[list[str], bool, list[str]]:
    """Drop internal resource requests blocked by custom-skill ACL."""
    allow = skill_resource_allowlist(skill_keys, scene=scene)
    if allow is None:
        return list(need_knowledge or []), bool(need_aesthetics), []
    errs: list[str] = []
    k = list(need_knowledge or [])
    a = bool(need_aesthetics)
    if k and "knowledge" not in allow:
        errs.append("skill_acl_deny:knowledge")
        k = []
    if a and "aesthetics" not in allow:
        errs.append("skill_acl_deny:aesthetics")
        a = False
    return k, a, errs


def filter_ops_by_skill_allowlist(
    ops: list[dict[str, Any]],
    *,
    skill_keys: list[str],
    scene: str = "website",
) -> tuple[list[dict[str, Any]], list[str]]:
    """Enforce preferred_tools / custom-skill hard allowlist + output_schema."""
    allow = preferred_tools_allowlist(skill_keys, scene=scene)
    kept: list[dict[str, Any]] = []
    errs: list[str] = []
    if allow is None:
        kept = list(ops or [])
    else:
        for op in ops or []:
            if not isinstance(op, dict):
                continue
            name = str(op.get("name") or op.get("op_key") or "").strip()
            if not name or name in allow:
                kept.append(op)
                continue
            errs.append(f"op_not_in_skill_allowlist:{name}")
    kept2, errs2 = filter_ops_by_skill_output_schema(kept, skill_keys=skill_keys, scene=scene)
    return kept2, errs + errs2


def parse_need_skills_with_pins(
    raw: Any, *, max_n: int = 8, scene: str = "website"
) -> tuple[list[str], dict[str, int | str], dict[str, Any], list[str]]:
    """Parse need_skills → (storage_keys, version_pins, input_args, errors)."""
    errs: list[str] = []
    if raw is None or raw is False:
        return [], {}, {}, []
    if raw is True:
        return ["*"], {}, {}, []
    items: list[Any]
    if isinstance(raw, str):
        s = raw.strip()
        if s.lower() in ("1", "true", "yes", "all", "*"):
            return ["*"], {}, {}, []
        items = [p.strip() for p in s.replace("；", ",").split(",")]
    elif isinstance(raw, list):
        items = raw
    else:
        return [], {}, {}, ["need_skills_invalid_type"]

    out: list[str] = []
    pins: dict[str, int | str] = {}
    args: dict[str, Any] = {}
    seen: set[str] = set()
    known = runtime_skill_keys()

    for item in items:
        pin_i: int | None = None
        pin_p: str | None = None
        arg_obj: Any = None
        if isinstance(item, dict):
            key_raw = str(
                item.get("key")
                or item.get("skill_key")
                or item.get("skillKey")
                or item.get("id")
                or ""
            ).strip()
            if "version" in item and item.get("version") is not None:
                try:
                    pin_i = int(item.get("version"))
                except (TypeError, ValueError):
                    pin_p = str(item.get("version"))
            if item.get("packVersion") or item.get("pack_version"):
                pin_p = str(item.get("packVersion") or item.get("pack_version"))
            if "args" in item:
                arg_obj = item.get("args")
        else:
            key_raw = str(item or "").strip()
        if not key_raw:
            continue
        base, from_at_i, from_at_p = parse_skill_pin(key_raw)
        if pin_i is None and from_at_i is not None:
            pin_i = from_at_i
        if pin_p is None and from_at_p is not None:
            pin_p = from_at_p
        key = base.strip().lower()
        if not key or key in seen:
            continue
        if key in ("all", "*"):
            return ["*"], {}, {}, errs
        if key.startswith("skill."):
            key = key[6:]
        if key.startswith("skill_"):
            key = key[6:]
        storage = resolve_storage_skill_key(key, scene=scene) or key
        if known and storage not in known and key not in known and f"core.{key}" not in known:
            # Also accept qualified forms already in known
            ns, local = split_namespace_key(key)
            alt = f"{ns}.{local}" if ns else f"core.{key}"
            if alt not in known and storage not in known:
                errs.append(f"skill_unknown:{key_raw}")
                continue
            storage = resolve_storage_skill_key(key, scene=scene) or storage
        if storage in seen:
            continue
        seen.add(storage)
        out.append(storage)
        if pin_i is not None:
            pins[storage] = pin_i
        elif pin_p is not None:
            pins[storage] = pin_p
        if arg_obj is not None:
            args[storage] = arg_obj
        if len(out) >= max_n:
            break
    return out, pins, args, errs


def normalize_need_skills(raw: Any, *, max_n: int = 8) -> list[str]:
    keys, _pins, _args, _errs = parse_need_skills_with_pins(raw, max_n=max_n)
    return keys


def _rule_matches(
    rule: dict[str, Any],
    *,
    empty_canvas: bool,
    has_images: bool,
    intent: str,
    need_aesthetics: bool = False,
    prompt_chars: int = 0,
) -> bool:
    if not isinstance(rule, dict) or not rule:
        return False
    intent_l = str(intent or "").strip().lower()

    if "empty_canvas" in rule and bool(rule.get("empty_canvas")) != bool(empty_canvas):
        return False
    if "has_images" in rule and bool(rule.get("has_images")) != bool(has_images):
        return False
    if "need_aesthetics" in rule and bool(rule.get("need_aesthetics")) != bool(
        need_aesthetics
    ):
        return False
    if "min_prompt_chars" in rule:
        try:
            need = int(rule.get("min_prompt_chars") or 0)
        except (TypeError, ValueError):
            need = 0
        if int(prompt_chars or 0) < need:
            return False

    raw_intents = rule.get("intent_in") or rule.get("intents")
    if raw_intents is not None:
        if isinstance(raw_intents, str):
            want = {p.strip().lower() for p in raw_intents.split(",") if p.strip()}
        elif isinstance(raw_intents, list):
            want = {str(x).strip().lower() for x in raw_intents if str(x).strip()}
        else:
            want = set()
        if want and intent_l not in want:
            return False
        if want and not intent_l:
            return False

    keys = set(rule.keys()) & {
        "empty_canvas",
        "has_images",
        "need_aesthetics",
        "intent_in",
        "intents",
        "min_prompt_chars",
    }
    return bool(keys)


def resolve_triggered_skill_keys(
    *,
    scene: str = "website",
    empty_canvas: bool = False,
    has_images: bool = False,
    intent: str = "",
    need_aesthetics: bool = False,
    prompt_chars: int = 0,
    already_loaded: list[str] | None = None,
    max_n: int = 6,
) -> list[str]:
    loaded = {str(x).strip().lower() for x in (already_loaded or []) if str(x).strip()}
    matched: list[dict[str, Any]] = []
    for row in list_runtime_skills(scene=scene):
        key = str(row.get("skillKey") or "").strip().lower()
        if not key or key in loaded:
            continue
        rules = row.get("triggers") or []
        if not rules:
            continue
        if any(
            _rule_matches(
                rule,
                empty_canvas=empty_canvas,
                has_images=has_images,
                intent=intent,
                need_aesthetics=need_aesthetics,
                prompt_chars=prompt_chars,
            )
            for rule in rules
        ):
            matched.append(row)
    matched = _apply_mutex(matched)
    out: list[str] = []
    for row in matched:
        key = str(row.get("skillKey") or "").strip().lower()
        if not key or key in loaded:
            continue
        out.append(key)
        loaded.add(key)
        if len(out) >= max_n:
            break
    return out


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
    conn: Any,
    item: dict[str, Any],
    *,
    source: str,
    now: float,
    skip_sources: frozenset[str],
) -> None:
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

    row = conn.execute(
        "SELECT id, source, triggers, version FROM design_skill WHERE skill_key = ? LIMIT 1",
        (key,),
    ).fetchone()
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
        next_ver = max(version, cur_ver + 1) if source in (SOURCE_SEED, SOURCE_FILE) else max(version, 1)
        skill_id = int(row["id"])
        conn.execute(
            """
            UPDATE design_skill SET
              name=?, category=?, prompt_positive=?, prompt_negative=?,
              when_to_use=?, preferred_tools=?, allowed_resources=COALESCE(?, allowed_resources),
              triggers=?, mutex_group=?, version=?, pack_version=?,
              description=?, logo=?, locales=?,
              source=?, namespace=?, owner_user_id=COALESCE(?, owner_user_id),
              input_schema=COALESCE(?, input_schema),
              output_schema=COALESCE(?, output_schema),
              sort_weight=?, scenes=?, enabled=1, updated_at=?
            WHERE id=?
            """,
            (
                name,
                category,
                pos,
                neg,
                when,
                preferred_json,
                allowed_json,
                triggers_json,
                mutex,
                next_ver,
                pack_version,
                description,
                logo,
                locales_json,
                source,
                namespace,
                owner_user_id,
                input_schema_json,
                output_schema_json,
                sort_weight,
                scenes,
                now,
                skill_id,
            ),
        )
    else:
        cur = conn.execute(
            """
            INSERT INTO design_skill (
                skill_key, name, category, prompt_positive, prompt_negative,
                when_to_use, preferred_tools, allowed_resources, triggers, mutex_group, version,
                pack_version, description, logo, locales, source, namespace, owner_user_id,
                input_schema, output_schema,
                sort_weight, scenes, default_model, max_retries,
                enabled, output_format, allow_user_model_override,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'doubao', 2, 1, 'json', 0, ?, ?)
            """,
            (
                key,
                name,
                category,
                pos,
                neg,
                when,
                preferred_json,
                allowed_json or json.dumps(
                    ["knowledge", "aesthetics", "tools"]
                    if source != SOURCE_ADMIN
                    else ["tools"],
                    ensure_ascii=False,
                ),
                triggers_json,
                mutex,
                version,
                pack_version,
                description,
                logo,
                locales_json,
                source,
                namespace,
                owner_user_id,
                input_schema_json,
                output_schema_json,
                sort_weight,
                scenes,
                now,
                now,
            ),
        )
        try:
            skill_id = int(cur.lastrowid)
        except Exception:
            skill_id = None
        next_ver = version

    if skill_id:
        save_skill_revision(
            conn,
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
        if _SEED_PATH.is_file():
            st = _SEED_PATH.stat()
            parts.append(f"seed:{st.st_mtime_ns}:{st.st_size}")
    except Exception:
        parts.append("seed:missing")
    root = _FILE_SKILLS_DIR
    if root.is_dir():
        for pack in sorted(p for p in root.iterdir() if p.is_dir()):
            try:
                meta_m = 0
                body_m = 0
                for name in _META_NAMES:
                    mp = pack / name
                    if mp.is_file():
                        meta_m = mp.stat().st_mtime_ns
                        break
                sp = pack / "SKILL.md"
                if sp.is_file():
                    body_m = sp.stat().st_mtime_ns
                parts.append(f"{pack.name}:{meta_m}:{body_m}")
            except Exception:
                parts.append(f"{pack.name}:err")
    return "|".join(parts)


def ensure_design_skills(*, force: bool = False) -> None:
    """Upsert seed + file skills; never overwrite admin."""
    global _SKILLS_READY, _DISK_SIGNATURE
    if _SKILLS_READY and not force:
        return
    with _SKILLS_LOCK:
        if _SKILLS_READY and not force:
            return
        now = time.time()
        from services.db import dialect, init_schema
        from services.design.schema import ensure_design_tables

        init_schema()
        mysql = dialect() == "mysql"
        with connect() as conn:
            ensure_design_tables(conn, mysql=mysql)
            for item in _SEED:
                seeded = dict(item)
                seeded.setdefault("namespace", NS_CORE)
                seeded.setdefault(
                    "allowed_resources",
                    ["knowledge", "aesthetics", "tools"],
                )
                _upsert_owned_skill(
                    conn,
                    seeded,
                    source=SOURCE_SEED,
                    now=now,
                    skip_sources=_PROTECTED_FROM_SEED,
                )
            for item in _load_file_skills():
                _upsert_owned_skill(
                    conn,
                    item,
                    source=SOURCE_FILE,
                    now=now,
                    skip_sources=_PROTECTED_FROM_FILE,
                )
            # Retired need_* packs (design_spec/vision/aesthetics) → Skills; delete leftovers.
            for kind in RETIRED_NEED_PROMPT_KINDS:
                try:
                    conn.execute(
                        "DELETE FROM design_prompt_pack WHERE kind = ?",
                        (kind,),
                    )
                except Exception:
                    pass
            conn.commit()
        invalidate_skill_key_cache()
        _DISK_SIGNATURE = _skills_disk_signature()
        _SKILLS_READY = True


def stop_skills_hot_reload() -> None:
    global _HOT_RELOAD_THREAD
    _HOT_RELOAD_STOP.set()
    t = _HOT_RELOAD_THREAD
    _HOT_RELOAD_THREAD = None
    if t and t.is_alive() and t is not threading.current_thread():
        try:
            t.join(timeout=1.5)
        except Exception:
            pass


def start_skills_hot_reload() -> bool:
    """Poll seed + file-pack mtimes and force-resync when they change."""
    global _HOT_RELOAD_THREAD
    try:
        from config.settings import settings

        enabled = bool(getattr(settings, "design_skills_hot_reload", True))
        interval = float(getattr(settings, "design_skills_hot_reload_interval_sec", 2.0) or 2.0)
    except Exception:
        enabled = True
        interval = 2.0
    if not enabled:
        return False
    interval = max(0.5, min(interval, 60.0))
    stop_skills_hot_reload()
    _HOT_RELOAD_STOP.clear()

    def _loop() -> None:
        global _DISK_SIGNATURE
        while not _HOT_RELOAD_STOP.wait(interval):
            try:
                sig = _skills_disk_signature()
                prev = _DISK_SIGNATURE
                if prev is None:
                    _DISK_SIGNATURE = sig
                    continue
                if sig != prev:
                    logger.info("design skills disk change detected — hot reload")
                    ensure_design_skills(force=True)
            except Exception:
                logger.exception("design skills hot reload failed")

    t = threading.Thread(target=_loop, name="design-skills-hot-reload", daemon=True)
    _HOT_RELOAD_THREAD = t
    t.start()
    return True


def reload_skills_if_disk_changed() -> bool:
    """One-shot check used by tests / admin; returns True if reloaded."""
    global _DISK_SIGNATURE
    sig = _skills_disk_signature()
    if _DISK_SIGNATURE is not None and sig == _DISK_SIGNATURE:
        return False
    ensure_design_skills(force=True)
    return True
