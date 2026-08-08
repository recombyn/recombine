"""FastAPI dependencies: DB session, current user, admin."""

from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.services.auth import SessionUser, get_session
from app.services.auth.admin import is_admin_user

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/email/login",
)
optional_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/email/login",
    auto_error=False,
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]
OptionalTokenDep = Annotated[str | None, Depends(optional_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> SessionUser:
    user = get_session(token, db=session)
    if not user:
        # 401 (not 403): axios / App treat this as session death and clear local auth.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_status = (getattr(user, "status", None) or "active").strip().lower()
    if user_status == "disabled":
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


def get_current_user_optional(
    session: SessionDep,
    token: OptionalTokenDep,
) -> SessionUser | None:
    if not token:
        return None
    return get_session(token, db=session)


CurrentUser = Annotated[SessionUser, Depends(get_current_user)]
OptionalUser = Annotated[SessionUser | None, Depends(get_current_user_optional)]


def get_current_active_superuser(current_user: CurrentUser) -> SessionUser:
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=403,
            detail="The user doesn't have enough privileges",
        )
    return current_user


AdminUser = Annotated[SessionUser, Depends(get_current_active_superuser)]
