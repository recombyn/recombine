import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from api.v1.import_pdf import _save_upload
from schemas.import_response import ImportResponse
from services.pipeline import run_import

router = APIRouter()

_DESIGN_SUFFIXES = {".psd", ".xd", ".rp", ".fig"}


@router.post("/design", response_model=ImportResponse)
async def import_design(file: UploadFile = File(...)):
    suffix = Path(file.filename or "design.psd").suffix.lower() or ".psd"
    if suffix not in _DESIGN_SUFFIXES:
        suffix = ".psd"
    saved = _save_upload(file, suffix)
    result = run_import("design", saved)
    return ImportResponse(**result)
