# Import pipeline

> **Product status**: externally, only **image import** is supported.

## Stage 1: preprocess + job queue (images)

1. Upload image
2. Optional Celery async job + Redis job status
3. Normalize image to a single page bitmap
4. Write page images under `storage/results/{job_id}/pages/`

## Stage 2: vision algorithms (page image → layout/text)

Run on the page image (`USE_VISION=true`, on by default):

| Module | Role | Dependency |
|--------|------|------------|
| OpenCV | Denoise / CLAHE | `opencv-python-headless` |
| PaddleOCR | Text boxes + text | `paddleocr` + PaddlePaddle |
| PPStructure | Layout (title/figure/table); falls back to OCR on failure | with `paddleocr` |
| KMeans | Primary palette `meta.palette` | OpenCV |
| Lightweight SAM | Region proposals (off by default; needs weights) | optional |
| LaMa | Inpaint / remove text (off by default) | optional |

Coordinates are scaled to `SCENE_TARGET_WIDTH` (default 794) before writing Scene.

## Stage 3: object storage + frontend async import

### S3-compatible storage

Local disk by default. When enabled, page images upload via boto3 (Aliyun OSS, Tencent COS, MinIO, AWS S3):

```env
S3_ENABLED=true
S3_ENDPOINT_URL=https://oss-cn-hangzhou.aliyuncs.com   # or COS/MinIO endpoint
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=resume-scene
S3_REGION=us-east-1
S3_PUBLIC_BASE_URL=https://cdn.example.com             # optional public URL base
S3_ADDRESSING_STYLE=virtual                            # some gateways need path
```

```bash
pip install -e ".[storage]"
```

Job result `meta`: `object_keys`, `object_urls` (same source as `page_images` in local mode).

### Frontend

Home “Import file” uses an async job:

1. `POST /api/v1/import/jobs`
2. Poll `GET /api/v1/import/jobs/{id}`
3. On `done`, open the editor

Requires API + Redis + Celery worker running together.

## Stage 4: text merge + figure/table layers

1. Fragment OCR/layout text is clustered by line height into fewer textboxes (`merge_text_blocks`)
2. PPStructure figures/tables: crop from the page image to PNG data URLs as Scene `image` nodes; failed table crops use a light `rect` placeholder
3. Multi-page: stack pages vertically on one canvas by page height

`meta.engines` may include: `merge`, `crop`.

## Stage 5: table cells + SAM/LaMa hooks

1. **Tables**: layout tables are OCR’d again by default into background `rect` + editable text cells (`EXPAND_TABLE_CELLS=true`, `engines` includes `table-cells`)
2. **SAM**: when `ENABLE_SAM=true` and `SAM_CHECKPOINT` is set, run MobileSAM / segment_anything; large regions become image layers
3. **LaMa**: when `ENABLE_LAMA=true`, use `simple-lama-inpainting` or OpenCV Telea; default mask from SAM boxes (`LAMA_USE_SAM_MASK=true`)

```env
EXPAND_TABLE_CELLS=true
ENABLE_SAM=false
SAM_CHECKPOINT=/path/to/mobile_sam.pt
SAM_MODEL_TYPE=vit_t
ENABLE_LAMA=false
LAMA_USE_SAM_MASK=true
```

The frontend shows “Importing…” during import.

## Stage 6: integration readiness

- `GET /api/v1/health` reports `redis` / `worker` / `ocr` status
- `INSTALL_OCR=true docker compose build` can bake OCR in
- Frontend auto-falls back to sync import if the async job fails or queues too long
- `make health` / `python scripts/smoke_health.py`

```bash
make dev-stack          # redis + api + worker
# or locally:
make dev-redis && make dev-api && make dev-worker
```

## API

- Sync: `POST /api/v1/import/image` (requires Bearer token)
- Async: `POST /api/v1/import/jobs` → `GET /api/v1/import/jobs/{id}` (`source_type=image`; requires Bearer)

`meta` fields: `page_images`, `object_keys`, `object_urls`, `palette`, `engines`, `warnings`.

## Install OCR

```bash
pip install -e ".[ocr]"
# CPU Paddle (example)
pip install paddlepaddle -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
```

## Checklist

- [x] Async OCR job queue
- [x] S3 object storage (stage 3)
- [x] Line merge into stabler textboxes
- [x] Figures/tables as editable layers
- [x] Table structure → editable cells (OCR cells, not perfect table rebuild)
- [x] Manual SAM/LaMa weight paths (optional)
