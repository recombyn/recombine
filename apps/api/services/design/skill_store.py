"""Runtime skills for lc_design — pluggable catalog + need_skills + triggers + files.

- source=seed|admin|file: seed/file never overwrite admin; seed never overwrite file
- triggers JSON: hard auto-load; supports min_prompt_chars
- mutex_group + sort_weight: conflict resolution + detail budget
- version: bumped on seed/file sync; pack_version keeps semver from _meta.json
- File packs (required)::

    data/design_skills/<key>/
      _meta.json          # registration (name/description/logo/locales/…)
      <key>-logo.png      # optional icon
      SKILL.md            # prompt body only (no YAML frontmatter)
"""
from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path
from typing import Any

from services.db import connect

_SKILLS_READY = False
_SKILLS_LOCK = threading.RLock()

SOURCE_SEED = "seed"
SOURCE_ADMIN = "admin"
SOURCE_FILE = "file"
_PROTECTED_FROM_SEED = frozenset({SOURCE_ADMIN, SOURCE_FILE})
_PROTECTED_FROM_FILE = frozenset({SOURCE_ADMIN, SOURCE_SEED})

PROMPT_KIND_TO_SKILL: dict[str, str] = {
    "design_spec": "design_methodology",
    "vision": "vision_extract",
    "aesthetics": "aesthetics_align",
}

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
_META_NAMES = ("_meta.json", "meta.json")

_RUNTIME_SKILL_KEYS: frozenset[str] | None = None


def _load_skills_seed() -> list[dict[str, Any]]:
    path = Path(__file__).resolve().parents[2] / "data" / "design_skills_seed.json"
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


def runtime_skill_keys() -> frozenset[str]:
    global _RUNTIME_SKILL_KEYS
    if _RUNTIME_SKILL_KEYS is not None:
        return _RUNTIME_SKILL_KEYS
    keys = {str(k).strip() for k in _SEED_BY_KEY if str(k).strip()}
    try:
        with connect() as conn:
            rows = conn.execute(
                """
                SELECT skill_key FROM design_skill
                WHERE enabled = 1 AND skill_key IS NOT NULL AND TRIM(skill_key) != ''
                """
            ).fetchall()
            for r in rows:
                k = str(r["skill_key"] or "").strip()
                if k:
                    keys.add(k)
    except Exception:
        pass
    _RUNTIME_SKILL_KEYS = frozenset(keys)
    return _RUNTIME_SKILL_KEYS


def invalidate_skill_key_cache() -> None:
    global _RUNTIME_SKILL_KEYS
    _RUNTIME_SKILL_KEYS = None


def reset_skills_ready_for_tests() -> None:
    """Test helper: force ensure_design_skills to run again."""
    global _SKILLS_READY, _RUNTIME_SKILL_KEYS
    _SKILLS_READY = False
    _RUNTIME_SKILL_KEYS = None


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
        candidates.append(p if p.is_absolute() else (pack_dir / p))
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
                return str(resolved)
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
    return {
        "skill_key": key,
        "name": display,
        "description": description,
        "category": str(meta.get("category") or "agent").strip() or "agent",
        "when_to_use": when,
        "prompt_positive": pos,
        "prompt_negative": str(meta.get("prompt_negative") or meta.get("promptNegative") or "").strip(),
        "scenes": str(meta.get("scenes") or "all").strip() or "all",
        "sort_weight": int(meta.get("sort_weight") or meta.get("sortWeight") or 0),
        "preferred_tools": meta.get("preferred_tools") or meta.get("preferredTools") or [],
        "triggers": meta.get("triggers") or [],
        "mutex_group": str(meta.get("mutex_group") or meta.get("mutexGroup") or "").strip(),
        "version": ver_int,
        "pack_version": pack_label,
        "logo": logo,
        "locales": locales if isinstance(locales, dict) else {},
        "source": SOURCE_FILE,
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
    return {
        "id": int(_row_get(r, "id") or 0),
        "skillKey": key or None,
        "name": str(_row_get(r, "name") or ""),
        "description": str(_row_get(r, "description") or ""),
        "category": str(_row_get(r, "category") or ""),
        "whenToUse": str(_row_get(r, "when_to_use") or ""),
        "promptPositive": str(_row_get(r, "prompt_positive") or ""),
        "promptNegative": str(_row_get(r, "prompt_negative") or ""),
        "preferredTools": preferred,
        "triggers": triggers,
        "mutexGroup": str(_row_get(r, "mutex_group") or "").strip() or None,
        "version": int(_row_get(r, "version") or 1),
        "packVersion": str(_row_get(r, "pack_version") or "").strip() or None,
        "logo": str(_row_get(r, "logo") or "").strip() or None,
        "locales": locales,
        "source": source,
        "sortWeight": int(_row_get(r, "sort_weight") or 0),
        "scenes": str(_row_get(r, "scenes") or "all"),
        "enabled": bool(int(_row_get(r, "enabled") or 0)),
    }


def list_runtime_skills(*, scene: str = "website", enabled_only: bool = True) -> list[dict[str, Any]]:
    ensure_design_skills()
    scene_l = str(scene or "website").strip().lower() or "website"
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
        if not (
            _csv_has(item.get("scenes") or "all", scene_l)
            or _csv_has(item.get("scenes") or "all", "all")
        ):
            continue
        seen.add(key)
        out.append(item)
    return out


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


def format_skills_catalog(*, scene: str = "website") -> str:
    rows = list_runtime_skills(scene=scene)
    lines = [
        "Skill 目录（need_skills 申请正文；简单加形/改色可直接 tool_ops；"
        "匹配 triggers 的 skill 会自动注入）："
    ]
    for r in rows:
        key = str(r.get("skillKey") or "").strip()
        if not key:
            continue
        name = str(r.get("name") or key).strip()
        when = str(r.get("whenToUse") or "").strip()
        ver = int(r.get("version") or 1)
        line = f"- `{key}` v{ver} — {name}"
        if when:
            line += f"（{when[:80]}）"
        lines.append(line)
        if len(lines) >= 16:
            break
    if len(lines) == 1:
        lines.append("（暂无 runtime skill：Admin「Agent 技能」或 data/design_skills/*/_meta.json + SKILL.md）")
    return "\n".join(lines)


def format_skills_details(
    *,
    keys: list[str],
    scene: str = "website",
    max_chars: int = MAX_SKILL_DETAIL_CHARS,
) -> str:
    wanted = [str(k).strip().lower() for k in (keys or []) if str(k).strip()]
    if not wanted:
        return ""
    load_all = "*" in wanted
    wanted_set = {PROMPT_KIND_TO_SKILL.get(k, k) for k in wanted if k != "*"}
    rows = [
        r
        for r in list_runtime_skills(scene=scene)
        if load_all
        or str(r.get("skillKey") or "").strip().lower() in wanted_set
    ]
    rows = _apply_mutex(rows)
    parts: list[str] = [
        "以下为按需注入的 Skill 正文。按需采用；与用户明示冲突时以用户为准。"
        "用完后将 need_skills 设为 []。"
        "若列出 preferred_tools，优先使用这些 op（必要时可加 align/move 等布局工具）。"
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
        head = f"## skill: {key} — {name} (v{ver})"
        if when:
            head += f"\nwhen: {when}"
        if tools:
            head += "\npreferred_tools: " + ", ".join(str(t) for t in tools)
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
        return ""
    return "\n\n".join(parts)


def preferred_tools_allowlist(
    skill_keys: list[str], *, scene: str = "website"
) -> set[str] | None:
    """Union of preferred_tools for loaded skills. None = no restriction."""
    keys = {str(k).strip().lower() for k in skill_keys if str(k).strip()}
    if not keys:
        return None
    allow: set[str] = set()
    any_pref = False
    for r in list_runtime_skills(scene=scene):
        key = str(r.get("skillKey") or "").strip().lower()
        if key not in keys:
            continue
        prefs = r.get("preferredTools") or []
        if prefs:
            any_pref = True
            allow.update(str(t).strip() for t in prefs if str(t).strip())
    if not any_pref:
        return None
    allow |= _ALWAYS_ALLOW_OPS
    return allow


def filter_ops_by_skill_allowlist(
    ops: list[dict[str, Any]],
    *,
    skill_keys: list[str],
    scene: str = "website",
) -> tuple[list[dict[str, Any]], list[str]]:
    """Soft enforce preferred_tools: drop disallowed ops + return errors."""
    allow = preferred_tools_allowlist(skill_keys, scene=scene)
    if allow is None:
        return list(ops or []), []
    kept: list[dict[str, Any]] = []
    errs: list[str] = []
    for op in ops or []:
        if not isinstance(op, dict):
            continue
        name = str(op.get("name") or op.get("op_key") or "").strip()
        if not name or name in allow:
            kept.append(op)
            continue
        errs.append(f"op_not_in_skill_allowlist:{name}")
    return kept, errs


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


def normalize_need_skills(raw: Any, *, max_n: int = 8) -> list[str]:
    if raw is None or raw is False:
        return []
    if raw is True:
        return ["*"]
    items: list[Any]
    if isinstance(raw, str):
        s = raw.strip()
        if s.lower() in ("1", "true", "yes", "all", "*"):
            return ["*"]
        items = [p.strip() for p in s.replace("；", ",").split(",")]
    elif isinstance(raw, list):
        items = raw
    else:
        return []
    allow = runtime_skill_keys()
    known = set(allow) | set(_SEED_BY_KEY)
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        key = str(item or "").strip().lower()
        if not key or key in seen:
            continue
        if key in ("all", "*"):
            return ["*"]
        if key.startswith("skill."):
            key = key[6:]
        if key.startswith("skill_"):
            key = key[6:]
        key = PROMPT_KIND_TO_SKILL.get(key, key)
        if known and key not in known:
            continue
        seen.add(key)
        out.append(key)
        if len(out) >= max_n:
            break
    return out


def bridge_need_prompts_to_skills(
    need_prompts: list[str],
    need_skills: list[str],
) -> tuple[list[str], list[str]]:
    skills = list(need_skills or [])
    prompts: list[str] = []
    seen_s = set(skills)
    for k in need_prompts or []:
        key = str(k or "").strip().lower()
        mapped = PROMPT_KIND_TO_SKILL.get(key)
        if mapped:
            if mapped not in seen_s and "*" not in seen_s:
                skills.append(mapped)
                seen_s.add(mapped)
            continue
        # Drop unknown legacy methodology kinds; keep other custom packs if any.
        if key in PROMPT_KIND_TO_SKILL:
            continue
        prompts.append(key)
    return prompts, skills


def _triggers_json(item: dict[str, Any]) -> str:
    return json.dumps(_parse_triggers(item.get("triggers")), ensure_ascii=False)


def _preferred_json(item: dict[str, Any]) -> str:
    preferred = item.get("preferred_tools") or item.get("preferredTools") or []
    return json.dumps(preferred if isinstance(preferred, list) else [], ensure_ascii=False)


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
    row = conn.execute(
        "SELECT id, source, triggers, version FROM design_skill WHERE skill_key = ? LIMIT 1",
        (key,),
    ).fetchone()
    if row:
        src = _normalize_source(_row_get(row, "source"), default=source)
        raw_src = str(_row_get(row, "source") or "").strip()
        raw_trig = _row_get(row, "triggers")
        if (
            source == SOURCE_SEED
            and key in _SEED_BY_KEY
            and (not raw_src or src == SOURCE_ADMIN)
            and raw_trig is None
        ):
            src = SOURCE_SEED
        if not raw_src and source == SOURCE_SEED and key in _SEED_BY_KEY:
            src = SOURCE_SEED
        if src in skip_sources:
            return
        try:
            cur_ver = int(_row_get(row, "version") or 0)
        except (TypeError, ValueError):
            cur_ver = 0
        next_ver = max(version, cur_ver + 1) if source in (SOURCE_SEED, SOURCE_FILE) else max(version, 1)
        conn.execute(
            """
            UPDATE design_skill SET
              name=?, category=?, prompt_positive=?, prompt_negative=?,
              when_to_use=?, preferred_tools=?, triggers=?,
              mutex_group=?, version=?, pack_version=?,
              description=?, logo=?, locales=?,
              source=?, sort_weight=?, scenes=?, enabled=1, updated_at=?
            WHERE id=?
            """,
            (
                name,
                category,
                pos,
                neg,
                when,
                preferred_json,
                triggers_json,
                mutex,
                next_ver,
                pack_version,
                description,
                logo,
                locales_json,
                source,
                sort_weight,
                scenes,
                now,
                int(row["id"]),
            ),
        )
    else:
        conn.execute(
            """
            INSERT INTO design_skill (
                skill_key, name, category, prompt_positive, prompt_negative,
                when_to_use, preferred_tools, triggers, mutex_group, version,
                pack_version, description, logo, locales, source,
                sort_weight, scenes, default_model, max_retries,
                enabled, output_format, allow_user_model_override,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'doubao', 2, 1, 'json', 0, ?, ?)
            """,
            (
                key,
                name,
                category,
                pos,
                neg,
                when,
                preferred_json,
                triggers_json,
                mutex,
                version,
                pack_version,
                description,
                logo,
                locales_json,
                source,
                sort_weight,
                scenes,
                now,
                now,
            ),
        )


def ensure_design_skills(*, force: bool = False) -> None:
    """Upsert seed + file skills; never overwrite admin."""
    global _SKILLS_READY
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
                _upsert_owned_skill(
                    conn,
                    item,
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
            for kind in PROMPT_KIND_TO_SKILL:
                try:
                    conn.execute(
                        "UPDATE design_prompt_pack SET enabled = 0, updated_at = ? WHERE kind = ?",
                        (now, kind),
                    )
                except Exception:
                    pass
            conn.commit()
        global _RUNTIME_SKILL_KEYS
        _RUNTIME_SKILL_KEYS = None
        _SKILLS_READY = True
