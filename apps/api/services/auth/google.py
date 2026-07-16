"""Google ID-token verification ( GIS flow)."""

from __future__ import annotations

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from config.settings import settings
from services.auth import SessionUser, create_session

_VALID_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})


def login_with_google_credential(credential: str) -> tuple[SessionUser, str]:
    """
    Verify Google JWT and create a session.

    Raises ValueError on invalid / unverified tokens or misconfiguration.
    """
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
    token = create_session(user)
    return user, token
