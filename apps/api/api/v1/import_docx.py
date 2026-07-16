import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from api.v1.import_pdf import _save_upload
from schemas.import_response import ImportResponse
from services.pipeline import run_import

router = APIRouter()


@router.post("/docx", response_model=ImportResponse)
async def import_docx(file: UploadFile = File(...)):
    saved = _save_upload(file, ".docx")
    result = run_import("docx", saved)
    return ImportResponse(**result)
