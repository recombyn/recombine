"""Email/password users + verification codes — shared MySQL / SQLite."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Any

from config.settings import settings
from services.db import connect, dialect, init_schema

_PBKDF2_ROUNDS = 260_000
_CODE_TTL_SECONDS = 10 * 60
_TICKET_TTL_SECONDS = 15 * 60
_CODE_COOLDOWN_SECONDS = 55
_ACTIVATE_TTL_SECONDS = 48 * 60 * 60
_ACTIVATE_COOLDOWN_SECONDS = 55


def init_auth_db() -> None:
    init_schema()


def _hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _PBKDF2_ROUNDS,
    )
    return digest.hex()


def hash_code(email: str, code: str) -> str:
    material = f"{email.strip().lower()}|{code.strip()}|{(settings.card_key_salt or 'ses-code')}".encode()
    return hashlib.sha256(material).hexdigest()


_USER_COLS = (
    "id, email, name, avatar, default_avatar, bio, provider, role, status"
)


@dataclass
class EmailUser:
    id: str
    email: str
    name: str
    """Effective display URL: custom upload, else OAuth/default."""
    avatar: str | None = None
    avatar_custom: str | None = None
    default_avatar: str | None = None
    bio: str | None = None
    provider: str = "email"
    role: str = "user"
    status: str = "active"


def _row_get(row: Any, key: str, default: Any = None) -> Any:
    try:
        if key not in row.keys():
            return default
    except Exception:
        return default
    val = row[key]
    return default if val is None else val


def _effective_avatar(custom: Any, default: Any) -> str | None:
    c = str(custom or "").strip()
    if c:
        return c
    d = str(default or "").strip()
    return d or None


def _user_from_row(row: Any) -> EmailUser:
    custom = _row_get(row, "avatar")
    default = _row_get(row, "default_avatar")
    return EmailUser(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        avatar=_effective_avatar(custom, default),
        avatar_custom=str(custom).strip() if custom else None,
        default_avatar=str(default).strip() if default else None,
        bio=_row_get(row, "bio"),
        provider=(_row_get(row, "provider") or "email"),
        role=(_row_get(row, "role") or "user"),
        status=(_row_get(row, "status") or "active"),
    )


def get_user_by_email(email: str) -> EmailUser | None:
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT id, email, name, avatar, default_avatar, bio, provider, role, status FROM users WHERE email = ? COLLATE NOCASE",
            (email.strip().lower(),),
        ).fetchone()
    if not row:
        return None
    return _user_from_row(row)


def get_user_by_id(user_id: str) -> EmailUser | None:
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT id, email, name, avatar, default_avatar, bio, provider, role, status FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return _user_from_row(row)


def verify_password(email: str, password: str) -> EmailUser | None:
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, email, name, avatar, default_avatar, bio, provider, role, status,
                   password_hash, password_salt
            FROM users WHERE email = ? COLLATE NOCASE
            """,
            (email.strip().lower(),),
        ).fetchone()
    if not row or not row["password_hash"] or not row["password_salt"]:
        return None
    expected = row["password_hash"]
    actual = _hash_password(password, row["password_salt"])
    if not hmac.compare_digest(expected, actual):
        return None
    return _user_from_row(row)


def update_password(user_id: str, password: str) -> EmailUser | None:
    """Set a new password hash for an existing user. Returns None if missing."""
    init_auth_db()
    salt = secrets.token_hex(16)
    pw_hash = _hash_password(password, salt)
    now = time.time()
    with connect() as conn:
        row = conn.execute(
            "SELECT id, email, name, avatar, default_avatar, bio, provider, role, status FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            """
            UPDATE users
            SET password_hash = ?, password_salt = ?, updated_at = ?, provider = 'email'
            WHERE id = ?
            """,
            (pw_hash, salt, now, user_id),
        )
    return _user_from_row(row)


def change_password(user_id: str, current_password: str, new_password: str) -> EmailUser:
    """Verify current password then set a new one. Raises ValueError on failure."""
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, email, name, avatar, default_avatar, bio, provider, role, status,
                   password_hash, password_salt
            FROM users WHERE id = ?
            """,
            (user_id,),
        ).fetchone()
    if not row or not row["password_hash"] or not row["password_salt"]:
        raise ValueError("no_password")
    actual = _hash_password(current_password, row["password_salt"])
    if not hmac.compare_digest(row["password_hash"], actual):
        raise ValueError("bad_current")
    updated = update_password(user_id, new_password)
    if not updated:
        raise ValueError("not_found")
    return updated


def reset_password_by_email(email: str, password: str) -> EmailUser | None:
    """Update password for an existing email user (after ticket consume)."""
    init_auth_db()
    email_n = email.strip().lower()
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE email = ? COLLATE NOCASE",
            (email_n,),
        ).fetchone()
    if not row:
        return None
    return update_password(row["id"], password)


def upsert_user(*, email: str, password: str, name: str) -> EmailUser:
    init_auth_db()
    email_n = email.strip().lower()
    name_n = (name or "").strip() or email_n.split("@")[0]
    salt = secrets.token_hex(16)
    pw_hash = _hash_password(password, salt)
    now = time.time()
    with connect() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ? COLLATE NOCASE",
            (email_n,),
        ).fetchone()
        if existing:
            uid = existing["id"]
            conn.execute(
                """
                UPDATE users
                SET name = ?, password_hash = ?, password_salt = ?, updated_at = ?, provider = 'email'
                WHERE id = ?
                """,
                (name_n, pw_hash, salt, now, uid),
            )
        else:
            uid = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO users (
                    id, email, name, provider, password_hash, password_salt, created_at, updated_at
                ) VALUES (?, ?, ?, 'email', ?, ?, ?, ?)
                """,
                (uid, email_n, name_n, pw_hash, salt, now, now),
            )
    return EmailUser(id=uid, email=email_n, name=name_n, provider="email")



def ensure_email_user(*, email: str) -> EmailUser:
    """Find or create a passwordless email user (verification-code login)."""
    init_auth_db()
    email_n = email.strip().lower()
    name_n = email_n.split("@")[0] if "@" in email_n else email_n
    now = time.time()
    with connect() as conn:
        existing = conn.execute(
            "SELECT id, email, name, avatar, default_avatar, bio, provider, role, status FROM users WHERE email = ? COLLATE NOCASE",
            (email_n,),
        ).fetchone()
        if existing:
            return _user_from_row(existing)
        uid = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO users (
                id, email, name, provider, created_at, updated_at
            ) VALUES (?, ?, ?, 'email', ?, ?)
            """,
            (uid, email_n, name_n, now, now),
        )
    return EmailUser(id=uid, email=email_n, name=name_n, provider="email")


def _is_oauth_placeholder_avatar(url: str | None) -> bool:
    low = (url or "").strip().lower()
    if not low:
        return True
    if "googleusercontent.com" in low and "/a/default" in low:
        return True
    if "ggpht.com" in low and "/a/default" in low:
        return True
    return False


def _is_hosted_avatar_url(url: str | None) -> bool:
    """True when URL is already on our upload/COS avatar path."""
    raw = (url or "").strip().lower()
    if not raw:
        return False
    if "/avatars/" not in raw and not raw.startswith("avatars/"):
        return False
    return (
        raw.startswith("avatars/")
        or "/api/v1/uploads/files/avatars/" in raw
        or "myqcloud.com" in raw
        or "amazonaws.com" in raw
        or "cos." in raw
    )


def _rehost_remote_avatar(
    user_id: str, url: str, *, prev_avatar: str | None = None
) -> str | None:
    """Download a remote avatar and store under avatars/{user_id}/."""
    raw = (url or "").strip()
    if not raw.startswith("http://") and not raw.startswith("https://"):
        return None
    if _is_oauth_placeholder_avatar(raw):
        return None
    if _is_hosted_avatar_url(raw):
        return raw[:2048]
    try:
        import httpx

        from services.storage import get_storage, put_bytes

        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            resp = client.get(
                raw,
                headers={"User-Agent": "RecombynAvatarBot/1.0"},
            )
            if resp.status_code >= 400:
                return None
            blob = resp.content or b""
            if not blob or len(blob) > 2_500_000:
                return None
            ctype = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
            if ctype and not ctype.startswith("image/"):
                return None
            if "webp" in ctype or raw.lower().endswith(".webp"):
                ext, content_type = "webp", "image/webp"
            elif "png" in ctype or raw.lower().endswith(".png"):
                ext, content_type = "png", "image/png"
            elif "gif" in ctype or raw.lower().endswith(".gif"):
                ext, content_type = "gif", "image/gif"
            else:
                ext, content_type = "jpg", "image/jpeg"
        stamp = int(time.time() * 1000)
        key = f"avatars/{user_id}/default-{stamp}.{ext}"
        put_bytes(
            key,
            blob,
            content_type=content_type,
            cache_control="public, max-age=31536000, immutable",
        )
        storage = get_storage()
        out = storage.url_for(key)
        if not storage.enabled_remote():
            out = f"/api/v1/uploads/files/{key}"
        if prev_avatar and prev_avatar != out and _is_hosted_avatar_url(prev_avatar):
            _maybe_delete_avatar_object(prev_avatar)
        return out
    except Exception:
        return None


def upsert_oauth_user(
    *,
    user_id: str,
    email: str,
    name: str,
    avatar: str | None,
    provider: str,
    google_sub: str | None = None,
) -> EmailUser:
    """
    Create or refresh a Google (or other OAuth) user row.

    - ``avatar`` column = user-uploaded custom photo (never overwritten by OAuth)
    - ``default_avatar`` = OAuth/Google picture (rehosted to our storage when possible)
    Display uses custom first, else default.
    """
    init_auth_db()
    email_n = (email or "").strip().lower() or f"{user_id}@oauth.local"
    name_n = (name or "").strip() or email_n.split("@")[0]
    now = time.time()
    oauth_pic = (avatar or "").strip() or None
    if oauth_pic and _is_oauth_placeholder_avatar(oauth_pic):
        oauth_pic = None

    with connect() as conn:
        by_id = conn.execute(
            f"SELECT {_USER_COLS} FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        by_sub = None
        if google_sub:
            by_sub = conn.execute(
                f"SELECT {_USER_COLS} FROM users WHERE google_sub = ?",
                (google_sub,),
            ).fetchone()
        by_email = conn.execute(
            f"SELECT {_USER_COLS} FROM users WHERE email = ? COLLATE NOCASE",
            (email_n,),
        ).fetchone()
        row = by_id or by_sub or by_email
        if row:
            uid = str(row["id"])
            custom = _row_get(row, "avatar")
            prev_default = _row_get(row, "default_avatar")
            next_default = prev_default
            # Refresh default from OAuth when missing, still remote, or placeholder.
            needs_default = (
                not prev_default
                or _is_oauth_placeholder_avatar(str(prev_default))
                or (
                    str(prev_default).startswith("http")
                    and not _is_hosted_avatar_url(str(prev_default))
                )
            )
            if oauth_pic and needs_default:
                hosted = _rehost_remote_avatar(
                    uid, oauth_pic, prev_avatar=str(prev_default or "") or None
                )
                next_default = hosted or oauth_pic
            elif oauth_pic and not prev_default:
                hosted = _rehost_remote_avatar(uid, oauth_pic, prev_avatar=None)
                next_default = hosted or oauth_pic

            conn.execute(
                """
                UPDATE users
                SET email = ?,
                    provider = ?,
                    google_sub = COALESCE(?, google_sub),
                    default_avatar = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (email_n, provider, google_sub, next_default, now, uid),
            )
            return EmailUser(
                id=uid,
                email=email_n,
                name=row["name"] or name_n,
                avatar=_effective_avatar(custom, next_default),
                avatar_custom=str(custom).strip() if custom else None,
                default_avatar=str(next_default).strip() if next_default else None,
                bio=_row_get(row, "bio"),
                provider=provider or (_row_get(row, "provider") or "email"),
                role=(_row_get(row, "role") or "user"),
                status=(_row_get(row, "status") or "active"),
            )

        uid = user_id
        next_default = None
        if oauth_pic:
            next_default = _rehost_remote_avatar(uid, oauth_pic, prev_avatar=None) or oauth_pic
        conn.execute(
            """
            INSERT INTO users (
                id, email, name, avatar, default_avatar, provider, google_sub,
                created_at, updated_at
            ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
            """,
            (uid, email_n, name_n, next_default, provider, google_sub, now, now),
        )
    return EmailUser(
        id=uid,
        email=email_n,
        name=name_n,
        avatar=next_default,
        avatar_custom=None,
        default_avatar=next_default,
        provider=provider,
    )


def update_profile(
    user_id: str, *, name: str | None = None, bio: str | None = None, avatar: str | None = None
) -> EmailUser | None:
    """Update profile. ``avatar`` only changes the custom upload field."""
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            f"SELECT {_USER_COLS} FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        next_name = name if name is not None else row["name"]
        next_bio = bio if bio is not None else _row_get(row, "bio")
        prev_custom = _row_get(row, "avatar")
        default = _row_get(row, "default_avatar")
        if avatar is None:
            next_custom = prev_custom
        else:
            next_custom = _persist_avatar(user_id, avatar, prev_avatar=prev_custom)
        conn.execute(
            """
            UPDATE users SET name = ?, bio = ?, avatar = ?, updated_at = ?
            WHERE id = ?
            """,
            (next_name, next_bio, next_custom, time.time(), user_id),
        )
    return _user_from_row(
        {
            **{k: row[k] for k in row.keys()},
            "name": next_name,
            "bio": next_bio,
            "avatar": next_custom,
            "default_avatar": default,
        }
    )


def _persist_avatar(user_id: str, avatar: str, *, prev_avatar: str | None) -> str | None:
    """Store custom avatar as COS/local URL — never keep raw data: URLs in users.avatar."""
    raw = (avatar or "").strip()
    if not raw:
        _maybe_delete_avatar_object(prev_avatar)
        return None
    if raw.startswith("http://") or raw.startswith("https://"):
        if _is_hosted_avatar_url(raw):
            return raw[:2048]
        # Treat remote URL as a custom upload source — rehost into avatars/.
        hosted = _rehost_remote_avatar(user_id, raw, prev_avatar=prev_avatar)
        return hosted or raw[:2048]
    if raw.startswith("/api/"):
        return raw[:2048]
    if not raw.startswith("data:image/"):
        return prev_avatar

    try:
        import base64

        from services.storage import get_storage, put_bytes

        header, b64 = raw.split(",", 1)
        h = header.lower()
        if "webp" in h:
            ext, content_type = "webp", "image/webp"
        elif "png" in h:
            ext, content_type = "png", "image/png"
        elif "gif" in h:
            ext, content_type = "gif", "image/gif"
        else:
            ext, content_type = "jpg", "image/jpeg"
        blob = base64.b64decode(b64, validate=False)
        if len(blob) > 2_500_000:
            raise ValueError("avatar too large")
        stamp = int(time.time() * 1000)
        key = f"avatars/{user_id}/avatar-{stamp}.{ext}"
        put_bytes(
            key,
            blob,
            content_type=content_type,
            cache_control="public, max-age=31536000, immutable",
        )
        storage = get_storage()
        url = storage.url_for(key)
        if not storage.enabled_remote():
            url = f"/api/v1/uploads/files/{key}"
        _maybe_delete_avatar_object(prev_avatar)
        return url
    except Exception:
        return prev_avatar


def _maybe_delete_avatar_object(url: str | None) -> None:
    raw = (url or "").strip()
    if not raw:
        return
    key = ""
    marker = "/avatars/"
    if marker in raw:
        key = "avatars/" + raw.split(marker, 1)[1].split("?", 1)[0]
    elif raw.startswith("avatars/"):
        key = raw.split("?", 1)[0]
    elif "/api/v1/uploads/files/avatars/" in raw:
        key = raw.split("/api/v1/uploads/files/", 1)[1].split("?", 1)[0]
    if not key.startswith("avatars/"):
        return
    try:
        from services.storage import delete_object

        delete_object(key)
    except Exception:
        pass


def heal_avatar_if_data_url(user: EmailUser) -> EmailUser:
    """One-shot migrate legacy base64 custom avatars out of the users table."""
    raw = (user.avatar_custom or user.avatar or "").strip()
    if not raw.startswith("data:image/"):
        return user
    updated = update_profile(user.id, avatar=raw)
    return updated or user


def can_send_code(email: str) -> tuple[bool, float]:
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT sent_at FROM email_codes WHERE email = ? COLLATE NOCASE",
            (email.strip().lower(),),
        ).fetchone()
    if not row:
        return True, 0
    elapsed = time.time() - float(row["sent_at"])
    if elapsed >= _CODE_COOLDOWN_SECONDS:
        return True, 0
    return False, max(1.0, _CODE_COOLDOWN_SECONDS - elapsed)


def store_code(email: str, code: str) -> None:
    init_auth_db()
    email_n = email.strip().lower()
    now = time.time()
    with connect() as conn:
        if dialect() == "mysql":
            conn.execute(
                """
                INSERT INTO email_codes (email, code_hash, expires_at, sent_at, attempts)
                VALUES (?, ?, ?, ?, 0)
                ON DUPLICATE KEY UPDATE
                  code_hash = VALUES(code_hash),
                  expires_at = VALUES(expires_at),
                  sent_at = VALUES(sent_at),
                  attempts = 0
                """,
                (email_n, hash_code(email_n, code), now + _CODE_TTL_SECONDS, now),
            )
        else:
            conn.execute(
                """
                INSERT INTO email_codes (email, code_hash, expires_at, sent_at, attempts)
                VALUES (?, ?, ?, ?, 0)
                ON CONFLICT(email) DO UPDATE SET
                  code_hash = excluded.code_hash,
                  expires_at = excluded.expires_at,
                  sent_at = excluded.sent_at,
                  attempts = 0
                """,
                (email_n, hash_code(email_n, code), now + _CODE_TTL_SECONDS, now),
            )


def verify_and_issue_ticket(email: str, code: str) -> str:
    init_auth_db()
    email_n = email.strip().lower()
    code_n = code.strip()
    with connect() as conn:
        row = conn.execute(
            "SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = ? COLLATE NOCASE",
            (email_n,),
        ).fetchone()
        if not row:
            raise ValueError("code_missing")
        if float(row["expires_at"]) < time.time():
            conn.execute("DELETE FROM email_codes WHERE email = ? COLLATE NOCASE", (email_n,))
            raise ValueError("code_expired")
        attempts = int(row["attempts"] or 0)
        if attempts >= 8:
            raise ValueError("code_locked")
        ok = hmac.compare_digest(row["code_hash"], hash_code(email_n, code_n))
        if not ok:
            conn.execute(
                "UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? COLLATE NOCASE",
                (email_n,),
            )
            raise ValueError("code_invalid")
        conn.execute("DELETE FROM email_codes WHERE email = ? COLLATE NOCASE", (email_n,))
        ticket = secrets.token_urlsafe(24)
        conn.execute(
            "INSERT INTO email_tickets (ticket, email, expires_at) VALUES (?, ?, ?)",
            (ticket, email_n, time.time() + _TICKET_TTL_SECONDS),
        )
        return ticket


def consume_ticket(email: str, ticket: str) -> bool:
    init_auth_db()
    email_n = email.strip().lower()
    with connect() as conn:
        row = conn.execute(
            "SELECT email, expires_at FROM email_tickets WHERE ticket = ?",
            (ticket,),
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM email_tickets WHERE ticket = ?", (ticket,))
        if float(row["expires_at"]) < time.time():
            return False
        return str(row["email"]).lower() == email_n


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def display_name_for_email(email: str) -> str:
    """Greeting for SES {{username}} — profile name, else local-part."""
    email_n = email.strip().lower()
    user = get_user_by_email(email_n)
    name = (user.name or "").strip() if user else ""
    if name and "@" not in name:
        return name
    local = email_n.split("@", 1)[0].strip()
    return local or "there"


def can_send_activate_link(email: str) -> tuple[bool, float]:
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT created_at FROM email_activate_tokens
            WHERE email = ? COLLATE NOCASE
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (email.strip().lower(),),
        ).fetchone()
    if not row:
        return True, 0
    elapsed = time.time() - float(row["created_at"])
    if elapsed >= _ACTIVATE_COOLDOWN_SECONDS:
        return True, 0
    return False, max(1.0, _ACTIVATE_COOLDOWN_SECONDS - elapsed)


def create_activate_token(email: str) -> str:
    """One-time login token for SES template {{id}} (48h)."""
    init_auth_db()
    email_n = email.strip().lower()
    now = time.time()
    token_id = secrets.token_urlsafe(24)
    with connect() as conn:
        # Drop prior unused links for this email (newest wins).
        conn.execute(
            "DELETE FROM email_activate_tokens WHERE email = ? COLLATE NOCASE",
            (email_n,),
        )
        conn.execute(
            """
            INSERT INTO email_activate_tokens (token_id, email, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (token_id, email_n, now + _ACTIVATE_TTL_SECONDS, now),
        )
    return token_id


def consume_activate_token(token_id: str) -> str:
    """Consume one-time link. Returns email or raises ValueError."""
    init_auth_db()
    tid = (token_id or "").strip()
    if not tid:
        raise ValueError("link_invalid")
    with connect() as conn:
        row = conn.execute(
            "SELECT email, expires_at FROM email_activate_tokens WHERE token_id = ?",
            (tid,),
        ).fetchone()
        if not row:
            raise ValueError("link_invalid")
        conn.execute("DELETE FROM email_activate_tokens WHERE token_id = ?", (tid,))
        if float(row["expires_at"]) < time.time():
            raise ValueError("link_expired")
        return str(row["email"]).strip().lower()
