"""Auth API — Google OAuth + email verification-code login."""

from __future__ import annotations

import hmac
import logging
import time
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from config.settings import settings
from services.auth import SessionUser, create_session, get_session, revoke_session
from services.auth.admin import (
    SUPER_ADMIN_BOOTSTRAP_PASSWORD,
    SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_ID,
    require_admin as _require_admin_dep,
)
from services.admin.users import ensure_super_admin_role
from services.auth.email_store import (
    can_send_activate_link,
    consume_activate_token,
    consume_ticket,
    create_activate_token,
    display_name_for_email,
    ensure_email_user,
    update_profile,
    verify_and_issue_ticket,
)
from services.auth.google import login_with_google_auth_code, login_with_google_credential
from services.auth.ses_mail import SesError, send_login_link_email, ses_configured
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
    check_redeem_rate_limit,
    clear_redeem_rate_limit,
    record_redeem_attempt,
    redeem_card_key,
    require_strong_card_key_salt,
)
from services.wallet.db import (
    ensure_user_balance,
    get_user_tokens,
    get_wallet,
    init_wallet_db,
    list_ledger,
    list_ledger_page,
)
logger = logging.getLogger(__name__)

router = APIRouter()
# Mounted at /wallet — card-key credit top-up (no WeChat/Alipay membership).
wallet_router = APIRouter()

# Hardcoded bootstrap admin — no registration / SES required.
_SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAIL
_SUPER_ADMIN_PASSWORD = SUPER_ADMIN_BOOTSTRAP_PASSWORD
_SUPER_ADMIN_ID = SUPER_ADMIN_ID
_SUPER_ADMIN_NAME = "Super Admin"


def _normalize_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email")
    return email


def _try_super_admin(email: str, password: str) -> SessionUser | None:
    if email != _SUPER_ADMIN_EMAIL:
        return None
    # Strip so trailing spaces from paste don't fail the check.
    pw = (password or "").strip()
    if not hmac.compare_digest(pw, _SUPER_ADMIN_PASSWORD):
        return None
    try:
        # Ensure wallet row exists; do not gift free-plan credits.
        ensure_user_balance(_SUPER_ADMIN_ID, starting_tokens=0)
        ensure_super_admin_role()
    except Exception:
        logger.exception("Failed to ensure super-admin wallet / role")
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
    # v2: XXXXX-XXXXX-XXXXX-XXXXX (23 with dashes)
    code: str = Field(..., min_length=16, max_length=48)




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



class EmailLoginIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=6, max_length=128)
    captchaToken: str | None = Field(default=None, max_length=128)



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


def _user_payload(user: SessionUser) -> dict[str, Any]:
    from services.auth.admin import is_admin_user

    role = (getattr(user, "role", None) or "user").strip().lower() or "user"
    if is_admin_user(user):
        role = "admin"
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        # Effective: custom upload, else OAuth/default.
        "avatar": user.avatar,
        "avatarCustom": getattr(user, "avatar_custom", None),
        "defaultAvatar": getattr(user, "default_avatar", None),
        "provider": user.provider,
        "role": role,
        "bio": getattr(user, "bio", None),
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
    """Send magic-link login email (SES template {{username}} / {{id}})."""
    email = _normalize_email(body.email)
    ip = _client_ip(request)

    # TEMP local test: bootstrap admin still uses password login; no SES.
    if email == _SUPER_ADMIN_EMAIL:
        logger.warning("TEMP admin login: use password endpoint (no magic link)")
        return {"ok": True, "expiresIn": 48 * 3600, "mode": "link"}

    if not ses_configured():
        raise HTTPException(
            status_code=503,
            detail="Email signup is temporarily unavailable. Try again later or use another sign-in method.",
        )

    if captcha_required(email, ip):
        if not consume_captcha_token(body.captchaToken, email):
            raise _need_captcha_error()

    allowed, retry_after = can_send_activate_link(email)
    if not allowed:
        record_login_failure(email, ip)
        if captcha_required(email, ip) and not body.captchaToken:
            raise _need_captcha_error()
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {int(retry_after)}s before resending",
            headers={"Retry-After": str(int(retry_after))},
        )

    token_id = create_activate_token(email)
    username = display_name_for_email(email)
    try:
        send_login_link_email(
            to_email=email,
            username=username,
            activate_id=token_id,
        )
    except SesError as err:
        logger.exception("Email send failed for %s", email)
        raise HTTPException(status_code=502, detail=str(err)) from err
    return {"ok": True, "expiresIn": 48 * 3600, "mode": "link"}


class EmailActivateIn(BaseModel):
    id: str = Field(..., min_length=8, max_length=128)


@router.post("/email/activate")
def email_activate(body: EmailActivateIn, request: Request) -> dict[str, Any]:
    """Consume one-time /activate/{{id}} link → session."""
    ip = _client_ip(request)
    try:
        email = consume_activate_token(body.id)
    except ValueError as err:
        key = str(err)
        messages = {
            "link_invalid": "Login link is invalid or already used",
            "link_expired": "Login link expired",
        }
        record_login_failure("activate", ip)
        raise HTTPException(status_code=400, detail=messages.get(key, key)) from err

    clear_login_failures(email, ip)
    user = ensure_email_user(email=email)
    session = SessionUser(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        provider="email",
        role=getattr(user, "role", None) or "user",
        status=getattr(user, "status", None) or "active",
    )
    session, token = create_session(session)
    return {"user": _user_payload(session), "token": token}


@router.post("/email/verify-code")
def email_verify_code(body: EmailVerifyCodeIn, request: Request) -> dict[str, Any]:
    """Legacy 6-digit code login (kept for compatibility). Prefer /email/activate."""
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
        if key in ("code_invalid", "code_locked", "code_expired", "code_missing"):
            record_login_failure(email, ip)
            if passed_captcha:
                raise HTTPException(status_code=400, detail=messages.get(key, key)) from err
            if captcha_required(email, ip):
                raise _need_captcha_error() from err
        raise HTTPException(status_code=400, detail=messages.get(key, key)) from err

    clear_login_failures(email, ip)
    if not consume_ticket(email, ticket):
        raise HTTPException(status_code=400, detail="Invalid or expired verification ticket")
    user = ensure_email_user(email=email)
    session = SessionUser(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        provider="email",
        role=getattr(user, "role", None) or "user",
        status=getattr(user, "status", None) or "active",
    )
    session, token = create_session(session)
    return {"user": _user_payload(session), "token": token}







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
    """Super-admin password bootstrap only. Public users sign in via /email/verify-code."""
    email = _normalize_email(body.email)
    ip = _client_ip(request)

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

    record_login_failure(email, ip)
    if passed_captcha:
        raise HTTPException(
            status_code=401,
            detail="Use email verification code to sign in",
        )
    if captcha_required(email, ip):
        raise _need_captcha_error()
    raise HTTPException(
        status_code=401,
        detail="Use email verification code to sign in",
    )



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


def _wallet_plan_fields(snap: dict[str, Any]) -> dict[str, Any]:
    return {
        "planId": snap.get("planId") or "free",
        "planExpiresAt": snap.get("planExpiresAt"),
        "planLocked": bool(snap.get("planLocked")),
    }


@wallet_router.get("")
def wallet_me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_user(authorization)
    init_wallet_db()
    snap = get_wallet(user.id)
    credits = int(snap.get("credits") or snap.get("tokens") or 0)
    return {
        "credits": credits,
        "tokens": credits,
        "imageCredits": credits,
        **_wallet_plan_fields(snap),
        "ledger": list_ledger(user.id),
    }


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
    snap = get_wallet(user.id)
    credits = int(snap.get("credits") or snap.get("tokens") or 0)
    return {
        "credits": credits,
        "tokens": credits,
        "imageCredits": credits,
        **_wallet_plan_fields(snap),
        **list_ledger_page(user.id, page=page, page_size=pageSize, kind=kind),
    }


@wallet_router.post("/redeem")
def wallet_redeem(
    body: RedeemIn,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    try:
        require_strong_card_key_salt()
    except ValueError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    ip = _client_ip(request)
    try:
        check_redeem_rate_limit(user_id=user.id, ip=ip)
    except RedeemError as err:
        raise HTTPException(
            status_code=429,
            detail={"code": err.code, "message": err.message},
        ) from err
    record_redeem_attempt(user_id=user.id, ip=ip)
    try:
        result = redeem_card_key(user.id, body.code)
    except RedeemError as err:
        status = 404 if err.code == "not_found" else 400
        if err.code == "rate_limited":
            status = 429
        raise HTTPException(
            status_code=status,
            detail={"code": err.code, "message": err.message},
        ) from err
    clear_redeem_rate_limit(user_id=user.id, ip=ip)
    snap = get_wallet(user.id)
    credits = int(snap.get("credits") or snap.get("tokens") or 0)
    added = int(result.get("creditsAdded") or result.get("tokensAdded") or 0)
    return {
        "kind": result.get("kind") or "credit",
        "creditsAdded": added,
        "tokensAdded": added,
        "credits": credits,
        "tokens": credits,
        "imageCredits": credits,
        **_wallet_plan_fields(snap),
        "ledger": list_ledger(user.id),
    }


