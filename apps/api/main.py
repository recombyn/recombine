from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
for _name in (
    "services.design.orchestrator",
    "services.design.agent_loop",
    "services.design.llm_step",
    "design.run_api",
    "design.llm_step",
):
    logging.getLogger(_name).setLevel(logging.INFO)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Resume Scene API",
    description="Parse PDF/DOCX/Image into Canvas Scene JSON",
    version="0.1.0",
)


@app.on_event("startup")
def _init_stores() -> None:
    init_schema()
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
    except Exception:
        logger.exception("design catalog bootstrap failed")
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
    return {"service": "resume-scene-api", "docs": "/docs"}
