from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from config.settings import settings
from services.db import init_schema

app = FastAPI(
    title="Resume Scene API",
    description="Parse PDF/DOCX/Image into Canvas Scene JSON",
    version="0.1.0",
)


@app.on_event("startup")
def _init_stores() -> None:
    init_schema()

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
