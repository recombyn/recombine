# 导入管线

> **产品现状**：对外仅支持**图片导入**。PDF / DOCX 相关步骤为仓库内遗留实现，**不作为正式产品能力**。

## 阶段一：预处理 + 任务队列（图片）

1. 上传图片
2. Celery 异步任务（可选）+ Redis 存 job 状态
3. 图片：归一化为单页图
4. 页图写入 `storage/results/{job_id}/pages/`

遗留（非产品路径）：PDF 经 `pdf2image` + poppler；DOCX 经 LibreOffice → PDF → 页图。

## 阶段二：图像算法（页图 → 布局/文字）

在页图上运行（`USE_VISION=true`，默认开启）：

| 模块 | 作用 | 依赖 |
|------|------|------|
| OpenCV | 降噪 / CLAHE 增强 | `opencv-python-headless` |
| PaddleOCR | 文字框 + 文本 | `paddleocr` + PaddlePaddle |
| PPStructure | 版面（标题/图/表），失败则回退 OCR | 随 `paddleocr` |
| KMeans | 主色板 `meta.palette` | OpenCV |
| 轻量 SAM | 区域提案（默认关，需模型） | 可选 |
| LaMa | 修复/去字（默认关） | 可选 |

数字 PDF 遗留链路：若视觉链路无结果，仍可能回退 `pdfplumber` 文字层（非产品保证）。

坐标会缩放到 `SCENE_TARGET_WIDTH`（默认 794）再写入 Scene。

## 阶段三：对象存储 + 前端异步导入

### S3 兼容存储

默认本地磁盘。开启后通过 boto3 上传页图（兼容阿里云 OSS、腾讯云 COS、MinIO、AWS S3）：

```env
S3_ENABLED=true
S3_ENDPOINT_URL=https://oss-cn-hangzhou.aliyuncs.com   # 或 COS/MinIO endpoint
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=resume-scene
S3_REGION=us-east-1
S3_PUBLIC_BASE_URL=https://cdn.example.com             # 可选，拼公开 URL
S3_ADDRESSING_STYLE=virtual                            # 部分网关用 path
```

```bash
pip install -e ".[storage]"
```

任务结果 `meta`：`object_keys`、`object_urls`（本地模式与 `page_images` 同源）。

### 前端

首页「导入文件」走异步 Job：

1. `POST /api/v1/import/jobs`
2. 轮询 `GET /api/v1/import/jobs/{id}`
3. `done` 后打开编辑器

需同时运行 API + Redis + Celery worker。

## 阶段四：文本合并 + 图/表图层

1. OCR/版面结果中的碎文本按行高聚类合并为更少的 textbox（`merge_text_blocks`）
2. PPStructure 检出的 figure/table：从页图裁剪为 PNG data URL，落入 Scene `image` 节点；裁剪失败的 table 用浅色 `rect` 占位
3. 多页时按页高垂直拼接到同一画布
4. `pdfplumber` 回退路径同样经过行合并

`meta.engines` 可能出现：`merge`、`crop`。

## 阶段五：表格单元格 + SAM/LaMa 接入

1. **表格**：版面检出的 table 默认再 OCR，拆成背景 `rect` + 可编辑 text 单元格（`EXPAND_TABLE_CELLS=true`，`engines` 含 `table-cells`）
2. **SAM**：`ENABLE_SAM=true` 且配置 `SAM_CHECKPOINT` 权重时运行 MobileSAM / segment_anything；大区域裁成 image 层
3. **LaMa**：`ENABLE_LAMA=true` 时，可用 `simple-lama-inpainting` 或 OpenCV Telea；默认用 SAM 框作 mask（`LAMA_USE_SAM_MASK=true`）

```env
EXPAND_TABLE_CELLS=true
ENABLE_SAM=false
SAM_CHECKPOINT=/path/to/mobile_sam.pt
SAM_MODEL_TYPE=vit_t
ENABLE_LAMA=false
LAMA_USE_SAM_MASK=true
```

前端导入时会提示「正在导入…」。

## 阶段六：联调就绪

- `GET /api/v1/health` 返回 `redis` / `worker` / `ocr` 状态
- Docker API 镜像含 poppler；`INSTALL_OCR=true docker compose build` 可打入 OCR
- 前端异步 Job 失败或排队过久时自动回退同步导入
- `make health` / `python scripts/smoke_health.py`

```bash
make dev-stack          # redis + api + worker
# 或本地：
make dev-redis && make dev-api && make dev-worker
```

## API

- 同步：`POST /api/v1/import/{pdf,docx,image}`
- 异步：`POST /api/v1/import/jobs` → `GET /api/v1/import/jobs/{id}`

`meta` 字段：`page_images`、`object_keys`、`object_urls`、`palette`、`engines`、`warnings`。

## 安装 OCR

```bash
pip install -e ".[ocr]"
# CPU Paddle（示例）
pip install paddlepaddle -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
```

## 待完善

- [x] 异步 OCR 任务队列
- [x] S3 对象存储（阶段三）
- [x] 行合并为更稳的 textbox
- [x] figure/table 落盘为可编辑图层
- [x] table 结构识别为可编辑单元格（OCR 单元格，非完美表格重建）
- [x] 接入手动 SAM/LaMa 权重路径（可选开启）
