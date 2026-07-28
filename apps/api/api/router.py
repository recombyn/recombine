from fastapi import APIRouter

from api.v1 import (
    admin,
    assets,
    auth,
    chat,
    chat_sessions,
    design,
    fonts,
    health,
    image_tools,
    import_docx,
    import_image,
    import_jobs,
    import_pdf,
    me,
    notices,
    plaza,
    projects,
    shares,
    uploads,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(auth.wallet_router, prefix="/wallet", tags=["wallet"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(me.router, prefix="/me", tags=["me"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(notices.router, prefix="/notices", tags=["notices"])
api_router.include_router(plaza.router, prefix="/plaza", tags=["plaza"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(shares.router, prefix="/shares", tags=["shares"])
api_router.include_router(fonts.router, prefix="/fonts", tags=["fonts"])
api_router.include_router(assets.router, prefix="/assets", tags=["assets"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(chat_sessions.router, prefix="/chat-sessions", tags=["chat-sessions"])
api_router.include_router(import_pdf.router, prefix="/import", tags=["import"])
api_router.include_router(import_docx.router, prefix="/import", tags=["import"])
api_router.include_router(import_image.router, prefix="/import", tags=["import"])
api_router.include_router(import_jobs.router, prefix="/import", tags=["import-jobs"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(image_tools.router, prefix="/image", tags=["image-tools"])
api_router.include_router(design.router, prefix="/design", tags=["design"])
