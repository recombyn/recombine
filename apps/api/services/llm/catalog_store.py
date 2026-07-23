"""LLM model catalog - DB-backed with seed fallback."""
from __future__ import annotations

import time
from typing import Any

from services.db import connect, init_schema

_SEED = [
    {
        'id': 'deepseek-v4-flash',
        'label': 'DeepSeek V4 Flash',
        'description': '对话与画布 Agent，可用工具直接改画布',
        'provider': 'doubao',
        'kind': 'text',
        'api_model': 'deepseek-v4-flash-260425',
        'icon_key': 'deepseek',
        'price': '1.0',
        'max_attachments': 8,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 10,
    },
    {
        'id': 'deepseek-v4-pro',
        'label': 'DeepSeek V4 Pro',
        'description': '更强推理与复杂 Agent 任务（方舟 DeepSeek V4 Pro）',
        'provider': 'doubao',
        'kind': 'text',
        'api_model': 'deepseek-v4-pro-260425',
        'icon_key': 'deepseek',
        'price': None,
        'max_attachments': 8,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 11,
    },
    {
        'id': 'glm-5-2',
        'label': 'GLM-5.2',
        'description': '智谱 GLM-5.2（方舟），通用对话与工具调用',
        'provider': 'doubao',
        'kind': 'text',
        'api_model': 'glm-5-2-260617',
        'icon_key': 'glm',
        'price': None,
        'max_attachments': 8,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 12,
    },
    {
        'id': 'kimi-k2-thinking',
        'label': 'Kimi K2 Thinking',
        'description': 'Kimi K2 思考版（方舟），适合复杂推理步骤',
        'provider': 'doubao',
        'kind': 'text',
        'api_model': 'kimi-k2-thinking-251104',
        'icon_key': 'kimi',
        'price': None,
        'max_attachments': 8,
        'thinking': 1,
        'enabled': 1,
        'sort_order': 13,
    },
    {
        'id': 'doubao-seed-2-0-mini',
        'label': '豆包 Seed 2.0 Mini',
        'description': '对话模型，适合文案、排版与创意协作（不支持看图）',
        'provider': 'doubao',
        'kind': 'text',
        'api_model': 'doubao-seed-2-0-mini-260428',
        'icon_key': 'doubao',
        'price': None,
        'max_attachments': 8,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 20,
    },
    {
        'id': 'doubao-seed-2-1-pro',
        'label': '豆包 Seed 2.1 Pro',
        'description': '多模态对话（支持看图）；美学参考 / 用户附图时优先',
        'provider': 'doubao',
        'kind': 'text',
        'api_model': 'doubao-seed-2-1-pro-260628',
        'icon_key': 'doubao',
        'price': None,
        'max_attachments': 16,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 15,
    },
    {
        'id': 'doubao-seed-2-1-turbo',
        'label': '豆包 Seed 2.1 Turbo',
        'description': '多模态对话（支持看图）；更快更省，适合附图轻量步骤',
        'provider': 'doubao',
        'kind': 'text',
        'api_model': 'doubao-seed-2-1-turbo-260628',
        'icon_key': 'doubao',
        'price': None,
        'max_attachments': 16,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 16,
    },
    {
        'id': 'doubao-seedream-5-0-pro',
        'label': '豆包 Seedream 5.0 Pro',
        'description': '高质量文生图 / 图生图',
        'provider': 'doubao',
        'kind': 'image',
        'api_model': 'doubao-seedream-5-0-pro-260628',
        'icon_key': 'doubao',
        'price': None,
        'max_attachments': 14,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 110,
    },
    {
        'id': 'doubao-seedream-5-0-lite',
        'label': '豆包 Seedream 5.0 Lite',
        'description': '轻量文生图 / 图生图',
        'provider': 'doubao',
        'kind': 'image',
        'api_model': 'doubao-seedream-5-0-260128',
        'icon_key': 'doubao',
        'price': None,
        'max_attachments': 14,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 120,
    },
    {
        'id': 'doubao-seedream-4-5',
        'label': '豆包 Seedream 4.5',
        'description': '文生图 / 图生图',
        'provider': 'doubao',
        'kind': 'image',
        'api_model': 'doubao-seedream-4-5-251128',
        'icon_key': 'doubao',
        'price': None,
        'max_attachments': 14,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 130,
    },
    {
        'id': 'doubao-seedream-4-0',
        'label': '豆包 Seedream 4.0',
        'description': '文生图 / 图生图',
        'provider': 'doubao',
        'kind': 'image',
        'api_model': 'doubao-seedream-4-0-250828',
        'icon_key': 'doubao',
        'price': None,
        'max_attachments': 14,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 140,
    },
]


def ensure_llm_models_table(conn: Any, *, mysql: bool) -> None:
    text = 'LONGTEXT' if mysql else 'TEXT'
    if mysql:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS llm_models (
                id VARCHAR(128) PRIMARY KEY,
                label VARCHAR(255) NOT NULL,
                description {text},
                provider VARCHAR(64) NOT NULL DEFAULT 'doubao',
                kind VARCHAR(16) NOT NULL DEFAULT 'text',
                api_model VARCHAR(255) NOT NULL,
                icon_key VARCHAR(64),
                icon_url {text},
                price VARCHAR(255),
                max_attachments INTEGER NOT NULL DEFAULT 8,
                thinking TINYINT NOT NULL DEFAULT 0,
                enabled TINYINT NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 100,
                created_at DOUBLE NOT NULL,
                updated_at DOUBLE NOT NULL,
                KEY idx_llm_models_kind_sort (kind, sort_order, enabled)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
    else:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS llm_models (
                id VARCHAR(128) PRIMARY KEY,
                label VARCHAR(255) NOT NULL,
                description {text},
                provider VARCHAR(64) NOT NULL DEFAULT 'doubao',
                kind VARCHAR(16) NOT NULL DEFAULT 'text',
                api_model VARCHAR(255) NOT NULL,
                icon_key VARCHAR(64),
                icon_url {text},
                price VARCHAR(255),
                max_attachments INTEGER NOT NULL DEFAULT 8,
                thinking INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 100,
                created_at DOUBLE NOT NULL,
                updated_at DOUBLE NOT NULL
            )
            """
        )
        conn.execute(
            'CREATE INDEX IF NOT EXISTS idx_llm_models_kind_sort '
            'ON llm_models(kind, sort_order, enabled)'
        )
    _ensure_price_column(conn, mysql=mysql)
    conn.commit()
    _seed_if_empty(conn)
    _ensure_seed_models(conn)
    _retire_direct_deepseek_models(conn)


def _ensure_price_column(conn: Any, *, mysql: bool) -> None:
    if mysql:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'llm_models'
              AND COLUMN_NAME = 'price'
            """
        ).fetchone()
        if int((row or {}).get('c') or 0) == 0:
            conn.execute('ALTER TABLE llm_models ADD COLUMN price VARCHAR(255) NULL')
    else:
        cols = {str(r['name']) for r in conn.execute('PRAGMA table_info(llm_models)').fetchall()}
        if 'price' not in cols:
            conn.execute('ALTER TABLE llm_models ADD COLUMN price VARCHAR(255)')
    conn.execute(
        """
        UPDATE llm_models
        SET price = ?
        WHERE id = 'deepseek-v4-flash' AND (price IS NULL OR price = '')
        """,
        ('1.0 元/百万tokens',),
    )


_RETIRED_DIRECT_DEEPSEEK_IDS = ('deepseek-chat', 'deepseek-reasoner')


def _retire_direct_deepseek_models(conn: Any) -> None:
    """Disable models that call DeepSeek API directly; routing uses Volcengine Ark only."""
    now = time.time()
    placeholders = ','.join('?' for _ in _RETIRED_DIRECT_DEEPSEEK_IDS)
    conn.execute(
        f"""
        UPDATE llm_models SET enabled = 0, updated_at = ?
        WHERE provider = 'deepseek' OR id IN ({placeholders})
        """,
        (now, *_RETIRED_DIRECT_DEEPSEEK_IDS),
    )
    conn.commit()


def _seed_if_empty(conn: Any) -> None:
    row = conn.execute('SELECT COUNT(*) AS c FROM llm_models').fetchone()
    count = int(row["c"]) if row is not None else 0
    if count > 0:
        return
    now = time.time()
    for m in _SEED:
        conn.execute(
            """
            INSERT INTO llm_models (
                id, label, description, provider, kind, api_model,
                icon_key, icon_url, price, max_attachments, thinking, enabled, sort_order,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                m['id'], m['label'], m['description'], m['provider'], m['kind'],
                m['api_model'], m['icon_key'], m.get('price'), m['max_attachments'], m['thinking'],
                m['enabled'], m['sort_order'], now, now,
            ),
        )
    conn.commit()


def _ensure_seed_models(conn: Any) -> None:
    """Insert any missing official seed rows (does not overwrite admin edits)."""
    now = time.time()
    for m in _SEED:
        row = conn.execute(
            'SELECT id FROM llm_models WHERE id = ?',
            (m['id'],),
        ).fetchone()
        if row:
            # Keep brand icons in sync for known seeds (label/desc remain admin-owned).
            conn.execute(
                'UPDATE llm_models SET icon_key = ?, updated_at = ? WHERE id = ? AND (icon_key IS NULL OR icon_key != ?)',
                (m['icon_key'], now, m['id'], m['icon_key']),
            )
            continue
        conn.execute(
            """
            INSERT INTO llm_models (
                id, label, description, provider, kind, api_model,
                icon_key, icon_url, price, max_attachments, thinking, enabled, sort_order,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                m['id'], m['label'], m['description'], m['provider'], m['kind'],
                m['api_model'], m['icon_key'], m.get('price'), m['max_attachments'], m['thinking'],
                m['enabled'], m['sort_order'], now, now,
            ),
        )
    conn.commit()


def _pub(r: Any) -> dict[str, Any]:
    price_raw = r['price'] if 'price' in r.keys() else None
    return {
        'id': r['id'],
        'label': r['label'],
        'description': r['description'] or None,
        'provider': r['provider'] or 'doubao',
        'kind': r['kind'] or 'text',
        'api_model': r['api_model'],
        'apiModel': r['api_model'],
        'iconKey': r['icon_key'] or None,
        'iconUrl': r['icon_url'] or None,
        'price': (str(price_raw).strip() if price_raw else None),
        'max_attachments': int(r['max_attachments'] or 8),
        'maxAttachments': int(r['max_attachments'] or 8),
        'thinking': bool(int(r['thinking'] or 0)),
        'enabled': bool(int(r['enabled'] or 0)),
        'sortOrder': int(r['sort_order'] or 100),
        'createdAt': int(float(r['created_at']) * 1000) if r['created_at'] else None,
        'updatedAt': int(float(r['updated_at']) * 1000) if r['updated_at'] else None,
    }


def list_catalog(*, kind: str | None = None, enabled_only: bool = True) -> list[dict[str, Any]]:
    init_schema()
    where = ['1=1']
    params: list[Any] = []
    k = (kind or '').strip().lower()
    if k in ('text', 'image'):
        where.append('kind = ?')
        params.append(k)
    if enabled_only:
        where.append('enabled = 1')
    sql = (
        'SELECT * FROM llm_models WHERE '
        + ' AND '.join(where)
        + ' ORDER BY sort_order ASC, updated_at DESC'
    )
    with connect() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [_pub(r) for r in rows]


def list_admin_models(*, kind: str | None = None, q: str | None = None) -> list[dict[str, Any]]:
    init_schema()
    where = ['1=1']
    params: list[Any] = []
    k = (kind or '').strip().lower()
    if k in ('text', 'image'):
        where.append('kind = ?')
        params.append(k)
    if q and q.strip():
        like = f'%{q.strip()}%'
        where.append('(id LIKE ? OR label LIKE ? OR api_model LIKE ? OR provider LIKE ?)')
        params.extend([like, like, like, like])
    sql = (
        'SELECT * FROM llm_models WHERE '
        + ' AND '.join(where)
        + ' ORDER BY sort_order ASC, updated_at DESC'
    )
    with connect() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [_pub(r) for r in rows]


def get_model(model_id: str) -> dict[str, Any] | None:
    init_schema()
    mid = (model_id or '').strip()
    if not mid:
        return None
    with connect() as conn:
        row = conn.execute('SELECT * FROM llm_models WHERE id = ?', (mid,)).fetchone()
    return _pub(row) if row else None


def upsert_model(payload: dict[str, Any]) -> dict[str, Any]:
    init_schema()
    mid = str(payload.get('id') or '').strip()
    if not mid:
        raise ValueError('id required')
    label = str(payload.get('label') or mid).strip()
    kind = str(payload.get('kind') or 'text').strip().lower()
    if kind not in ('text', 'image'):
        raise ValueError('kind must be text|image')
    provider = str(payload.get('provider') or 'doubao').strip() or 'doubao'
    api_model = str(payload.get('apiModel') or payload.get('api_model') or mid).strip()
    description = payload.get('description')
    icon_key = payload.get('iconKey') or payload.get('icon_key')
    icon_url = payload.get('iconUrl') or payload.get('icon_url')
    price_raw = payload.get('price')
    price = (str(price_raw).strip() if price_raw is not None else '') or None
    max_attachments = int(payload.get('maxAttachments') or payload.get('max_attachments') or 8)
    thinking = 1 if payload.get('thinking') else 0
    enabled = 1 if payload.get('enabled', True) else 0
    sort_order = int(payload.get('sortOrder') or payload.get('sort_order') or 100)
    now = time.time()
    with connect() as conn:
        existing = conn.execute('SELECT id FROM llm_models WHERE id = ?', (mid,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE llm_models SET
                  label=?, description=?, provider=?, kind=?, api_model=?,
                  icon_key=?, icon_url=?, price=?, max_attachments=?, thinking=?,
                  enabled=?, sort_order=?, updated_at=?
                WHERE id=?
                """,
                (
                    label, description, provider, kind, api_model,
                    icon_key, icon_url, price, max_attachments, thinking,
                    enabled, sort_order, now, mid,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO llm_models (
                    id, label, description, provider, kind, api_model,
                    icon_key, icon_url, price, max_attachments, thinking, enabled, sort_order,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mid, label, description, provider, kind, api_model,
                    icon_key, icon_url, price, max_attachments, thinking, enabled, sort_order,
                    now, now,
                ),
            )
        conn.commit()
    item = get_model(mid)
    if not item:
        raise RuntimeError('upsert failed')
    return item


def delete_model(model_id: str) -> bool:
    init_schema()
    mid = (model_id or '').strip()
    if not mid:
        return False
    with connect() as conn:
        cur = conn.execute('DELETE FROM llm_models WHERE id = ?', (mid,))
        conn.commit()
        return int(getattr(cur, 'rowcount', 0) or 0) > 0

