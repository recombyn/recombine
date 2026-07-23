"""Design aesthetics: CLIP three-tower encode + RAG score for quality samples."""

from services.design.aesthetics.calibrate import (
    aesthetics_settings,
    calibrate_threshold,
    get_threshold,
    set_threshold,
)
from services.design.aesthetics.clip_encoder import clip_available, clip_status
from services.design.aesthetics.embed_job import embed_quality_sample, schedule_embed
from services.design.aesthetics.from_task import sample_from_task
from services.design.aesthetics.scorer import DEFAULT_THRESHOLD, score_design_image

__all__ = [
    "DEFAULT_THRESHOLD",
    "aesthetics_settings",
    "calibrate_threshold",
    "clip_available",
    "clip_status",
    "embed_quality_sample",
    "get_threshold",
    "sample_from_task",
    "schedule_embed",
    "score_design_image",
    "set_threshold",
]
