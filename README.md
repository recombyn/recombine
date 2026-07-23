# recombyn

简历场景图模板制作工具 — 前后端同仓 monorepo。

- **Web**：React + Fabric.js，按 Canvas Scene JSON 坐标直绘
- **API**：FastAPI，解析 PDF / DOCX / 图片，统一输出 Scene JSON

## 目录结构

```
apps/web/          React 前端编辑器
apps/api/          Python 解析服务
packages/          共享协议与核心库
docs/              架构与 API 文档
deploy/            Docker / Nginx
scripts/           开发脚本
```

## 快速开始

### 前端

```bash
npm install
npm run dev:web
```

访问 http://localhost:3000

### 后端（阶段一：FastAPI + Celery + Redis）

```bash
# Redis
docker compose up -d redis

cd apps/api
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -e ../../packages/scene-builder-py
pip install -e .
# 复制 .env.example → .env，按需改 POPPLER_PATH / LIBREOFFICE_PATH

uvicorn main:app --reload --host 127.0.0.1 --port 8000
# 另开终端：
celery -A worker.celery_app.celery worker -l info --pool=solo
```

访问 http://localhost:8000/docs  
详情见 [apps/api/README.md](apps/api/README.md)

## 解析链路

| 来源 | 流程 |
|------|------|
| PDF | 转页图 →（可选）PPStructure/PaddleOCR + KMeans；失败回退 pdfplumber → Scene |
| DOCX | LibreOffice→PDF → 同上 |
| 图片 | 页图 → OpenCV + OCR/布局 → Scene |

异步任务：`POST /api/v1/import/jobs` → `GET /api/v1/import/jobs/{id}`（页图在 `storage/results/{job_id}/pages/`）



## 自动化测试

分层与 Dify 同类工程一致：前端单元 / API 单元+集成 / Playwright E2E，CI 见 `.github/workflows/`。

| 层级 | 工具 | 目录 | CI |
|------|------|------|-----|
| React 单元 | Vitest + RTL | `apps/web/src/**/*.{test,spec}.tsx` | `web-tests.yml` |
| API 单元/集成 | pytest (+ xdist / cov) | `apps/api/tests/{unit,integration}_tests/` | `api-tests.yml` |
| 浏览器 E2E | Playwright | `e2e/tests/` | `e2e-tests.yml` |

```bash
# 前端
npm run test:web
npm run test:web:watch
npm run test:web:coverage

# 后端
npm run test:api
npm run test:api:unit
npm run test:api:coverage

# E2E（首次需在 e2e/ 执行 npm install && npx playwright install chromium）
npm run test:e2e
```

> 前端使用 **Vitest**（Vite 原生，API 与 Jest+RTL 相同；Dify 当前 web 栈亦已迁到 Vitest）。

## 文档

- [架构说明](docs/architecture.md)
- [导入管线](docs/import-pipeline.md)
- [Scene JSON 规范](docs/scene-json-spec.md)
- [API 文档](docs/api.md)
