"""Scene / vision prompt overlays — prefer flow「提示词」nodes, DB table as fallback."""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

from services.db import connect
from services.design.catalog import ensure_design_catalog

_PACKS_READY = False
_PACKS_LOCK = threading.RLock()


def _load_prompt_packs_seed() -> tuple[dict[str, str], list[dict[str, Any]]]:
    path = Path(__file__).resolve().parents[2] / "data" / "design_prompt_packs_seed.json"
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}, []
    if not isinstance(parsed, dict):
        return {}, []
    labels_raw = parsed.get("kindLabels") or {}
    labels = (
        {str(k): str(v) for k, v in labels_raw.items()}
        if isinstance(labels_raw, dict)
        else {}
    )
    items_raw = parsed.get("items") or []
    items = (
        [x for x in items_raw if isinstance(x, dict)]
        if isinstance(items_raw, list)
        else []
    )
    return labels, items


KIND_LABELS, _SEED = _load_prompt_packs_seed()


def _csv_has(csv: str, token: str) -> bool:
    parts = {p.strip().lower() for p in str(csv or "").split(",") if p.strip()}
    if not parts or "all" in parts:
        return True
    return token.strip().lower() in parts


def _pack_kind_from_node(node: dict[str, Any]) -> str:
    """prompt_website / id=prompt_vision / configRef=pack.mobile → website|vision|mobile."""
    for raw in (
        str(node.get("phaseKey") or ""),
        str(node.get("id") or ""),
        str(node.get("configRef") or ""),
    ):
        s = raw.strip().lower()
        if not s:
            continue
        if s.startswith("prompt_"):
            return s[7:]
        if s.startswith("pack."):
            return s[5:]
        if s.startswith("pack:"):
            return s[5:]
    pk = str(node.get("promptKey") or "").strip().lower()
    if pk.startswith("pack."):
        return pk[5:]
    return ""


def _scenes_from_node(node: dict[str, Any], kind: str) -> str:
    inj = node.get("inject") if isinstance(node.get("inject"), dict) else {}
    raw = str(inj.get("scenes") or node.get("scenes") or "").strip()
    if raw:
        return raw
    if kind in ("vision", "design_spec", "aesthetics"):
        return "all"
    return kind or "all"


def list_prompt_nodes_from_flow(*, graph: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Published / given graph: one bank node (promptPacks) or legacy prompt_* nodes."""
    raw_graph = graph
    if raw_graph is None:
        try:
            from services.design.admin_store import get_published_agent_flow

            pub = get_published_agent_flow("default") or {}
            g = pub.get("graph")
            raw_graph = g if isinstance(g, dict) else {}
        except Exception:
            raw_graph = {}
    out: list[dict[str, Any]] = []
    for n in (raw_graph.get("nodes") or []):
        if not isinstance(n, dict):
            continue
        if str(n.get("kind") or "").strip().lower() != "prompt":
            continue
        packs = n.get("promptPacks")
        if isinstance(packs, dict) and packs:
            order = 0
            for kind, raw_pack in packs.items():
                k = str(kind or "").strip().lower()
                if not k:
                    continue
                if isinstance(raw_pack, dict):
                    body = str(raw_pack.get("body") or "").strip()
                    title = str(
                        raw_pack.get("title") or KIND_LABELS.get(k, k)
                    ).strip()
                    when = str(
                        raw_pack.get("whenToUse") or raw_pack.get("when_to_use") or ""
                    ).strip()
                    scenes = str(raw_pack.get("scenes") or "all").strip() or "all"
                else:
                    body = str(raw_pack or "").strip()
                    title = KIND_LABELS.get(k, k)
                    when = ""
                    scenes = "all" if k in ("vision", "design_spec", "aesthetics") else k
                if not body:
                    continue
                out.append(
                    {
                        "id": 0,
                        "kind": k,
                        "title": title,
                        "body": body,
                        "whenToUse": when,
                        "scenes": scenes,
                        "sortOrder": order,
                        "enabled": True,
                        "updatedAt": None,
                        "nodeId": str(n.get("id") or ""),
                    }
                )
                order += 10
            continue
        # Legacy: one pack per node (prompt_website …)
        kind = _pack_kind_from_node(n)
        body = str(n.get("promptText") or "").strip()
        if not kind or not body:
            continue
        title = str(n.get("label") or KIND_LABELS.get(kind, kind)).strip()
        when = str(n.get("description") or "").strip()
        out.append(
            {
                "id": 0,
                "kind": kind,
                "title": title,
                "body": body,
                "whenToUse": when,
                "scenes": _scenes_from_node(n, kind),
                "sortOrder": int(n.get("y") or 0),
                "enabled": True,
                "updatedAt": None,
                "nodeId": str(n.get("id") or ""),
            }
        )
    out.sort(key=lambda x: (int(x.get("sortOrder") or 0), str(x.get("kind") or "")))
    return out


# Core packs always seeded into the agent flow. Scene-specific packs are obsolete —
# the model self-analyzes type + media (vector vs image) via design_spec.
_CORE_PROMPT_KINDS = frozenset({"design_spec", "vision", "aesthetics"})


def seed_prompt_overlay_nodes(*, x0: float = 2280, y0: float = 80, dy: float = 140) -> list[dict[str, Any]]:
    """Seed only core methodology / vision / aesthetics prompt nodes."""
    out: list[dict[str, Any]] = []
    i = 0
    for item in _SEED:
        kind = str(item.get("kind") or "").strip()
        if kind not in _CORE_PROMPT_KINDS:
            continue
        title = str(item.get("title") or KIND_LABELS.get(kind, kind))
        when = str(item.get("when_to_use") or "")
        scenes = str(item.get("scenes") or "all")
        body = str(item.get("body") or "")
        out.append(
            {
                "id": f"prompt_{kind}",
                "label": title,
                "description": when,
                "kind": "prompt",
                "capability": "prompt",
                "phaseKey": f"prompt_{kind}",
                "configRef": f"pack.{kind}",
                "promptText": body,
                "inject": {
                    "mode": "details",
                    "source": "prompt",
                    "scenes": scenes,
                },
                "x": x0,
                "y": y0 + i * dy,
            }
        )
        i += 1
    return out


def seed_prompt_bank_node(*, x: float = 2280, y: float = 400) -> dict[str, Any]:
    """Deprecated helper: packs dict only (for splitting old prompt_bank graphs)."""
    packs: dict[str, Any] = {}
    for item in _SEED:
        kind = str(item.get("kind") or "").strip()
        if not kind:
            continue
        packs[kind] = {
            "title": str(item.get("title") or KIND_LABELS.get(kind, kind)),
            "whenToUse": str(item.get("when_to_use") or ""),
            "scenes": str(item.get("scenes") or "all"),
            "body": str(item.get("body") or ""),
        }
    return {
        "id": "prompt_bank",
        "label": "场景提示词",
        "description": "已废弃：请拆成独立 prompt_* 节点",
        "kind": "prompt",
        "capability": "prompt",
        "phaseKey": "prompt_bank",
        "configRef": "prompt_bank",
        "promptPacks": packs,
        "promptText": "",
        "inject": {"mode": "details", "source": "prompt"},
        "x": x,
        "y": y,
    }


def _pub(r: Any) -> dict[str, Any]:
    return {
        "id": int(r["id"]),
        "kind": str(r["kind"] or ""),
        "title": str(r["title"] or ""),
        "body": str(r["body"] or ""),
        "whenToUse": str(r["when_to_use"] or ""),
        "scenes": str(r["scenes"] or "all"),
        "sortOrder": int(r["sort_order"] or 0),
        "enabled": bool(int(r["enabled"] or 0)),
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }


def ensure_design_prompt_packs() -> None:
    """Insert missing seed rows into design_prompt_pack (fallback only)."""
    global _PACKS_READY
    if _PACKS_READY:
        return
    with _PACKS_LOCK:
        if _PACKS_READY:
            return
        now = time.time()
        with connect() as conn:
            existing_keys = {
                (str(r["kind"] or ""), str(r["title"] or ""))
                for r in conn.execute(
                    "SELECT kind, title FROM design_prompt_pack"
                ).fetchall()
            }
            for item in _SEED:
                kind = str(item["kind"])
                title = str(item["title"])
                if (kind, title) in existing_keys:
                    continue
                conn.execute(
                    """
                    INSERT INTO design_prompt_pack
                    (kind, title, body, when_to_use, scenes, sort_order, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """,
                    (
                        kind,
                        title,
                        str(item["body"]),
                        item.get("when_to_use") or "",
                        item.get("scenes") or "all",
                        int(item.get("sort_order") or 0),
                        now,
                        now,
                    ),
                )
                existing_keys.add((kind, title))
            conn.commit()
        _PACKS_READY = True


def list_prompt_packs(
    *,
    kind: str | None = None,
    enabled: bool | None = True,
    ensure: bool = True,
) -> list[dict[str, Any]]:
    """Prefer flow 提示词节点; else DB table."""
    flow_rows = list_prompt_nodes_from_flow()
    if flow_rows:
        rows = flow_rows
        if kind:
            rows = [r for r in rows if r["kind"] == kind]
        if enabled is False:
            return []
        return rows
    if ensure:
        ensure_design_catalog()
        ensure_design_prompt_packs()
    clauses: list[str] = []
    params: list[Any] = []
    if kind:
        clauses.append("kind = ?")
        params.append(kind)
    if enabled is not None:
        clauses.append("enabled = ?")
        params.append(1 if enabled else 0)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM design_prompt_pack{where} ORDER BY sort_order ASC, id ASC",
            tuple(params),
        ).fetchall()
    return [_pub(r) for r in rows]


def upsert_prompt_pack(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_catalog()
    ensure_design_prompt_packs()
    now = time.time()
    kid = payload.get("id")
    kind = str(payload.get("kind") or "").strip()[:32]
    title = str(payload.get("title") or "").strip()[:128]
    body = str(payload.get("body") or "").strip()
    if not kind or not title or not body:
        raise ValueError("kind, title, body required")
    when = str(payload.get("whenToUse") or payload.get("when_to_use") or "").strip()
    scenes = str(payload.get("scenes") or "all").strip()[:128] or "all"
    sort_order = int(payload.get("sortOrder") or payload.get("sort_order") or 0)
    enabled = 1 if payload.get("enabled", True) else 0
    with connect() as conn:
        if kid:
            conn.execute(
                """
                UPDATE design_prompt_pack SET kind=?, title=?, body=?, when_to_use=?, scenes=?,
                sort_order=?, enabled=?, updated_at=? WHERE id=?
                """,
                (kind, title, body, when, scenes, sort_order, enabled, now, int(kid)),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM design_prompt_pack WHERE id=?", (int(kid),)
            ).fetchone()
        else:
            cur = conn.execute(
                """
                INSERT INTO design_prompt_pack
                (kind, title, body, when_to_use, scenes, sort_order, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (kind, title, body, when, scenes, sort_order, enabled, now, now),
            )
            conn.commit()
            new_id = int(cur.lastrowid)
            row = conn.execute(
                "SELECT * FROM design_prompt_pack WHERE id=?", (new_id,)
            ).fetchone()
    if not row:
        raise ValueError("upsert failed")
    return _pub(row)


def soft_delete_prompt_pack(item_id: int) -> bool:
    ensure_design_catalog()
    ensure_design_prompt_packs()
    with connect() as conn:
        cur = conn.execute(
            "UPDATE design_prompt_pack SET enabled=0, updated_at=? WHERE id=?",
            (time.time(), int(item_id)),
        )
        conn.commit()
        return cur.rowcount > 0


def format_prompt_pack_block(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    parts = [
        "以下为流程图「提示词」节点注入的规则：只采用与当前任务相关的条目；"
        "与用户明示冲突时以用户为准。"
    ]
    for r in rows:
        label = KIND_LABELS.get(r["kind"], r["kind"])
        title = r.get("title") or label
        when = (r.get("whenToUse") or "").strip()
        head = f"【{label}·{title}】"
        if when:
            head += f"\n适用：{when}"
        parts.append(f"{head}\n{r.get('body') or ''}".strip())
    return "\n\n".join(parts)


def format_prompt_packs_catalog(*, scene: str = "website") -> str:
    scene_l = str(scene or "website").strip().lower() or "website"
    rows = list_prompt_packs(enabled=True, ensure=True)
    lines: list[str] = [
        "提示词节点目录（用 need_prompts: [\"design_spec\", \"vision\", …] 申请正文；"
        "正文来自流程图 kind=prompt 节点）："
    ]
    seen_kind: set[str] = set()
    for r in rows:
        scenes = str(r.get("scenes") or "all")
        if not (_csv_has(scenes, scene_l) or _csv_has(scenes, "all")):
            continue
        kind = str(r.get("kind") or "").strip()
        if not kind or kind in seen_kind:
            continue
        seen_kind.add(kind)
        label = KIND_LABELS.get(kind, kind)
        title = str(r.get("title") or label).strip()
        when = str(r.get("whenToUse") or "").strip()
        line = f"- `{kind}` — {label}·{title}"
        if when:
            line += f"（{when[:64]}）"
        lines.append(line)
        if len(lines) >= 24:
            break
    if len(lines) == 1:
        lines.append("（本场景暂无提示词节点：请在流程设计里添加 kind=提示词 节点）")
    return "\n".join(lines)


def normalize_need_prompts(raw: Any, *, max_n: int = 8) -> list[str]:
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
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        key = str(item or "").strip().lower()
        if not key or key in seen:
            continue
        if key in ("all", "*"):
            return ["*"]
        if key.startswith("scene."):
            key = key[6:]
        if key.startswith("prompt_"):
            key = key[7:]
        seen.add(key)
        out.append(key)
        if len(out) >= max_n:
            break
    return out


def format_prompt_packs_details(*, kinds: list[str], scene: str = "website") -> str:
    scene_l = str(scene or "website").strip().lower() or "website"
    wanted = [str(k).strip().lower() for k in (kinds or []) if str(k).strip()]
    if not wanted:
        return ""
    load_all = "*" in wanted
    wanted_norm = {
        (k[6:] if k.startswith("scene.") else k[7:] if k.startswith("prompt_") else k)
        for k in wanted
        if k != "*"
    }
    rows: list[dict[str, Any]] = []
    seen_kinds: set[str] = set()
    source = list_prompt_packs(enabled=True, ensure=True)
    for r in source:
        kind = str(r.get("kind") or "").strip().lower()
        if not load_all and kind not in wanted_norm:
            continue
        scenes = str(r.get("scenes") or "all")
        if not (_csv_has(scenes, scene_l) or _csv_has(scenes, "all")):
            continue
        if kind in seen_kinds:
            continue
        seen_kinds.add(kind)
        rows.append(r)
        if load_all and len(rows) >= 12:
            break
    return format_prompt_pack_block(rows)
