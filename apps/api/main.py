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
    "services.design.orchestrator",
    "services.design.agent_controller",
    "services.design.llm_step",
    "design.run_api",
    "design.llm_step",
):
    logging.getLogger(_name).setLevel(logging.INFO)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Recombyn API",
    description="Canvas Scene API + Design Agent runtime",
    version="0.1.0",
)


@app.on_event("startup")
def _init_stores() -> None:
    try:
        from services.auth.admin import SUPER_ADMIN_BOOTSTRAP_PASSWORD

        if SUPER_ADMIN_BOOTSTRAP_PASSWORD == "Admin@2026":
            logger.warning(
                "SUPER_ADMIN_BOOTSTRAP_PASSWORD is still the default — "
                "set SUPER_ADMIN_BOOTSTRAP_PASSWORD before any public deploy"
            )
    except Exception:
        pass
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
        from services.design.catalog import ensure_design_catalog

        ensure_design_catalog()
        logger.info("design catalog ready")
        try:
            from services.design.skill_store import start_skills_hot_reload

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
        from services.design.admin_store import start_usage_optimize_scheduler
        start_usage_optimize_scheduler()
        logger.info("usage optimize scheduler started")
    except Exception:
        logger.exception("usage optimize scheduler failed to start")
    # Light cold-archive pass (non-blocking): old result_svg / thinking → design_cold_blob.
    try:
        import threading

        def _cold_pass() -> None:
            try:
                from services.design.cold_archive import run_cold_archive

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
