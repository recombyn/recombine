"""Design token packs — scene design-system tokens for prompt injection.

Shape mirrors big-tech DS (TDesign-like): semantic color, type scale, elevation,
component metrics — not a few prose lines. Injected as named refs for tool_ops.
"""
from __future__ import annotations

import json
import time
from typing import Any

from services.db import connect
from services.design.readpath.catalog import ensure_design_catalog

# Seed: data/public|private/design_tokens_seed.json (bump schemaVersion to upgrade rows).


def _load_tokens_seed() -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
    from config.settings import resolve_data_file

    path = resolve_data_file("design_tokens_seed.json")
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return "", {}, []
    if not isinstance(parsed, dict):
        return "", {}, []
    ver = str(parsed.get("schemaVersion") or "").strip()
    default = parsed.get("defaultTokens")
    if not isinstance(default, dict):
        default = {}
    else:
        default = dict(default)
    if ver and not default.get("schemaVersion"):
        default["schemaVersion"] = ver
    packs_raw = parsed.get("packs") or []
    packs = (
        [x for x in packs_raw if isinstance(x, dict)]
        if isinstance(packs_raw, list)
        else []
    )
    return ver, default, packs


TOKEN_SCHEMA_VERSION, DEFAULT_TOKENS, _SEED = _load_tokens_seed()


def _csv_has(csv: str, token: str) -> bool:
    parts = {p.strip().lower() for p in str(csv or "").split(",") if p.strip()}
    if not parts or "all" in parts:
        return True
    return token.strip().lower() in parts


def _parse_tokens(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _merge_tokens(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Deep-merge dict overlays (one level of nested dicts recursively)."""
    out: dict[str, Any] = dict(base)
    for k, v in (overlay or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge_tokens(out[k], v)
        else:
            out[k] = v
    return out


def _pub(r: Any) -> dict[str, Any]:
    return {
        "id": int(r["id"]),
        "name": str(r["name"] or ""),
        "scenes": str(r["scenes"] or "all"),
        "tokens": _parse_tokens(r["tokens_json"]),
        "isDefault": bool(int(r["is_default"] or 0)),
        "sortOrder": int(r["sort_order"] or 0),
        "enabled": bool(int(r["enabled"] or 0)),
        "note": str(r["note"] or ""),
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }


def ensure_design_token_packs() -> None:
    """Insert seed packs only when the table is empty. Never overwrite Admin packs."""
    now = time.time()
    with connect() as conn:
        n = int(conn.execute("SELECT COUNT(*) AS c FROM design_token_pack").fetchone()["c"] or 0)
        if n > 0:
            return
        for item in _SEED:
            conn.execute(
                """
                INSERT INTO design_token_pack
                (name, scenes, tokens_json, is_default, sort_order, enabled, note, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
                """,
                (
                    item["name"],
                    item["scenes"],
                    json.dumps(item["tokens"], ensure_ascii=False),
                    1 if item.get("is_default") else 0,
                    int(item.get("sort_order") or 0),
                    item.get("note") or "",
                    now,
                    now,
                ),
            )
        conn.commit()


def list_token_packs(*, enabled: bool | None = True, ensure: bool = True) -> list[dict[str, Any]]:
    if ensure:
        ensure_design_catalog()
        ensure_design_token_packs()
    clauses: list[str] = []
    params: list[Any] = []
    if enabled is not None:
        clauses.append("enabled = ?")
        params.append(1 if enabled else 0)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM design_token_pack{where} ORDER BY sort_order ASC, id ASC",
            tuple(params),
        ).fetchall()
    return [_pub(r) for r in rows]


def upsert_token_pack(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_catalog()
    ensure_design_token_packs()
    now = time.time()
    pid = payload.get("id")
    name = str(payload.get("name") or "").strip()[:128]
    if not name:
        raise ValueError("name required")
    scenes = str(payload.get("scenes") or "all").strip()[:128] or "all"
    tokens = payload.get("tokens")
    if not isinstance(tokens, dict) or not tokens:
        raise ValueError("tokens object required")
    # Stamp schema when admin saves a pack based on current defaults.
    if "schemaVersion" not in tokens:
        tokens = {**tokens, "schemaVersion": TOKEN_SCHEMA_VERSION}
    is_default = 1 if payload.get("isDefault", payload.get("is_default")) else 0
    sort_order = int(payload.get("sortOrder") or payload.get("sort_order") or 0)
    enabled = 1 if payload.get("enabled", True) else 0
    note = str(payload.get("note") or "")
    with connect() as conn:
        if pid:
            conn.execute(
                """
                UPDATE design_token_pack SET name=?, scenes=?, tokens_json=?, is_default=?,
                sort_order=?, enabled=?, note=?, updated_at=? WHERE id=?
                """,
                (
                    name,
                    scenes,
                    json.dumps(tokens, ensure_ascii=False),
                    is_default,
                    sort_order,
                    enabled,
                    note,
                    now,
                    int(pid),
                ),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM design_token_pack WHERE id=?", (int(pid),)).fetchone()
        else:
            cur = conn.execute(
                """
                INSERT INTO design_token_pack
                (name, scenes, tokens_json, is_default, sort_order, enabled, note, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    scenes,
                    json.dumps(tokens, ensure_ascii=False),
                    is_default,
                    sort_order,
                    enabled,
                    note,
                    now,
                    now,
                ),
            )
            conn.commit()
            new_id = int(cur.lastrowid)
            row = conn.execute("SELECT * FROM design_token_pack WHERE id=?", (new_id,)).fetchone()
    if not row:
        raise ValueError("upsert failed")
    return _pub(row)


def soft_delete_token_pack(item_id: int) -> bool:
    ensure_design_catalog()
    ensure_design_token_packs()
    with connect() as conn:
        cur = conn.execute(
            "UPDATE design_token_pack SET enabled=0, updated_at=? WHERE id=?",
            (time.time(), int(item_id)),
        )
        conn.commit()
        return cur.rowcount > 0


def resolve_token_pack(*, scene: str) -> dict[str, Any]:
    """Pick enabled default pack for scene; fall back to DEFAULT_TOKENS."""
    # Read-only for design-run hot path — seed/bootstrap is process startup.
    scene_l = str(scene or "website").strip().lower() or "website"
    packs = list_token_packs(enabled=True, ensure=False)
    best: dict[str, Any] | None = None
    best_score = -1
    for p in packs:
        if not _csv_has(p["scenes"], scene_l):
            continue
        score = 0
        if p.get("isDefault"):
            score += 10
        if str(p.get("scenes") or "").strip().lower() == scene_l:
            score += 5
        if score > best_score:
            best_score = score
            best = p
    if best:
        return {
            "id": best.get("id"),
            "name": best.get("name"),
            "scenes": best.get("scenes"),
            "tokens": _merge_tokens(DEFAULT_TOKENS, best.get("tokens") or {}),
        }
    return {
        "id": None,
        "name": "builtin",
        "scenes": scene_l,
        "tokens": dict(DEFAULT_TOKENS),
    }


def _flatten_leaves(prefix: str, node: Any, out: list[tuple[str, Any]]) -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            _flatten_leaves(key, v, out)
    else:
        out.append((prefix, node))


def format_token_block(pack: dict[str, Any] | None) -> str:
    """Named design-system refs for the model (not a short prose blurb)."""
    if not pack:
        return ""
    tokens = pack.get("tokens") or {}
    name = pack.get("name") or "tokens"
    ver = tokens.get("schemaVersion") or TOKEN_SCHEMA_VERSION
    lines = [
        f"DESIGN_TOKENS ({name}) schema={ver}",
        "Use these named values in tool_ops (fill/color/fontSize/cornerRadius/height/padding).",
        "Prefer token hex/sizes over inventing new ones unless USER_PROMPT overrides.",
        f"- grid: {tokens.get('grid', 8)}px",
    ]

    margin = tokens.get("margin") or {}
    gap = tokens.get("gap") or {}
    spacing = tokens.get("spacing") or {}
    radius = tokens.get("radius") or {}
    allowed = tokens.get("radiusAllowed") or list((radius or {}).values())
    contrast = tokens.get("contrast") or {}
    touch = tokens.get("touch") or {}

    lines.append(
        f"- margin.safe ≥ {margin.get('safe', 16)}px; gap.min ≥ {gap.get('min', 8)}px; "
        f"bottomCta ≥ {margin.get('bottomCta', 24)}px"
    )
    if isinstance(spacing, dict) and spacing:
        lines.append("- spacing: " + ", ".join(f"{k}={v}" for k, v in spacing.items()))
    if isinstance(radius, dict) and radius:
        lines.append(
            "- radius: "
            + ", ".join(f"{k}={v}" for k, v in radius.items() if k != "pill")
        )
    if allowed:
        lines.append(
            f"- cornerRadius ∈ {{{', '.join(str(int(x)) for x in allowed)}}} "
            "or pill (half short side)"
        )

    color = tokens.get("color") or {}
    for group in ("brand", "status", "text", "bg", "border"):
        block = color.get(group)
        if isinstance(block, dict) and block:
            lines.append(
                f"- color.{group}: "
                + ", ".join(f"{k}={v}" for k, v in block.items())
            )
    ratio = color.get("ratio") or {}
    if ratio:
        lines.append(
            f"- color.ratio ~ primary {ratio.get('primary', 60)}% / "
            f"secondary {ratio.get('secondary', 30)}% / accent {ratio.get('accent', 10)}%; "
            f"hueMax ≤ {color.get('hueMax', 3)}"
        )

    typ = tokens.get("type") or {}
    size = typ.get("size") if isinstance(typ, dict) else None
    if isinstance(size, dict) and size:
        lines.append("- type.size: " + ", ".join(f"{k}={v}" for k, v in size.items()))
    weight = typ.get("weight") if isinstance(typ, dict) else None
    if isinstance(weight, dict) and weight:
        lines.append("- type.weight: " + ", ".join(f"{k}={v}" for k, v in weight.items()))
    families = typ.get("families") if isinstance(typ, dict) else None
    if isinstance(families, list) and families:
        lines.append(f"- type.families (≤{typ.get('familiesMax', 2)}): " + ", ".join(str(x) for x in families))

    elev = tokens.get("elevation") or {}
    if isinstance(elev, dict) and elev:
        lines.append("- elevation: " + ", ".join(f"{k}" for k in elev.keys()))

    comp = tokens.get("component") or {}
    if isinstance(comp, dict):
        for cname, cval in comp.items():
            if not isinstance(cval, dict):
                continue
            flat: list[tuple[str, Any]] = []
            _flatten_leaves("", cval, flat)
            # Resolve radius token name → px for clarity.
            pretty = []
            for path, val in flat:
                if path.endswith("radius") and isinstance(val, str) and isinstance(radius, dict):
                    px = radius.get(val, val)
                    pretty.append(f"{path}={val}({px})")
                else:
                    pretty.append(f"{path}={val}")
            if pretty:
                lines.append(f"- component.{cname}: " + "; ".join(pretty))

    lines.append(
        f"- contrast body ≥ {contrast.get('body', 4.5)}:1; large ≥ {contrast.get('large', 3.0)}:1"
    )
    if touch.get("min"):
        lines.append(f"- touch.min edge ≥ {touch.get('min')}px")
    lines.append("- no severe overlap; no near-miss align (2–8px off)")
    lines.append(
        "Map UI roles: primary CTA → color.brand.primary + component.button.*; "
        "page chrome → color.bg.*; body copy → color.text.primary + type.size.body."
    )
    return "\n".join(lines)

