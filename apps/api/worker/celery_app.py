from celery import Celery

from config.settings import settings

celery = Celery(
    "resume_scene",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["worker.tasks"],
)

celery.conf.update(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "db-backup-daily": {
            "task": "worker.tasks.run_db_backup_job",
            "schedule": 60 * 60 * 24,  # seconds; override via Celery beat if needed
            "args": ("beat",),
        },
    },
)
