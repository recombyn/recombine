"""Card-key generation, hashing, and redemption.

Pipeline:
  1. Local random plaintext (xxxxx-xxxxx, no ambiguous chars)
  2. hash = SHA256(plaintext + salt)
  3. DB stores hash + tokens + status + expires_at (never plaintext)
  4. Redeem: hash(submitted + salt) → lookup → check status/expiry → credit tokens
"""

from __future__ import annotations

import hashlib
import secrets
import time
from typing import Any

from config.settings import settings
from services.wallet.db import connect, init_wallet_db

# Exclude 0/O, 1/I/L — reduce mistype / OCR confusion.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_SEG_LEN = 5


def normalize_card_key(raw: str) -> str:
    """Uppercase; keep alnum; format as XXXXX-XXXXX when length is 10."""
    chars = "".join(ch for ch in (raw or "").upper() if ch.isalnum())
    if len(chars) == _SEG_LEN * 2:
        return f"{chars[:_SEG_LEN]}-{chars[_SEG_LEN:]}"
    # Already dashed input: take first two 5-char segments if present.
    parts = [p for p in (raw or "").upper().replace(" ", "").split("-") if p]
    if len(parts) >= 2 and len(parts[0]) == _SEG_LEN and len(parts[1]) == _SEG_LEN:
        return f"{parts[0]}-{parts[1]}"
    return (raw or "").strip().upper()


def generate_plaintext_key() -> str:
    a = "".join(secrets.choice(_ALPHABET) for _ in range(_SEG_LEN))
    b = "".join(secrets.choice(_ALPHABET) for _ in range(_SEG_LEN))
    return f"{a}-{b}"


def hash_card_key(plaintext: str, salt: str | None = None) -> str:
    key = normalize_card_key(plaintext)
    use_salt = salt if salt is not None else (settings.card_key_salt or "")
    payload = f"{key}{use_salt}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def insert_card_keys(
    *,
    plaintexts: list[str],
    tokens: int,
    expires_at: float | None,
) -> int:
    """Insert hashes for generated keys. Returns number inserted."""
    if tokens <= 0:
        raise ValueError("tokens must be > 0")
    init_wallet_db()
    now = time.time()
    inserted = 0
    with connect() as conn:
        for plain in plaintexts:
            digest = hash_card_key(plain)
            try:
                conn.execute(
                    """
                    INSERT INTO card_keys (key_hash, tokens, status, expires_at, created_at)
                    VALUES (?, ?, 'unused', ?, ?)
                    """,
                    (digest, int(tokens), expires_at, now),
                )
                inserted += 1
            except Exception:
                # Duplicate hash (astronomically rare) — skip.
                continue
        conn.commit()
    return inserted


def generate_card_keys(
    *,
    count: int,
    tokens: int,
    expires_days: int = 0,
) -> list[dict[str, Any]]:
    """Generate unique keys, hash+store, return plaintext rows once (with ids)."""
    if count <= 0 or count > 500:
        raise ValueError("count must be 1..500")
    if tokens <= 0:
        raise ValueError("tokens must be > 0")
    if not (settings.card_key_salt or "").strip():
        raise ValueError("CARD_KEY_SALT is not configured")

    expires_at = None
    if expires_days and expires_days > 0:
        expires_at = time.time() + expires_days * 86400

    plaintexts: list[str] = []
    seen: set[str] = set()
    while len(plaintexts) < count:
        k = generate_plaintext_key()
        if k in seen:
            continue
        seen.add(k)
        plaintexts.append(k)

    init_wallet_db()
    now = time.time()
    rows: list[dict[str, Any]] = []
    with connect() as conn:
        for plain in plaintexts:
            digest = hash_card_key(plain)
            try:
                cur = conn.execute(
                    """
                    INSERT INTO card_keys (key_hash, tokens, status, expires_at, created_at)
                    VALUES (?, ?, 'unused', ?, ?)
                    """,
                    (digest, int(tokens), expires_at, now),
                )
                rows.append(
                    {
                        "id": str(cur.lastrowid),
                        "code": plain,
                        "tokens": int(tokens),
                        "status": "unused",
                        "createdAt": now,
                        "expiresAt": expires_at,
                        "redeemedAt": None,
                    }
                )
            except Exception:
                continue
        conn.commit()
    return rows


def list_card_keys(*, status: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    """List card keys for admin (no plaintext — only hashes stored)."""
    init_wallet_db()
    lim = max(1, min(int(limit or 200), 500))
    with connect() as conn:
        if status in ("unused", "used", "revoked"):
            cur = conn.execute(
                """
                SELECT id, tokens, status, expires_at, created_at, redeemed_at
                FROM card_keys
                WHERE status = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (status, lim),
            )
        else:
            cur = conn.execute(
                """
                SELECT id, tokens, status, expires_at, created_at, redeemed_at
                FROM card_keys
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (lim,),
            )
        out: list[dict[str, Any]] = []
        for row in cur.fetchall():
            out.append(
                {
                    "id": str(row["id"]),
                    "code": None,
                    "tokens": int(row["tokens"]),
                    "status": row["status"],
                    "createdAt": float(row["created_at"]),
                    "expiresAt": float(row["expires_at"]) if row["expires_at"] is not None else None,
                    "redeemedAt": float(row["redeemed_at"]) if row["redeemed_at"] is not None else None,
                }
            )
        return out


class RedeemError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def redeem_card_key(user_id: str, plaintext: str) -> dict[str, Any]:
    """Atomically redeem a key and credit the user. Raises RedeemError on failure."""
    init_wallet_db()
    key = normalize_card_key(plaintext)
    if len(key.replace("-", "")) != _SEG_LEN * 2 or key.count("-") != 1:
        raise RedeemError("invalid_format", "Invalid card key format")

    digest = hash_card_key(key)
    now = time.time()

    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                """
                SELECT id, tokens, status, expires_at
                FROM card_keys
                WHERE key_hash = ?
                """,
                (digest,),
            ).fetchone()
            if not row:
                raise RedeemError("not_found", "Card key not found")
            if row["status"] == "used":
                raise RedeemError("already_used", "Card key already redeemed")
            if row["status"] == "revoked":
                raise RedeemError("revoked", "Card key revoked")
            expires = row["expires_at"]
            if expires is not None and float(expires) < now:
                raise RedeemError("expired", "Card key expired")

            amount = int(row["tokens"])
            bal = conn.execute(
                "SELECT tokens FROM user_balances WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            prev = int(bal["tokens"]) if bal else 0
            next_bal = prev + amount

            if bal:
                conn.execute(
                    "UPDATE user_balances SET tokens = ?, updated_at = ? WHERE user_id = ?",
                    (next_bal, now, user_id),
                )
            else:
                conn.execute(
                    "INSERT INTO user_balances (user_id, tokens, updated_at) VALUES (?, ?, ?)",
                    (user_id, next_bal, now),
                )

            conn.execute(
                """
                UPDATE card_keys
                SET status = 'used', redeemed_by = ?, redeemed_at = ?
                WHERE id = ? AND status = 'unused'
                """,
                (user_id, now, row["id"]),
            )
            if conn.total_changes < 1:
                raise RedeemError("already_used", "Card key already redeemed")

            conn.execute(
                """
                INSERT INTO wallet_ledger
                    (user_id, kind, amount, balance_after, detail, card_key_id, created_at)
                VALUES (?, 'redeem', ?, ?, ?, ?, ?)
                """,
                (user_id, amount, next_bal, "卡密兑换", row["id"], now),
            )
            conn.commit()
        except RedeemError:
            conn.rollback()
            raise
        except Exception:
            conn.rollback()
            raise

    return {"tokensAdded": amount, "tokens": next_bal}
