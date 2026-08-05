"""SQLModel auth session smoke (maps existing users / auth_sessions tables)."""

from __future__ import annotations

import secrets
import time

from sqlmodel import Session, select

from app.core.db import engine, init_db
from app.models import AuthSession, User
from app.services.auth import SessionUser, get_session, revoke_session
from app.services.db import init_schema


def test_sqlmodel_user_select():
    init_schema()
    init_db()
    with Session(engine) as session:
        row = session.exec(select(User).limit(1)).first()
        # Empty DB is ok in CI; just ensure the query runs.
        assert row is None or isinstance(row.id, str)


def test_sqlmodel_auth_session_roundtrip():
    init_schema()
    init_db()
    with Session(engine) as session:
        user = session.exec(select(User).limit(1)).first()
        if user is None:
            return  # no seed user in this environment
        token = secrets.token_urlsafe(16)
        now = time.time()
        session.add(
            AuthSession(
                token=token,
                user_id=user.id,
                expires_at=now + 3600,
                created_at=now,
            )
        )
        session.commit()

    loaded = get_session(token)
    assert loaded is not None
    assert loaded.id == user.id
    revoke_session(token)
    assert get_session(token) is None


def test_wallet_credit_spend_sqlmodel():
    from app.services.db import init_schema
    from app.services.wallet.db import credit_tokens, ensure_user_balance, get_user_tokens, spend_tokens

    init_schema()
    uid = "user_sqlmodel_wallet_test"
    ensure_user_balance(uid, starting_tokens=0)
    # Normalize to a known balance via credit of 0 path — credit requires >0
    before = get_user_tokens(uid)
    credit_tokens(uid, 5, detail="sqlmodel-test-credit")
    assert get_user_tokens(uid) == before + 5
    spend_tokens(uid, 3, detail="sqlmodel-test-spend")
    assert get_user_tokens(uid) == before + 2

