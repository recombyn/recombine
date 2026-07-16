"""Celery tasks for async import."""

from pathlib import Path

from services.job_store import update_job
from services.pipeline import run_import
from worker.celery_app import celery


@celery.task(name="worker.tasks.run_import_job", bind=True)
def run_import_job(self, job_id: str, source_type: str, file_path: str) -> dict:
    update_job(job_id, status="processing", progress=15, error=None)
    try:
        update_job(job_id, progress=35)
        result = run_import(source_type, Path(file_path), job_id=job_id)  # type: ignore[arg-type]
        update_job(job_id, progress=90)
        update_job(
            job_id,
            status="done",
            progress=100,
            document=result.get("document"),
            meta=result.get("meta"),
            error=None,
        )
        return {"job_id": job_id, "status": "done"}
    except Exception as exc:  # noqa: BLE001 — persist failure for client poll
        update_job(job_id, status="failed", progress=100, error=str(exc))
        return {"job_id": job_id, "status": "failed", "error": str(exc)}
