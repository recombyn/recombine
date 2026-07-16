import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from api.v1.import_pdf import _save_upload
from schemas.import_response import ImportResponse
from services.pipeline import run_import

router = APIRouter()


@router.post("/image", response_model=ImportResponse)
async def import_image(file: UploadFile = File(...)):
    suffix = Path(file.filename or "image.png").suffix or ".png"
    saved = _save_upload(file, suffix)
    result = run_import("image", saved)
    return ImportResponse(**result)
