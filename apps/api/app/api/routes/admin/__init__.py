"""Admin API — /api/v1/admin/* for recombyn-admin."""

from fastapi import APIRouter

from app.api.routes.admin import catalog, content, design, fonts, users

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(users.router)
router.include_router(content.router)
router.include_router(catalog.router)
router.include_router(design.router)
router.include_router(fonts.router)
