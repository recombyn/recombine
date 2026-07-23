# 安装

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate

# 先装共享库
pip install -e ../../packages/scene-builder-py

# 再装 API（含 Celery / Redis / pdf2image）
pip install -e .

# OCR 可选（阶段二）
pip install -e ".[ocr,dev]"
# 另装 PaddlePaddle（按平台选择，示例 CPU）
# pip install paddlepaddle -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
```

## 阶段一运行

需要本机/容器具备：

- **Redis**（broker + job 状态）
- **poppler**（`pdf2image`；Windows 需安装并配置 `POPPLER_PATH`）
- **LibreOffice**（DOCX→PDF；配置 `LIBREOFFICE_PATH`）

### 1. 启动 Redis

```bash
# 仓库根目录
docker compose up -d redis
```

### 2. API

```bash
cd apps/api
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Celery worker（另开终端，cwd = apps/api）

```bash
celery -A worker.celery_app.celery worker -l info
```

Windows 若 `celery` 报错，可用：

```bash
celery -A worker.celery_app.celery worker -l info --pool=solo
```

### 环境变量示例（`apps/api/.env`）

```env
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
LIBREOFFICE_PATH=soffice
# Windows 示例：
# POPPLER_PATH=C:\poppler\Library\bin
IMPORT_DPI=200
USE_VISION=true
OCR_LANG=ch
SCENE_TARGET_WIDTH=794
PALETTE_K=5
ENABLE_SAM=false
ENABLE_LAMA=false
```

## 阶段二：页图视觉识别

管线：页图 → OpenCV 预处理 → PPStructure（有则）/ PaddleOCR → KMeans 色板 → Scene。

- 未安装 OCR 时：数字 PDF 回退 `pdfplumber`；图片可能空文档 + warning
- `meta.engines` / `meta.palette` 可在 job 结果里查看
- SAM / LaMa 默认关闭，仅为可插拔钩子（见 `services/vision/sam.py`、`lama.py`）

## 阶段三：S3 + 前端异步导入

```bash
pip install -e ".[storage]"
```

`.env` 中设 `S3_ENABLED=true` 并配置 endpoint / key / bucket（OSS、COS、MinIO、AWS 通用）。  
前端导入已改为轮询 `/api/v1/import/jobs`，请保持 **API + Redis + Worker** 同时运行。

## 阶段六：健康检查与联调

```bash
make health
# 或
python scripts/smoke_health.py
```

Docker（含 poppler）：

```bash
# 可选打入 OCR：INSTALL_OCR=true docker compose build api worker
docker compose up -d redis api worker
```

前端在 Redis/Worker 不可用时会自动回退到同步导入接口。

## 接口

### 同步（兼容现有前端）

- `POST /api/v1/import/pdf`
- `POST /api/v1/import/docx`
- `POST /api/v1/import/image`

返回 Scene JSON；同时会尽量把页图落到 `storage/results/_sync/pages/`。

### 异步（推荐）

1. `POST /api/v1/import/jobs`  
   form-data: `file`, `source_type`=`pdf|docx|image`  
   → `{ "job_id": "...", "status": "queued" }`

2. `GET /api/v1/import/jobs/{job_id}`  
   → `queued|processing|done|failed`；`done` 时含 `document`、`meta.page_images`、`meta.palette`、`meta.engines`

页图目录：`storage/results/{job_id}/pages/0001.png` …

## Makefile（仓库根）

```bash
make dev-redis
make dev-api
make dev-worker
```
