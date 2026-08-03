from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import sys

from api.router import api_router
from config.settings import settings
from services.db import init_schema

# Force design-run stage logs to the uvicorn terminal.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    stream=sys.stdout,
    force=True,
)
try:
    from services.security import install_log_redaction

    install_log_redaction()
except Exception:
    pass
for _name in (
    "services.design.runtime.orchestrator",
    "services.design.runtime.agent_controller",
    "services.design.runtime.llm_step",
    "design.run_api",
    "design.llm_step",
):
    logging.getLogger(_name).setLevel(logging.INFO)

logger = logging.getLogger(__name__)

_DEV_COLLAB_SECRET = "dev-collab-token-secret-change-me"
_DEFAULT_MYSQL_URL = "mysql://recombyn:recombyn@mysql:3306/recombyn"


def _warn_insecure_defaults() -> None:
    """Log loud warnings when local defaults would be unsafe on a public host."""
    try:
        from services.auth.admin import SUPER_ADMIN_BOOTSTRAP_PASSWORD

        if SUPER_ADMIN_BOOTSTRAP_PASSWORD == "Admin@2026":
            logger.warning(
                "SUPER_ADMIN_BOOTSTRAP_PASSWORD is still the default — "
                "set SUPER_ADMIN_BOOTSTRAP_PASSWORD before any public deploy"
            )
    except Exception:
        pass

    import os

    collab_secret = (os.getenv("COLLAB_TOKEN_SECRET") or "").strip() or _DEV_COLLAB_SECRET
    if collab_secret == _DEV_COLLAB_SECRET:
        logger.warning(
            "COLLAB_TOKEN_SECRET is still the compose/dev default — "
            "set a long random secret before any public deploy (must match collab)"
        )

    db_url = (os.getenv("DATABASE_URL") or "").strip()
    if db_url == _DEFAULT_MYSQL_URL or "recombyn:recombyn@" in db_url:
        logger.warning(
            "DATABASE_URL still uses the default MySQL password (recombyn) — "
            "change MYSQL_PASSWORD / DATABASE_URL before any public deploy"
        )

    card_salt = (os.getenv("CARD_KEY_SALT") or "").strip()
    if not card_salt or card_salt.startswith("replace-with-"):
        logger.warning(
            "CARD_KEY_SALT is empty or still a placeholder — "
            "set a strong random salt before issuing card keys publicly"
        )

    byok = (os.getenv("BYOK_AES_KEY") or "").strip()
    if not byok:
        logger.warning(
            "BYOK_AES_KEY is empty — user LLM vault keys derive from CARD_KEY_SALT (dev only); "
            "set a dedicated 32+ char key for public deploy"
        )

    ws = (os.getenv("COLLAB_PUBLIC_WS_URL") or "").strip().lower()
    if ws.startswith("ws://") and "localhost" not in ws and "127.0.0.1" not in ws:
        logger.warning(
            "COLLAB_PUBLIC_WS_URL is plain ws:// on a non-local host — "
            "public HTTPS deploys need wss:// (see deploy/caddy/Caddyfile.example)"
        )


app = FastAPI(
    title="Recombyn API",
    description="Canvas Scene API + Design Agent runtime",
    version="0.1.0",
)


@app.on_event("startup")
def _init_stores() -> None:
    _warn_insecure_defaults()
    init_schema()
    try:
        from services.security import ensure_byok_table

        ensure_byok_table()
    except Exception:
        logger.exception("byok table bootstrap failed")
    try:
        from services.db.backup import start_db_backup_scheduler

        start_db_backup_scheduler()
        logger.info("db backup scheduler started")
    except Exception:
        logger.exception("db backup scheduler failed to start")
    try:
        from services.seed import run_seeds
        counts = run_seeds()
        logger.info("seed complete: %s", counts)
    except Exception:
        logger.exception("seed failed")
    try:
        from services.design.readpath.catalog import ensure_design_catalog

        ensure_design_catalog()
        logger.info("design catalog ready")
        try:
            from services.design.prompts.skill_store import start_skills_hot_reload

            if start_skills_hot_reload():
                logger.info("design skills hot reload started")
        except Exception:
            logger.exception("design skills hot reload failed to start")
    except Exception:
        logger.exception("design catalog bootstrap failed")
    try:
        from services.llm.agent import configure_langfuse

        lf = configure_langfuse()
        logger.info(
            "langfuse: enabled=%s host=%s",
            lf.get("enabled"),
            lf.get("host"),
        )
    except Exception:
        logger.exception("langfuse configure failed")
    try:
        from services.design.admin.admin_store import start_usage_optimize_scheduler
        start_usage_optimize_scheduler()
        logger.info("usage optimize scheduler started")
    except Exception:
        logger.exception("usage optimize scheduler failed to start")
    # Light cold-archive pass (non-blocking): old result_svg / thinking → design_cold_blob.
    try:
        import threading

        def _cold_pass() -> None:
            try:
                from services.design.admin.cold_archive import run_cold_archive

                result = run_cold_archive(retention_days=30, batch=40)
                logger.info("cold archive startup pass: %s", result)
            except Exception:
                logger.exception("cold archive startup pass failed")

        threading.Thread(target=_cold_pass, name="cold-archive", daemon=True).start()
    except Exception:
        logger.exception("cold archive thread failed to start")


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path or ""
    if path in ("/", "/docs", "/openapi.json", "/redoc") or path.startswith(
        "/api/v1/health"
    ):
        return await call_next(request)
    try:
        from services.security import _client_ip, check_rate_limit

        auth = request.headers.get("authorization") or ""
        identity = (
            auth[7:23]
            if auth.lower().startswith("bearer ") and len(auth) > 10
            else ""
        )
        if not identity:
            identity = _client_ip(
                {k: v for k, v in request.headers.items()},
                request.client.host if request.client else None,
            )
        ok, limit = check_rate_limit(path=path, identity=identity)
        if not ok:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests", "limit": limit},
                headers={"Retry-After": "60"},
            )
    except Exception:
        logger.debug("rate limit check failed", exc_info=True)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root():
    return {"service": "recombyn-api", "docs": "/docs"}
