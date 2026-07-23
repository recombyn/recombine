"""Async import jobs — phase 1 Celery queue."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from api.v1.import_pdf import _save_upload
from schemas.import_response import JobCreateResponse, JobStatusResponse
from services.job_store import get_job, save_job
from worker.tasks import run_import_job

router = APIRouter()

SourceType = Literal["pdf", "docx", "image"]

_SUFFIX: dict[str, str] = {
    "pdf": ".pdf",
    "docx": ".docx",
}


@router.post("/jobs", response_model=JobCreateResponse)
async def create_import_job(
    file: UploadFile = File(...),
    source_type: SourceType = Form(...),
):
    if source_type == "image":
        suffix = Path(file.filename or "image.png").suffix or ".png"
    else:
        suffix = _SUFFIX[source_type]

    saved = _save_upload(file, suffix)
    job_id = uuid.uuid4().hex
    payload = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "source_type": source_type,
        "file_path": str(saved),
        "document": None,
        "meta": None,
        "error": None,
    }
    try:
        save_job(job_id, payload)
        run_import_job.delay(job_id, source_type, str(saved))
    except Exception as exc:  # noqa: BLE001 — Redis/broker down
        raise HTTPException(
            status_code=503,
            detail=f"Job queue unavailable (start Redis + worker). {exc}",
        ) from exc
    return JobCreateResponse(job_id=job_id, status="queued")


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_import_job(job_id: str):
    try:
        job = get_job(job_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Job store unavailable: {exc}") from exc
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    meta = job.get("meta")
    return JobStatusResponse(
        job_id=job_id,
        status=job.get("status", "queued"),
        progress=int(job.get("progress") or 0),
        document=job.get("document"),
        meta=meta,
        error=job.get("error"),
    )
