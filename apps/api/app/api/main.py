from fastapi import APIRouter

from app.api.routes import (
    admin,
    assets,
    auth,
    chat,
    chat_sessions,
    collab,
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
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(auth.wallet_router, prefix="/wallet", tags=["wallet"])
api_router.include_router(admin.router)
api_router.include_router(me.router)
api_router.include_router(users.router)
api_router.include_router(notices.router)
api_router.include_router(plaza.router)
api_router.include_router(projects.router)
api_router.include_router(shares.router)
api_router.include_router(collab.router)
api_router.include_router(fonts.router)
api_router.include_router(assets.router)
api_router.include_router(uploads.router)
api_router.include_router(chat_sessions.router)
api_router.include_router(import_pdf.router)
api_router.include_router(import_docx.router)
api_router.include_router(import_image.router)
api_router.include_router(import_jobs.router)
api_router.include_router(chat.router)
api_router.include_router(image_tools.router)
api_router.include_router(design.router)
