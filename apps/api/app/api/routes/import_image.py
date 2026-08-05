import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from app.api.deps import CurrentUser
from app.api.routes.import_pdf import _save_upload
from app.schemas.import_response import ImportResponse
from app.services.pipeline import run_import

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/image", response_model=ImportResponse)
async def import_image(
    _current_user: CurrentUser,
    file: UploadFile = File(...),
):
    suffix = Path(file.filename or "image.png").suffix or ".png"
    saved = _save_upload(file, suffix)
    result = run_import("image", saved)
    return ImportResponse(**result)
