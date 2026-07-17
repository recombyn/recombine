"""Auth API — Google OAuth + email/password registration."""

from __future__ import annotations

import hmac
import logging
import time
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from config.settings import settings
from services.auth import SessionUser, create_session, get_session, revoke_session
from services.auth.email_store import (
    can_send_code,
    consume_ticket,
    generate_code,
    store_code,
    upsert_user,
    verify_and_issue_ticket,
    verify_password,
)
from services.auth.google import login_with_google_auth_code, login_with_google_credential
from services.auth.ses_mail import SesError, send_verification_email, ses_configured
from services.wallet.card_keys import (
    RedeemError,
    generate_card_keys,
    list_card_keys,
    redeem_card_key,
)
from services.wallet.db import connect as wallet_connect
from services.wallet.db import get_user_tokens, init_wallet_db, list_ledger

logger = logging.getLogger(__name__)

router = APIRouter()
# Mounted at /wallet — card-key Token top-up (no WeChat/Alipay membership).
wallet_router = APIRouter()

# Hardcoded bootstrap admin — no registration / SES required.
_SUPER_ADMIN_EMAIL = "admin@recombyn.com"
_SUPER_ADMIN_PASSWORD = "Admin@2026"
_SUPER_ADMIN_ID = "user_super_admin"
_SUPER_ADMIN_NAME = "Super Admin"
_SUPER_ADMIN_TOKENS = 9_999_999


def _normalize_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email")
    return email


def _ensure_super_admin_balance() -> None:
    """Give the hardcoded admin a large Token balance (idempotent)."""
    init_wallet_db()
    now = time.time()
    with wallet_connect() as conn:
        row = conn.execute(
            "SELECT tokens FROM user_balances WHERE user_id = ?",
            (_SUPER_ADMIN_ID,),
        ).fetchone()
        if row and int(row["tokens"]) >= _SUPER_ADMIN_TOKENS:
            return
        if row:
            conn.execute(
                "UPDATE user_balances SET tokens = ?, updated_at = ? WHERE user_id = ?",
                (_SUPER_ADMIN_TOKENS, now, _SUPER_ADMIN_ID),
            )
        else:
            conn.execute(
                "INSERT INTO user_balances (user_id, tokens, updated_at) VALUES (?, ?, ?)",
                (_SUPER_ADMIN_ID, _SUPER_ADMIN_TOKENS, now),
            )


def _try_super_admin(email: str, password: str) -> SessionUser | None:
    if email != _SUPER_ADMIN_EMAIL:
        return None
    # Strip so trailing spaces from paste don't fail the check.
    pw = (password or "").strip()
    if not hmac.compare_digest(pw, _SUPER_ADMIN_PASSWORD):
        return None
    try:
        _ensure_super_admin_balance()
    except Exception:
        logger.exception("Failed to seed super-admin wallet balance")
    return SessionUser(
        id=_SUPER_ADMIN_ID,
        email=_SUPER_ADMIN_EMAIL,
        name=_SUPER_ADMIN_NAME,
        avatar=None,
        provider="email",
    )


class RedeemIn(BaseModel):
    code: str = Field(..., min_length=8, max_length=32)


class GenerateCardKeysIn(BaseModel):
    count: int = Field(default=10, ge=1, le=100)
    tokens: int = Field(..., ge=1, le=10_000_000)
    expiresDays: int = Field(default=0, ge=0, le=3650)


class GoogleAuthIn(BaseModel):
    """GIS ID token (`credential`) or OAuth auth-code (`code`) from redirect/popup."""

    credential: str | None = Field(default=None, min_length=1)
    code: str | None = Field(default=None, min_length=1)
    # Full-page redirect URI; must match authorize request (not postmessage).
    redirectUri: str | None = Field(default=None, min_length=1)


class EmailSendCodeIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)


class EmailVerifyCodeIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    code: str = Field(..., min_length=4, max_length=8)


class EmailCompleteIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    ticket: str = Field(..., min_length=8)
    password: str = Field(..., min_length=6, max_length=128)
    name: str | None = Field(default=None, max_length=80)


class EmailLoginIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=6, max_length=128)


def _user_payload(user: SessionUser) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar": user.avatar,
        "provider": user.provider,
    }


@router.get("/config")
def auth_config() -> dict[str, Any]:
    return {
        "googleEnabled": bool((settings.google_client_id or "").strip()),
        "googleClientId": (settings.google_client_id or "").strip() or None,
        "emailEnabled": ses_configured(),
    }


@router.post("/google")
def auth_google(body: GoogleAuthIn) -> dict[str, Any]:
    try:
        if body.code:
            user, token = login_with_google_auth_code(
                body.code.strip(),
                redirect_uri=(body.redirectUri or "").strip() or None,
            )
        elif body.credential:
            user, token = login_with_google_credential(body.credential.strip())
        else:
            raise HTTPException(status_code=400, detail="Provide credential or code")
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=401, detail=str(err)) from err

    return {"user": _user_payload(user), "token": token}


@router.post("/email/send-code")
def email_send_code(body: EmailSendCodeIn) -> dict[str, Any]:
    if not ses_configured():
        raise HTTPException(
            status_code=503,
            detail="Email signup is temporarily unavailable. Try again later or use another sign-in method.",
        )
    email = _normalize_email(body.email)
    allowed, retry_after = can_send_code(email)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {int(retry_after)}s before resending",
            headers={"Retry-After": str(int(retry_after))},
        )
    code = generate_code()
    try:
        send_verification_email(to_email=email, code=code)
    except SesError as err:
        logger.exception("Email send failed for %s", email)
        raise HTTPException(status_code=502, detail=str(err)) from err
    store_code(email, code)
    return {"ok": True, "expiresIn": 600}


@router.post("/email/verify-code")
def email_verify_code(body: EmailVerifyCodeIn) -> dict[str, Any]:
    email = _normalize_email(body.email)
    try:
        ticket = verify_and_issue_ticket(email, body.code.strip())
    except ValueError as err:
        key = str(err)
        messages = {
            "code_missing": "No verification code requested for this email",
            "code_expired": "Verification code expired",
            "code_locked": "Too many attempts. Request a new code",
            "code_invalid": "Invalid verification code",
        }
        raise HTTPException(status_code=400, detail=messages.get(key, key)) from err
    return {"ticket": ticket}


@router.post("/email/complete")
def email_complete(body: EmailCompleteIn) -> dict[str, Any]:
    email = _normalize_email(body.email)
    if not consume_ticket(email, body.ticket.strip()):
        raise HTTPException(status_code=400, detail="Invalid or expired registration ticket")
    user = upsert_user(
        email=email,
        password=body.password,
        name=(body.name or "").strip() or email.split("@")[0],
    )
    session = SessionUser(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=None,
        provider="email",
    )
    token = create_session(session)
    return {"user": _user_payload(session), "token": token}


@router.post("/email/login")
def email_login(body: EmailLoginIn) -> dict[str, Any]:
    email = _normalize_email(body.email)
    admin = _try_super_admin(email, body.password)
    if admin:
        token = create_session(admin)
        return {"user": _user_payload(admin), "token": token}

    user = verify_password(email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    session = SessionUser(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=None,
        provider="email",
    )
    token = create_session(session)
    return {"user": _user_payload(session), "token": token}


@router.get("/me")
def auth_me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = _bearer(authorization)
    user = get_session(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"user": _user_payload(user)}


@router.post("/logout")
def auth_logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    revoke_session(_bearer(authorization))
    return {"message": "Logged out"}


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def _require_user(authorization: str | None):
    user = get_session(_bearer(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def _require_super_admin(authorization: str | None):
    user = _require_user(authorization)
    if user.id != _SUPER_ADMIN_ID and (user.email or "").strip().lower() != _SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


@wallet_router.get("/purchase-info")
def purchase_info() -> dict[str, Any]:
    return {
        "xianyuUrl": (settings.xianyu_shop_url or "").strip() or None,
        "authorContact": (settings.author_contact or "").strip() or None,
        "xianyuQrUrl": (settings.xianyu_qr_url or "").strip() or "/qr/xianyu.png",
        "wechatQrUrl": (settings.wechat_qr_url or "").strip() or "/qr/wechat.png",
        "hint": "No WeChat/Alipay. Buy card keys on Xianyu or contact the author.",
    }


@wallet_router.get("")
def wallet_me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_user(authorization)
    init_wallet_db()
    return {"tokens": get_user_tokens(user.id), "ledger": list_ledger(user.id)}


@wallet_router.post("/redeem")
def wallet_redeem(
    body: RedeemIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    if not (settings.card_key_salt or "").strip():
        raise HTTPException(status_code=503, detail="CARD_KEY_SALT is not configured")
    try:
        result = redeem_card_key(user.id, body.code)
    except RedeemError as err:
        status = 404 if err.code == "not_found" else 400
        raise HTTPException(status_code=status, detail=err.message) from err
    return {
        "tokensAdded": result["tokensAdded"],
        "tokens": result["tokens"],
        "ledger": list_ledger(user.id),
    }


@wallet_router.post("/admin/generate-keys")
def wallet_admin_generate_keys(
    body: GenerateCardKeysIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Super-admin only: mint card keys and return plaintext once."""
    _require_super_admin(authorization)
    try:
        keys = generate_card_keys(
            count=body.count,
            tokens=body.tokens,
            expires_days=body.expiresDays,
        )
    except ValueError as err:
        detail = str(err)
        status = 503 if "CARD_KEY_SALT" in detail else 400
        raise HTTPException(status_code=status, detail=detail) from err
    return {
        "count": len(keys),
        "tokens": body.tokens,
        "expiresDays": body.expiresDays,
        "keys": keys,
    }


@wallet_router.get("/admin/keys")
def wallet_admin_list_keys(
    status: str | None = None,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Super-admin only: list card keys (no plaintext)."""
    _require_super_admin(authorization)
    keys = list_card_keys(status=status)
    return {"keys": keys}
