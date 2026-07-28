"""Celery tasks for async import + aesthetics embed."""

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
        status = result.get("status") or "done"
        update_job(
            job_id,
            status=status,
            progress=100,
            document=result.get("document"),
            meta=result.get("meta"),
            error=result.get("error"),
        )
        return {"job_id": job_id, "status": status, "error": result.get("error")}
    except Exception as exc:  # noqa: BLE001 — persist failure for client poll
        update_job(job_id, status="failed", progress=100, error=str(exc))
        return {"job_id": job_id, "status": "failed", "error": str(exc)}


@celery.task(name="worker.tasks.embed_quality_sample_job", bind=True)
def embed_quality_sample_job(self, sample_id: int) -> dict:
    """OpenCLIP three-tower embed for design_quality_sample."""
    from services.design.aesthetics.embed_job import embed_quality_sample

    return embed_quality_sample(int(sample_id))
