"""Auth API — Google OAuth + email/password registration."""

from __future__ import annotations

import hmac
import logging
import time
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from config.settings import settings
from services.auth import SessionUser, create_session, get_session, revoke_session
from services.auth.admin import SUPER_ADMIN_EMAIL, SUPER_ADMIN_ID, require_admin as _require_admin_dep
from services.admin.users import ensure_super_admin_role
from services.auth.email_store import (
    can_send_code,
    change_password,
    consume_ticket,
    email_has_password,
    generate_code,
    get_user_by_id,
    reset_password_by_email,
    store_code,
    update_profile,
    upsert_user,
    user_has_password,
    verify_and_issue_ticket,
    verify_password,
)
from services.auth.google import login_with_google_auth_code, login_with_google_credential
from services.auth.ses_mail import SesError, send_verification_email, ses_configured
from services.auth.slider_captcha import (
    captcha_required,
    clear_login_failures,
    consume_captcha_token,
    create_challenge,
    record_login_failure,
    verify_challenge,
)
from services.wallet.card_keys import (
    RedeemError,
    redeem_card_key,
)
from services.wallet.db import connect as wallet_connect
from services.wallet.db import get_user_tokens, init_wallet_db, list_ledger, list_ledger_page

logger = logging.getLogger(__name__)

router = APIRouter()
# Mounted at /wallet — card-key credit top-up (no WeChat/Alipay membership).
wallet_router = APIRouter()

# Hardcoded bootstrap admin — no registration / SES required.
_SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAIL
_SUPER_ADMIN_PASSWORD = "Admin@2026"
_SUPER_ADMIN_ID = SUPER_ADMIN_ID
_SUPER_ADMIN_NAME = "Super Admin"
_SUPER_ADMIN_TOKENS = 9_999_999


def _normalize_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email")
    return email


def _ensure_super_admin_balance() -> None:
    """Give the hardcoded admin a large credit balance (idempotent)."""
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
        ensure_super_admin_role()
    except Exception:
        logger.exception("Failed to seed super-admin wallet balance")
    return SessionUser(
        id=_SUPER_ADMIN_ID,
        email=_SUPER_ADMIN_EMAIL,
        name=_SUPER_ADMIN_NAME,
        avatar=None,
        provider="email",
        role="admin",
        status="active",
    )


class RedeemIn(BaseModel):
    code: str = Field(..., min_length=8, max_length=32)




class GoogleAuthIn(BaseModel):
    """GIS ID token (`credential`) or OAuth auth-code (`code`) from redirect/popup."""

    credential: str | None = Field(default=None, min_length=1)
    code: str | None = Field(default=None, min_length=1)
    # Full-page redirect URI; must match authorize request (not postmessage).
    redirectUri: str | None = Field(default=None, min_length=1)


class EmailSendCodeIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    captchaToken: str | None = Field(default=None, max_length=128)


class EmailVerifyCodeIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    code: str = Field(..., min_length=4, max_length=8)
    captchaToken: str | None = Field(default=None, max_length=128)


class EmailCompleteIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    ticket: str = Field(..., min_length=8)
    password: str = Field(..., min_length=6, max_length=128)
    name: str | None = Field(default=None, max_length=80)


class EmailLoginIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=6, max_length=128)
    captchaToken: str | None = Field(default=None, max_length=128)


class EmailResetPasswordIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    ticket: str = Field(..., min_length=8)
    password: str = Field(..., min_length=6, max_length=128)


class ChangePasswordIn(BaseModel):
    currentPassword: str = Field(..., min_length=6, max_length=128)
    newPassword: str = Field(..., min_length=6, max_length=128)


class CaptchaVerifyIn(BaseModel):
    captchaId: str = Field(..., min_length=8, max_length=64)
    x: float
    email: str = Field(..., min_length=3, max_length=254)
    trajectory: list[dict[str, Any]] | None = None


def _client_ip(request: Request) -> str | None:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client:
        return request.client.host
    return None


def _need_captcha_error() -> HTTPException:
    return HTTPException(
        status_code=428,
        detail={
            "code": "need_captcha",
            "message": "Please complete the slider verification",
        },
    )


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=2000)
    avatar: str | None = Field(default=None, max_length=2_000_000)


_OFFICIAL_PROFILE_IDS = frozenset({"user_official", "official:recombyn"})
_OFFICIAL_PUBLIC = {
    "id": "user_official",
    "name": "recombyn",
    "avatar": "/logo192.png",
    "bio": "Official Recombyn templates",
}


def _user_payload(user: SessionUser) -> dict[str, Any]:
    from services.auth.admin import is_admin_user

    role = (getattr(user, "role", None) or "user").strip().lower() or "user"
    if is_admin_user(user):
        role = "admin"
    uid = getattr(user, "id", None) or ""
    # Super-admin password is hardcoded — not changeable in the UI.
    has_pw = bool(uid) and uid != _SUPER_ADMIN_ID and user_has_password(uid)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar": user.avatar,
        "provider": user.provider,
        "role": role,
        "bio": getattr(user, "bio", None),
        "hasPassword": has_pw,
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
def email_send_code(body: EmailSendCodeIn, request: Request) -> dict[str, Any]:
    if not ses_configured():
        raise HTTPException(
            status_code=503,
            detail="Email signup is temporarily unavailable. Try again later or use another sign-in method.",
        )
    email = _normalize_email(body.email)
    ip = _client_ip(request)

    # Same risk gate as login — frequent failures / abuse must pass slider first.
    if captcha_required(email, ip):
        if not consume_captcha_token(body.captchaToken, email):
            raise _need_captcha_error()

    allowed, retry_after = can_send_code(email)
    if not allowed:
        record_login_failure(email, ip)
        if captcha_required(email, ip) and not body.captchaToken:
            raise _need_captcha_error()
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
def email_verify_code(body: EmailVerifyCodeIn, request: Request) -> dict[str, Any]:
    email = _normalize_email(body.email)
    ip = _client_ip(request)

    passed_captcha = False
    if captcha_required(email, ip):
        if not consume_captcha_token(body.captchaToken, email):
            raise _need_captcha_error()
        passed_captcha = True

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
        # Wrong / locked codes count toward the slider risk gate.
        if key in ("code_invalid", "code_locked", "code_expired", "code_missing"):
            record_login_failure(email, ip)
            if passed_captcha:
                raise HTTPException(status_code=400, detail=messages.get(key, key)) from err
            if captcha_required(email, ip):
                raise _need_captcha_error() from err
        raise HTTPException(status_code=400, detail=messages.get(key, key)) from err

    clear_login_failures(email, ip)
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
        avatar=user.avatar,
        provider="email",
    )
    session, token = create_session(session)
    return {"user": _user_payload(session), "token": token}


@router.post("/email/forgot/send-code")
def email_forgot_send_code(body: EmailSendCodeIn, request: Request) -> dict[str, Any]:
    """Send a reset code when the email has a password. Always returns ok (anti-enumeration)."""
    if not ses_configured():
        raise HTTPException(
            status_code=503,
            detail="Email signup is temporarily unavailable. Try again later or use another sign-in method.",
        )
    email = _normalize_email(body.email)
    ip = _client_ip(request)

    if captcha_required(email, ip):
        if not consume_captcha_token(body.captchaToken, email):
            raise _need_captcha_error()

    # Always look like success if the account cannot reset — avoid leaking which emails exist.
    if not email_has_password(email):
        return {"ok": True, "expiresIn": 600}

    allowed, retry_after = can_send_code(email)
    if not allowed:
        record_login_failure(email, ip)
        if captcha_required(email, ip) and not body.captchaToken:
            raise _need_captcha_error()
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {int(retry_after)}s before resending",
            headers={"Retry-After": str(int(retry_after))},
        )
    code = generate_code()
    try:
        send_verification_email(to_email=email, code=code)
    except SesError as err:
        logger.exception("Forgot-password email send failed for %s", email)
        raise HTTPException(status_code=502, detail=str(err)) from err
    store_code(email, code)
    return {"ok": True, "expiresIn": 600}


@router.post("/email/reset-password")
def email_reset_password(body: EmailResetPasswordIn) -> dict[str, Any]:
    email = _normalize_email(body.email)
    if not email_has_password(email):
        raise HTTPException(status_code=400, detail="No password account for this email")
    if not consume_ticket(email, body.ticket.strip()):
        raise HTTPException(status_code=400, detail="Invalid or expired reset ticket")
    user = reset_password_by_email(email, body.password)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    session = SessionUser(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        provider="email",
        role=user.role,
        status=user.status,
    )
    session, token = create_session(session)
    return {"user": _user_payload(session), "token": token}


@router.post("/email/change-password")
def email_change_password(
    body: ChangePasswordIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    if user.id == _SUPER_ADMIN_ID:
        raise HTTPException(
            status_code=400,
            detail="Super admin password is managed on the server",
        )
    try:
        updated = change_password(user.id, body.currentPassword, body.newPassword)
    except ValueError as err:
        key = str(err)
        if key == "bad_current":
            raise HTTPException(status_code=400, detail="Current password is incorrect") from err
        if key == "no_password":
            raise HTTPException(
                status_code=400,
                detail="This account has no password. Sign in with Google or use forgot password after setting one.",
            ) from err
        raise HTTPException(status_code=404, detail="User not found") from err
    return {
        "user": {
            "id": updated.id,
            "email": updated.email,
            "name": updated.name,
            "avatar": updated.avatar,
            "bio": updated.bio,
            "provider": updated.provider,
            "hasPassword": True,
        }
    }


@router.post("/captcha/create")
def captcha_create() -> dict[str, Any]:
    return create_challenge()


@router.post("/captcha/verify")
def captcha_verify(body: CaptchaVerifyIn) -> dict[str, Any]:
    email = _normalize_email(body.email)
    try:
        return verify_challenge(
            body.captchaId,
            body.x,
            email,
            trajectory=body.trajectory,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/email/login")
def email_login(body: EmailLoginIn, request: Request) -> dict[str, Any]:
    email = _normalize_email(body.email)
    ip = _client_ip(request)

    # When risk gate is on, this attempt must carry a fresh captcha token.
    passed_captcha = False
    if captcha_required(email, ip):
        if not consume_captcha_token(body.captchaToken, email):
            raise _need_captcha_error()
        passed_captcha = True

    admin = _try_super_admin(email, body.password)
    if admin:
        clear_login_failures(email, ip)
        session, token = create_session(admin)
        return {"user": _user_payload(session), "token": token}

    user = verify_password(email, body.password)
    if not user:
        record_login_failure(email, ip)
        # Captcha already spent on this attempt — tell the user the password is wrong.
        # Asking for another slider here felt like “verified but still blocked”.
        if passed_captcha:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        if captcha_required(email, ip):
            raise _need_captcha_error()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    clear_login_failures(email, ip)
    session = SessionUser(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        provider=user.provider or "email",
    )
    session, token = create_session(session)
    return {"user": _user_payload(session), "token": token}


@router.get("/me")
def auth_me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = _bearer(authorization)
    user = get_session(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    init_wallet_db()
    return {
        "user": _user_payload(user),
        "tokens": get_user_tokens(user.id),
    }


@router.patch("/profile")
def auth_patch_profile(
    body: ProfileIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    updated = update_profile(
        user.id,
        name=body.name,
        bio=body.bio,
        avatar=body.avatar,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user": {
            "id": updated.id,
            "email": updated.email,
            "name": updated.name,
            "avatar": updated.avatar,
            "bio": updated.bio,
            "provider": updated.provider,
            "hasPassword": user_has_password(updated.id),
        }
    }


@router.get("/users/{user_id}")
def auth_public_user(user_id: str) -> dict[str, Any]:
    """Public profile (no email). Official seed ids get a static fallback."""
    uid = (user_id or "").strip()
    if not uid:
        raise HTTPException(status_code=404, detail="Not found")
    if uid in _OFFICIAL_PROFILE_IDS:
        row = get_user_by_id("user_official")
        if row:
            return {
                "user": {
                    "id": row.id,
                    "name": row.name,
                    "avatar": row.avatar or _OFFICIAL_PUBLIC["avatar"],
                    "bio": row.bio or _OFFICIAL_PUBLIC["bio"],
                }
            }
        return {"user": dict(_OFFICIAL_PUBLIC)}
    row = get_user_by_id(uid)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "user": {
            "id": row.id,
            "name": row.name,
            "avatar": row.avatar,
            "bio": row.bio,
        }
    }


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


@wallet_router.get("/ledger")
def wallet_ledger(
    page: int = 1,
    pageSize: int = 15,
    kind: str = "all",
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Paginated billing ledger.
    kind=all|redeem|spend — tab filter from Usage & billing dialog.
    """
    user = _require_user(authorization)
    init_wallet_db()
    return {
        "tokens": get_user_tokens(user.id),
        **list_ledger_page(user.id, page=page, page_size=pageSize, kind=kind),
    }


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


