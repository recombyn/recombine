from fastapi import APIRouter

from api.v1 import (
    auth,
    chat,
    chat_sessions,
    health,
    image_tools,
    import_design,
    import_docx,
    import_image,
    import_jobs,
    import_pdf,
    plaza,
    projects,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(auth.wallet_router, prefix="/wallet", tags=["wallet"])
api_router.include_router(plaza.router, prefix="/plaza", tags=["plaza"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(chat_sessions.router, prefix="/chat-sessions", tags=["chat-sessions"])
api_router.include_router(import_pdf.router, prefix="/import", tags=["import"])
api_router.include_router(import_docx.router, prefix="/import", tags=["import"])
api_router.include_router(import_image.router, prefix="/import", tags=["import"])
api_router.include_router(import_design.router, prefix="/import", tags=["import"])
api_router.include_router(import_jobs.router, prefix="/import", tags=["import-jobs"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(image_tools.router, prefix="/image", tags=["image-tools"])
