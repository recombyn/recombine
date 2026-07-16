"""Health / readiness checks for API, Redis, worker, OCR."""

from fastapi import APIRouter

from config.settings import settings

router = APIRouter()


def _check_redis() -> bool:
    try:
        import redis

        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1)
        return bool(client.ping())
    except Exception:
        return False


def _check_worker() -> bool:
    try:
        from worker.celery_app import celery

        inspector = celery.control.inspect(timeout=0.8)
        ping = inspector.ping()
        return bool(ping)
    except Exception:
        return False


def _check_ocr() -> bool:
    try:
        from services.vision.ocr import available

        return available()
    except Exception:
        return False


@router.get("/health")
def health():
    redis_ok = _check_redis()
    worker_ok = _check_worker() if redis_ok else False
    ocr_ok = _check_ocr()

    checks = {
        "api": True,
        "redis": redis_ok,
        "worker": worker_ok,
        "ocr": ocr_ok,
        "use_vision": settings.use_vision,
        "s3": settings.s3_enabled,
    }

    if redis_ok and worker_ok:
        status = "ok"
    elif redis_ok:
        status = "degraded"  # sync import may still work; async jobs queue without drain
    else:
        status = "degraded"

    return {"status": status, "checks": checks}
