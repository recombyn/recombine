"""Email/password users + verification codes — shared MySQL / SQLite."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
import uuid
from dataclasses import dataclass

from config.settings import settings
from services.db import connect, dialect, init_schema

_PBKDF2_ROUNDS = 260_000
_CODE_TTL_SECONDS = 10 * 60
_TICKET_TTL_SECONDS = 15 * 60
_CODE_COOLDOWN_SECONDS = 55


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


@dataclass
class EmailUser:
    id: str
    email: str
    name: str
    avatar: str | None = None
    bio: str | None = None
    provider: str = "email"


def get_user_by_email(email: str) -> EmailUser | None:
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT id, email, name, avatar, bio, provider FROM users WHERE email = ? COLLATE NOCASE",
            (email.strip().lower(),),
        ).fetchone()
    if not row:
        return None
    return EmailUser(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        avatar=row["avatar"],
        bio=row["bio"],
        provider=row["provider"] or "email",
    )


def get_user_by_id(user_id: str) -> EmailUser | None:
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT id, email, name, avatar, bio, provider FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return EmailUser(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        avatar=row["avatar"],
        bio=row["bio"],
        provider=row["provider"] or "email",
    )


def verify_password(email: str, password: str) -> EmailUser | None:
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, email, name, avatar, bio, provider, password_hash, password_salt
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
    return EmailUser(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        avatar=row["avatar"],
        bio=row["bio"],
        provider=row["provider"] or "email",
    )


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


def upsert_oauth_user(
    *,
    user_id: str,
    email: str,
    name: str,
    avatar: str | None,
    provider: str,
    google_sub: str | None = None,
) -> EmailUser:
    """Create or refresh a Google (or other OAuth) user row."""
    init_auth_db()
    email_n = (email or "").strip().lower() or f"{user_id}@oauth.local"
    name_n = (name or "").strip() or email_n.split("@")[0]
    now = time.time()
    with connect() as conn:
        by_id = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        by_sub = None
        if google_sub:
            by_sub = conn.execute(
                "SELECT id FROM users WHERE google_sub = ?", (google_sub,)
            ).fetchone()
        by_email = conn.execute(
            "SELECT id FROM users WHERE email = ? COLLATE NOCASE", (email_n,)
        ).fetchone()
        row = by_id or by_sub or by_email
        if row:
            uid = row["id"]
            conn.execute(
                """
                UPDATE users
                SET email = ?, name = ?, avatar = COALESCE(?, avatar),
                    provider = ?, google_sub = COALESCE(?, google_sub), updated_at = ?
                WHERE id = ?
                """,
                (email_n, name_n, avatar, provider, google_sub, now, uid),
            )
        else:
            uid = user_id
            conn.execute(
                """
                INSERT INTO users (
                    id, email, name, avatar, provider, google_sub, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (uid, email_n, name_n, avatar, provider, google_sub, now, now),
            )
    return EmailUser(
        id=uid, email=email_n, name=name_n, avatar=avatar, provider=provider
    )


def update_profile(
    user_id: str, *, name: str | None = None, bio: str | None = None, avatar: str | None = None
) -> EmailUser | None:
    init_auth_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT id, email, name, avatar, bio, provider FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        next_name = name if name is not None else row["name"]
        next_bio = bio if bio is not None else row["bio"]
        next_avatar = avatar if avatar is not None else row["avatar"]
        conn.execute(
            """
            UPDATE users SET name = ?, bio = ?, avatar = ?, updated_at = ?
            WHERE id = ?
            """,
            (next_name, next_bio, next_avatar, time.time(), user_id),
        )
    return EmailUser(
        id=user_id,
        email=row["email"],
        name=next_name,
        avatar=next_avatar,
        bio=next_bio,
        provider=row["provider"] or "email",
    )


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
