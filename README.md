# recombyn

画布创作 + AI Design Agent — 前后端同仓 monorepo。

- **Web**（`apps/web`）：React 编辑器、首页灵感、Agent 对话
- **API**（`apps/api`）：FastAPI — Scene 解析、项目 / 广场、Agent 运行时、Admin API
- **Docs**（`apps/docs`）：用户帮助与法律页（多语言）
- **Admin**：独立仓库 `recombyn-admin`（流程设计、字典、能力配置）

## 目录结构

```
apps/web/          React 前端
apps/api/          Python API（详见 apps/api/README.md）
apps/docs/         文档站
packages/          共享协议与核心库
docs/              架构 / Scene 规范 / 导入管线
deploy/            Docker / Nginx
scripts/           开发脚本
e2e/               Playwright
```

后端要点：

- HTTP：`apps/api/api/v1/`
- 业务：`apps/api/services/`（`design` / `plaza` / `wallet` / …）
- 种子：`apps/api/data/*.json`（流程、字典、字体、官方案例）

## 快速开始

### 前端

```bash
npm install
npm run dev:web
```

访问 http://localhost:3000

### 后端

```bash
docker compose up -d redis

cd apps/api
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -e ../../packages/scene-builder-py
pip install -e .
# 复制 .env.example → .env

uvicorn main:app --reload --host 127.0.0.1 --port 8000
# 另开终端（导入异步任务需要）：
celery -A worker.celery_app.celery worker -l info --pool=solo
```

或仓库根：`npm run dev:api`

访问 http://127.0.0.1:8000/docs  
详情见 [apps/api/README.md](apps/api/README.md)

### 文档站

```bash
npm run dev:docs
```

### 管理后台

见独立仓库 `recombyn-admin`（对接本仓 API 的 `/api/v1/admin`）。

## 解析链路

| 来源 | 流程 |
|------|------|
| PDF | 转页图 →（可选）OCR/布局 + 色板；失败回退 pdfplumber → Scene |
| DOCX | LibreOffice→PDF → 同上 |
| 图片 | 页图 → OpenCV + OCR/布局 → Scene |

异步：`POST /api/v1/import/jobs` → `GET /api/v1/import/jobs/{id}`

## 自动化测试

| 层级 | 工具 | 目录 |
|------|------|------|
| React 单元 | Vitest + RTL | `apps/web/src/**/*.{test,spec}.tsx` |
| API | pytest | `apps/api/tests/{unit,integration}_tests/` |
| E2E | Playwright | `e2e/tests/` |

```bash
npm run test:web
npm run test:api
npm run test:e2e
```

## 文档

- [API 后端说明](apps/api/README.md)（目录、种子、运行）
- [架构说明](docs/architecture.md)
- [导入管线](docs/import-pipeline.md)
- [Scene JSON 规范](docs/scene-json-spec.md)
- [API 文档](docs/api.md)
- 用户帮助站：`apps/docs`（`npm run dev:docs`）
