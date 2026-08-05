# Resume Scene API

FastAPI 后端：画布 Scene 解析 / 项目与广场 / Design Agent / Admin 配置。

OpenAPI：http://127.0.0.1:8000/docs

## 目录结构

```
apps/api/                     # ≈ 官方模板 backend/
  app/                        # 官方 app 包
    main.py                   # FastAPI + lifespan
    api/
      deps.py                 # CurrentUser / AdminUser / OptionalUser / SessionDep
      main.py                 # api_router
      routes/                 # HTTP 薄路由
    core/
      config.py               # Settings
      db.py                   # SQLModel engine + Session
    models.py · crud.py       # ORM + session CRUD
    services/                 # 业务域（Design Agent 等）
    schemas/
  worker/ · data/ · storage/ · tests/
  main.py                     # 兼容：from app.main import app
```

约定（完全按官方包结构，见 [docs/api-backend-refactor.md](../../docs/api-backend-refactor.md)）：

- **路由不写业务**：`app/api/routes/*.py` → 调 `app.services.*`；鉴权 `user: CurrentUser`
- **配置**：`from app.core.config import settings`
- **数据访问**：`Session(engine)` + `app.crud.*`；建表由 **Alembic**（`alembic upgrade head` / 启动时 `init_schema()` → `run_migrations()`）
- **迁移目录**：`app/alembic/versions/`（baseline：`0001_baseline` 用 SQLModel metadata `create_all`）
- **手工迁移**：`cd apps/api && alembic revision -m "..." --autogenerate` 后检查再 upgrade
- **启动**：`uvicorn app.main:app`
- **种子在 `data/`**：Admin 改过的值以 DB 为准（`ensure_*` 只插缺失）

## `data/` 种子说明

| 文件 | 用途 |
|------|------|
| `canvas_actions_seed.json` | 画布工具 op（`design_canvas_tool` 冷启动种子） |
| `stage_rule_defaults.json` | 全局规则默认值与描述（提示词 key、开关等） |
| `design_knowledge_seed.json` | 设计知识库种子（kind 标签 + 条目） |
| `design_tokens_seed.json` | Design Token 默认包（schemaVersion + packs） |
| `llm_models_seed.json` | LLM 模型目录 + 生图尺寸预设 + 废弃/过期描述 |
| `progress_stages.json` | 设计运行阶段文案与事件→阶段映射 |
| `design_dicts_seed.json` | Admin 字典类型与条目 |
| `fonts_seed.json` | 字体目录 |
| `design_skills_seed.json` | Agent 核心 Skill（`source=seed` / namespace=`core`） |
| `design_skills/` | 文件包扩展 Skill（`_meta.json` + `SKILL.md`，namespace=`ext`） |

Skill 命名空间、ACL、版本 pin、热加载说明见 [data/public/design_skills/README.md](./data/public/design_skills/README.md)。

修改种子后：新环境会自动 seed；已有库需按业务决定是否手工同步或 bump dict `rev`。

## Design / Admin 相关服务

| 包 / 模块 | 职责 |
|-----------|------|
| `app/services/design/runtime/` | 编排 + LangGraph 运行时（见下） |
| `app/services/design/ops/` | tool_ops 契约与校验 |
| `app/services/design/prompts/` | Skill、prompt pack、knowledge、token |
| `app/services/design/readpath/` | catalog、canvas scene、library |
| `app/services/design/admin/` | Admin 存储、字典、美学样本、schema |
| `app/services/design/aesthetics/` | 美学 RAG |
| `app/services/security.py` | BYOK vault、脱敏、限流相关 |
| `app/services/db/backup.py` | 周期性 DB 备份 |

### Design Agent 调用链

```text
app/api/routes/design.py  POST /run
  → orchestrator.run_design_job      # 权限 / hold / rules
      → design_run.design_stream     # 公开 facade
          → graph.build.run_agent_graph
              # LangGraph 外层 StateGraph + interrupt / lease 驱动
              # 节点内 LangChain（流式 / structured / 可选 create_agent）
```

| 模块 | 职责 |
|------|------|
| `runtime/orchestrator.py` | HTTP 侧入口：门禁后调 `design_stream` |
| `runtime/design_run.py` | Facade：`design_stream` + host 再导出 |
| `runtime/host/` | Prompt 组装、放置、ops 校验、资源加载（产品逻辑，非 LC/LG 内置） |
| `runtime/graph/` | 外层 StateGraph、nodes、SSE / turn / paint / scene；`build.py` 含续跑驱动 |
| `runtime/agent_controller.py` | 兼容 shim（测试 / serde），非主路径 |
| `runtime/models_route.py` · `llm_step.py` | 选模与单步 LLM |
| `runtime/scene_feedback.py` | FE 回传画布快照（配合 observe `interrupt`） |
| `prompts/*_store.py` | 内容库（pack / skill / knowledge / token） |

完整约定（含 **LC/LG 分层、节点图、生命周期 / HITL / critique、Skills vs 语料**）见仓库 [docs/design-agent-runtime.md](../../docs/design-agent-runtime.md)。

Admin HTTP 前缀：`/api/v1/admin/...`（需管理员会话）。

Postgres / 读写分离 / 备份 / LangGraph checkpointer：见仓库 [docs/postgres-switch.md](../../docs/postgres-switch.md)。

### LangGraph checkpointer

`get_agent_checkpointer()`（`app/services/llm/agent.py`）供 Design 外层图与 `create_agent` 共用：

1. **MySQL ≥ 8.0.19**（`LANGGRAPH_CHECKPOINT_URL` 或 `DATABASE_URL`）
2. 否则 **SQLite**（`LANGGRAPH_CHECKPOINT_SQLITE_PATH`，默认 `storage/langgraph_checkpoints.db`）+ async bridge（供 `graph.astream`）
3. 再否则内存

## 安装

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate

# 先装共享库
pip install -e ../../packages/scene-builder-py

# 再装 API（含 Celery / Redis / pdf2image）
pip install -e .

# OCR 可选
pip install -e ".[ocr,dev]"
```

## 本地运行

需要：

- **Redis**（broker + job 状态）

> 产品侧当前仅支持**图片导入**。下列 PDF / DOCX 相关依赖与接口为仓库内遗留能力，**不作为正式产品能力宣传或保证**。

可选（遗留 PDF / DOCX 管线）：

- **poppler**（`pdf2image`；Windows 配置 `POPPLER_PATH`）
- **LibreOffice**（DOCX→PDF；`LIBREOFFICE_PATH`）

### 1. Redis

```bash
# 仓库根目录
docker compose up -d redis
```

### 2. API

```bash
cd apps/api
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# 或仓库根：npm run dev:api
# 兼容：uvicorn main:app（根 main.py 再导出）
```

### 3. Celery worker（另开终端，cwd = apps/api）

```bash
celery -A worker.celery_app.celery worker -l info
```

Windows：

```bash
celery -A worker.celery_app.celery worker -l info --pool=solo
```

### 环境变量（`apps/api/.env`）

复制 `.env.example`。常用项：

```env
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
LIBREOFFICE_PATH=soffice
# POPPLER_PATH=C:\poppler\Library\bin
IMPORT_DPI=200
USE_VISION=true
OCR_LANG=ch
```

LLM / 对象存储等见 `.env.example`。

## 导入管线

### 产品支持

- `POST /api/v1/import/image` — 图片 → Scene JSON（需 Bearer）

### 遗留（不作为正式产品能力）

同步兼容接口仍可能存在于仓库中，但 **PDF / DOCX 导入当前不对外支持**：

- `POST /api/v1/import/pdf`
- `POST /api/v1/import/docx`

### 异步（推荐用于图片）

1. `POST /api/v1/import/jobs` → `{ job_id, status }`（`source_type=image`）
2. `GET /api/v1/import/jobs/{job_id}` → `queued|processing|done|failed`

页图：`storage/results/{job_id}/pages/`。

未装 OCR 时图片可能得到空文档。SAM / LaMa 默认关闭。

## 存储（可选）

```bash
pip install -e ".[storage]"
```

`.env` 设 `S3_ENABLED=true` 并配置 endpoint / key / bucket。

## 健康检查

```bash
# 仓库根
make health
# 或
python scripts/smoke_health.py
```

```bash
docker compose up -d redis api worker
```

## Makefile（仓库根）

```bash
make dev-redis
make dev-api
make dev-worker
```

## 测试

```bash
# 仓库根
npm run test:api
npm run test:api:unit
```

用例在 `tests/unit_tests/`、`tests/integration_tests/`。
