"""Admin content listings — projects, assets, follows, likes, plaza feeds."""

from __future__ import annotations

from typing import Any

from services.db import connect, init_schema
from services.plaza.store import list_feed, _row_to_meta
from services.storage import delete_object


def list_all_projects(
    *,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
) -> dict[str, Any]:
    init_schema()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 20), 100))
    offset = (page_n - 1) * page_size_n
    where = ["1=1"]
    params: list[Any] = []
    if q and q.strip():
        like = f"%{q.strip()}%"
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
            "updatedAt": int(float(r["updated_at"]) * 1000),
            "createdAt": int(float(r["created_at"]) * 1000),
        }
        for r in rows
    ]
    return {"items": items, "page": page_n, "pageSize": page_size_n, "total": total}


def delete_project_admin(project_id: str) -> bool:
    init_schema()
    pid = (project_id or "").strip()
    if not pid:
        return False
    with connect() as conn:
        row = conn.execute(
            "SELECT document_key, thumbnail_key FROM projects WHERE id = ?",
            (pid,),
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
        conn.commit()
    if row["document_key"]:
        delete_object(row["document_key"])
    if row["thumbnail_key"]:
        delete_object(row["thumbnail_key"])
    return True


def list_all_assets(
    *,
    page: int = 1,
    page_size: int = 20,
    kind: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    init_schema()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 20), 100))
    offset = (page_n - 1) * page_size_n
    where = ["1=1"]
    params: list[Any] = []
    kind_n = (kind or "").strip().lower()
    if kind_n in ("image", "video", "font"):
        where.append("a.kind = ?")
        params.append(kind_n)
    if q and q.strip():
        like = f"%{q.strip()}%"
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
            "createdAt": int(float(r["created_at"]) * 1000),
        }
        for r in rows
    ]
    return {"items": items, "page": page_n, "pageSize": page_size_n, "total": total}


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
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 20), 100))
    offset = (page_n - 1) * page_size_n
    where = ["1=1"]
    params: list[Any] = []
    if q and q.strip():
        like = f"%{q.strip()}%"
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
            "createdAt": int(float(r["created_at"]) * 1000),
        }
        for r in rows
    ]
    return {"items": items, "page": page_n, "pageSize": page_size_n, "total": total}


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


def list_plaza_feed_admin(
    *,
    tab: str = "recommended",
    page: int = 1,
    page_size: int = 20,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Approved plaza feed: recommended | latest."""
    tab_n = (tab or "recommended").strip().lower()
    if tab_n not in ("recommended", "latest", "following"):
        tab_n = "recommended"
    author_ids: list[str] | None = None
    if tab_n == "following":
        return {
            "items": [],
            "page": max(1, int(page or 1)),
            "pageSize": max(1, min(int(page_size or 20), 100)),
            "total": 0,
            "hasMore": False,
            "tab": tab_n,
        }
    uid = (user_id or "").strip()
    if uid:
        author_ids = [uid]
    return list_feed(
        page=page,
        page_size=page_size,
        tab=tab_n,
        author_ids=author_ids,
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
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 20), 100))
    offset = (page_n - 1) * page_size_n
    where = ["status = 'approved'"]
    params: list[Any] = []
    if q and q.strip():
        like = f"%{q.strip()}%"
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
    return {
        "items": [_row_to_meta(r) for r in rows],
        "page": page_n,
        "pageSize": page_size_n,
        "total": total,
    }
