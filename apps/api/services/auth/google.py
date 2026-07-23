"""Google OAuth login — ID token verify, or auth-code exchange (redirect / popup)."""

from __future__ import annotations

from urllib.parse import urlparse

import httpx
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from config.settings import settings
from services.auth import SessionUser, create_session

_VALID_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})
# GIS popup code client uses this redirect_uri (not a real browser redirect).
_POPUP_REDIRECT_URI = "postmessage"
_REDIRECT_PATH = "/login/google/callback"


def _session_from_id_token(credential: str) -> tuple[SessionUser, str]:
    client_id = (settings.google_client_id or "").strip()
    if not client_id:
        raise RuntimeError("Google OAuth is not configured (GOOGLE_CLIENT_ID)")

    try:
        payload = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            audience=client_id,
        )
    except Exception as err:
        raise ValueError(f"Invalid Google credential: {err}") from err

    iss = payload.get("iss")
    if iss not in _VALID_ISSUERS:
        raise ValueError("Invalid Google credential: wrong issuer")

    sub = payload.get("sub")
    email = payload.get("email")
    if not sub or not email:
        raise ValueError("Invalid Google credential: missing sub or email")

    if payload.get("email_verified") is not True:
        raise ValueError("Google account email is not verified")

    user = SessionUser(
        id=f"google:{sub}",
        email=str(email),
        name=str(payload.get("name") or email.split("@")[0]),
        avatar=str(payload.get("picture") or "") or None,
        provider="google",
    )
    # create_session returns DB profile (keeps customized name/avatar on re-login).
    return create_session(user)


def login_with_google_credential(credential: str) -> tuple[SessionUser, str]:
    """Verify Google JWT (GIS button / One Tap) and create a session."""
    return _session_from_id_token(credential)


def _resolve_redirect_uri(redirect_uri: str | None) -> str:
    """Use full-page callback URI when provided; otherwise GIS popup postmessage."""
    uri = (redirect_uri or "").strip()
    if not uri:
        return _POPUP_REDIRECT_URI
    parsed = urlparse(uri)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Invalid redirect_uri")
    if not parsed.path.endswith(_REDIRECT_PATH):
        raise ValueError("Invalid redirect_uri")
    return uri


def login_with_google_auth_code(
    code: str,
    redirect_uri: str | None = None,
) -> tuple[SessionUser, str]:
    """
    Exchange an OAuth authorization code for tokens, then verify id_token.

    Full-page redirect: pass the same redirect_uri used in the authorize URL
    (e.g. http://localhost:3000/login/google/callback).
    Legacy popup GIS: omit redirect_uri (uses postmessage).
    Requires GOOGLE_CLIENT_SECRET on the API.
    """
    client_id = (settings.google_client_id or "").strip()
    client_secret = (settings.google_client_secret or "").strip()
    if not client_id:
        raise RuntimeError("Google OAuth is not configured (GOOGLE_CLIENT_ID)")
    if not client_secret:
        raise RuntimeError("Google OAuth is not configured (GOOGLE_CLIENT_SECRET)")

    resolved_redirect = _resolve_redirect_uri(redirect_uri)

    try:
        with httpx.Client(timeout=20.0) as client:
            token_res = client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": resolved_redirect,
                    "grant_type": "authorization_code",
                },
            )
    except Exception as err:
        raise ValueError(f"Google token exchange failed: {err}") from err

    if token_res.status_code >= 400:
        detail = token_res.text
        try:
            detail = token_res.json().get("error_description") or token_res.json().get("error") or detail
        except Exception:
            pass
        raise ValueError(f"Google token exchange failed: {detail}")

    data = token_res.json()
    id_tok = data.get("id_token")
    if not id_tok:
        raise ValueError("Google token exchange did not return id_token (need openid scope)")

    return _session_from_id_token(str(id_tok))
