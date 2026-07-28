"""Admin content listings — projects, assets, follows, likes, plaza feeds."""

from __future__ import annotations

from typing import Any

from services.db import connect, init_schema
from services.plaza.store import list_feed, _row_to_meta
from services.storage import delete_object


def _page_args(page: int = 1, page_size: int = 20, *, max_size: int = 100) -> tuple[int, int, int]:
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 20), max_size))
    offset = (page_n - 1) * page_size_n
    return page_n, page_size_n, offset


def _like_term(q: str | None) -> str | None:
    raw = (q or "").strip()
    return f"%{raw}%" if raw else None


def _ms(ts: Any) -> int:
    return int(float(ts) * 1000)


def _paged(items: list[Any], *, page_n: int, page_size_n: int, total: int) -> dict[str, Any]:
    return {"items": items, "page": page_n, "pageSize": page_size_n, "total": total}


def _empty_feed(page: int, page_size: int, tab_n: str) -> dict[str, Any]:
    page_n, page_size_n, _ = _page_args(page, page_size)
    return {
        "items": [],
        "page": page_n,
        "pageSize": page_size_n,
        "total": 0,
        "hasMore": False,
        "tab": tab_n,
    }


def list_all_projects(
    *,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
) -> dict[str, Any]:
    init_schema()
    page_n, page_size_n, offset = _page_args(page, page_size)
    where = ["1=1"]
    params: list[Any] = []
    like = _like_term(q)
    if like:
        where.append("(p.name LIKE ? OR p.user_id LIKE ? OR u.email LIKE ? OR u.name LIKE ?)")
        params.extend([like, like, like, like])
    where_sql = " AND ".join(where)
    with connect() as conn:
        total_row = conn.execute(
            f"""
            SELECT COUNT(*) AS c
            FROM projects p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE {where_sql}
            """,
            tuple(params),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            f"""
            SELECT p.id, p.user_id, p.name, p.thumbnail_key, p.updated_at, p.created_at,
                   u.email AS user_email, u.name AS user_name
            FROM projects p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE {where_sql}
            ORDER BY p.updated_at DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [page_size_n, offset]),
        ).fetchall()
    items = [
        {
            "id": r["id"],
            "userId": r["user_id"],
            "userEmail": r["user_email"],
            "userName": r["user_name"],
            "name": r["name"],
            "updatedAt": _ms(r["updated_at"]),
            "createdAt": _ms(r["created_at"]),
        }
        for r in rows
    ]
    return _paged(items, page_n=page_n, page_size_n=page_size_n, total=total)


def list_all_assets(
    *,
    page: int = 1,
    page_size: int = 20,
    kind: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    init_schema()
    page_n, page_size_n, offset = _page_args(page, page_size)
    where = ["1=1"]
    params: list[Any] = []
    kind_n = (kind or "").strip().lower()
    if kind_n in ("image", "video", "font"):
        where.append("a.kind = ?")
        params.append(kind_n)
    like = _like_term(q)
    if like:
        where.append("(a.user_id LIKE ? OR a.prompt LIKE ? OR u.email LIKE ?)")
        params.extend([like, like, like])
    where_sql = " AND ".join(where)
    with connect() as conn:
        total_row = conn.execute(
            f"""
            SELECT COUNT(*) AS c
            FROM assets a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE {where_sql}
            """,
            tuple(params),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            f"""
            SELECT a.id, a.user_id, a.kind, a.url, a.source, a.prompt, a.created_at,
                   u.email AS user_email, u.name AS user_name
            FROM assets a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE {where_sql}
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [page_size_n, offset]),
        ).fetchall()
    items = [
        {
            "id": r["id"],
            "userId": r["user_id"],
            "userEmail": r["user_email"],
            "userName": r["user_name"],
            "kind": r["kind"],
            "url": r["url"],
            "source": r["source"],
            "prompt": r["prompt"],
            "createdAt": _ms(r["created_at"]),
        }
        for r in rows
    ]
    return _paged(items, page_n=page_n, page_size_n=page_size_n, total=total)


def delete_asset_admin(asset_id: str) -> bool:
    init_schema()
    aid = (asset_id or "").strip()
    if not aid:
        return False
    with connect() as conn:
        row = conn.execute(
            "SELECT object_key FROM assets WHERE id = ?",
            (aid,),
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM assets WHERE id = ?", (aid,))
        conn.commit()
    if row["object_key"]:
        delete_object(row["object_key"])
    return True


def list_all_likes(
    *,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
) -> dict[str, Any]:
    init_schema()
    page_n, page_size_n, offset = _page_args(page, page_size)
    where = ["1=1"]
    params: list[Any] = []
    like = _like_term(q)
    if like:
        where.append(
            "(l.user_id LIKE ? OR l.submission_id LIKE ? OR s.title LIKE ?"
            " OR u.email LIKE ?)"
        )
        params.extend([like, like, like, like])
    where_sql = " AND ".join(where)
    with connect() as conn:
        total_row = conn.execute(
            f"""
            SELECT COUNT(*) AS c
            FROM plaza_likes l
            LEFT JOIN plaza_submissions s ON s.id = l.submission_id
            LEFT JOIN users u ON u.id = l.user_id
            WHERE {where_sql}
            """,
            tuple(params),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            f"""
            SELECT l.user_id, l.submission_id, l.created_at,
                   s.title AS submission_title, s.author_name, s.status AS submission_status,
                   u.email AS user_email, u.name AS user_name
            FROM plaza_likes l
            LEFT JOIN plaza_submissions s ON s.id = l.submission_id
            LEFT JOIN users u ON u.id = l.user_id
            WHERE {where_sql}
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [page_size_n, offset]),
        ).fetchall()
    items = [
        {
            "userId": r["user_id"],
            "userEmail": r["user_email"],
            "userName": r["user_name"],
            "submissionId": r["submission_id"],
            "submissionTitle": r["submission_title"],
            "authorName": r["author_name"],
            "submissionStatus": r["submission_status"],
            "createdAt": _ms(r["created_at"]),
        }
        for r in rows
    ]
    return _paged(items, page_n=page_n, page_size_n=page_size_n, total=total)


def delete_like_admin(user_id: str, submission_id: str) -> bool:
    init_schema()
    uid = (user_id or "").strip()
    sid = (submission_id or "").strip()
    if not uid or not sid:
        return False
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM plaza_likes WHERE user_id = ? AND submission_id = ?",
            (uid, sid),
        )
        conn.commit()
        deleted = int(getattr(cur, "rowcount", 0) or 0) > 0
    if deleted:
        try:
            from services.plaza.store import sync_like_count

            sync_like_count(sid)
        except Exception:
            pass
    return deleted


def _normalize_admin_feed_tab(tab: str | None) -> str:
    tab_n = (tab or "recommended").strip().lower()
    return tab_n if tab_n in ("recommended", "latest", "following") else "recommended"


def list_plaza_feed_admin(
    *,
    tab: str = "recommended",
    page: int = 1,
    page_size: int = 20,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Approved plaza feed: recommended | latest."""
    tab_n = _normalize_admin_feed_tab(tab)
    if tab_n == "following":
        return _empty_feed(page, page_size, tab_n)
    uid = (user_id or "").strip()
    return list_feed(
        page=page,
        page_size=page_size,
        tab=tab_n,
        author_ids=[uid] if uid else None,
        visible_only=False,
    )


def list_plaza_published(
    *,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
) -> dict[str, Any]:
    """All approved plaza submissions (已发布)."""
    init_schema()
    page_n, page_size_n, offset = _page_args(page, page_size)
    where = ["status = 'approved'"]
    params: list[Any] = []
    like = _like_term(q)
    if like:
        where.append("(title LIKE ? OR author_name LIKE ? OR user_id LIKE ?)")
        params.extend([like, like, like])
    where_sql = " AND ".join(where)
    with connect() as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM plaza_submissions WHERE {where_sql}",
            tuple(params),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            f"""
            SELECT * FROM plaza_submissions
            WHERE {where_sql}
            ORDER BY reviewed_at DESC, updated_at DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [page_size_n, offset]),
        ).fetchall()
    return _paged(
        [_row_to_meta(r) for r in rows],
        page_n=page_n,
        page_size_n=page_size_n,
        total=total,
    )
