import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from app.api.deps import CurrentUser
from app.core.config import settings
from app.schemas.import_response import ImportResponse
from app.services.pipeline import run_import

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/pdf", response_model=ImportResponse)
async def import_pdf(
    _current_user: CurrentUser,
    file: UploadFile = File(...),
):
    saved = _save_upload(file, ".pdf")
    result = run_import("pdf", saved)
    return ImportResponse(**result)


def _save_upload(file: UploadFile, suffix: str) -> Path:
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / f"{uuid.uuid4().hex}{suffix}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return dest
