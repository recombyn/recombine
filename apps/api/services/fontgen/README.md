# AI Font Generator Pipeline
#
# Flow:
#   1. POST /api/v1/fonts/generate  → MySQL/SQLite `font_tasks` + Celery queue (+ wallet charge)
#   2. Worker: OpenCV denoise/binarize style ref → MinIO/local
#   3. Call FONT_INFERENCE_URL (zi2zi / DG-Font) or local Pillow fallback → glyph bitmaps
#   4. pypotrace (optional) / OpenCV contours → vector paths
#   5. Calibrate baseline / bearings / advance
#   6. fontTools compile TTF → storage
#   7. Poll GET /api/v1/fonts/tasks/{id} for ttfUrl + previewUrl
#
# Setup:
#   pip install -e ".[fontgen]"   # or: fonttools Pillow opencv-python-headless numpy
#   # optional: pypotrace (system potrace libs required)
#   celery -A worker.celery_app.celery worker -l info --pool=solo
#
# Env:
#   FONT_INFERENCE_URL=http://host:8100   # optional
#   FONT_SYNC_FALLBACK=true               # thread fallback if Redis down
#   S3_ENABLED=true …                     # MinIO / COS for artifacts
#
# Inference contract (POST {FONT_INFERENCE_URL}/generate):
#   request:  { charset, description, style_image_url?, style_image_b64? }
#   response: { glyphs: [{ char, image: dataURL|base64, width?, height? }] }
