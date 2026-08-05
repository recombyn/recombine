import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from app.api.deps import CurrentUser
from app.api.routes.import_pdf import _save_upload
from app.schemas.import_response import ImportResponse
from app.services.pipeline import run_import

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/docx", response_model=ImportResponse)
async def import_docx(
    _current_user: CurrentUser,
    file: UploadFile = File(...),
):
    saved = _save_upload(file, ".docx")
    result = run_import("docx", saved)
    return ImportResponse(**result)
