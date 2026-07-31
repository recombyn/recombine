# Resume Scene API

FastAPI 后端：画布 Scene 解析 / 项目与广场 / Design Agent / Admin 配置。

OpenAPI：http://127.0.0.1:8000/docs

## 目录结构

```
apps/api/
  main.py                 # FastAPI 入口（startup seed / catalog）
  api/
    router.py             # 汇总路由
    v1/                   # HTTP 层（薄）：auth / projects / plaza / design / admin …
  services/               # 业务层（按域分包）
    design/               # Agent 流程、规则、字典、美学样本、编排运行时
    plaza/ auth/ wallet/ llm/ …
    seed.py               # 启动种子：字体、官方案例等
  data/                   # 种子 JSON（版本管理；写入 DB 后以 DB 为准）
  config/                 # settings
  worker/                 # Celery
  storage/                # 本地结果 / 上传
  tests/
  scripts/
```

约定：

- **路由不写业务**：`api/v1/*.py` 只做参数校验与调用 `services/`
- **种子在 `data/`**：流程 / 字典 / 规则默认值用 JSON，避免大段 Python 字面量
- **Admin 改过的值以 DB 为准**：`ensure_*` 只 INSERT 缺失 key，不覆盖已有配置

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
| `official_cases/` | 官方案例（首页灵感 / 广场种子） |

Skill 命名空间、ACL、版本 pin、热加载说明见 [data/design_skills/README.md](./data/design_skills/README.md)。

修改种子后：新环境会自动 seed；已有库需按业务决定是否手工同步或 bump dict `rev`。

## Design / Admin 相关服务

| 模块 | 职责 |
|------|------|
| `services/design/skill_store.py` | Skill 目录、ACL、版本快照、热加载 |
| `services/design/flow_runtime.py` | 运行时执行已发布图 |
| `services/design/admin_store.py` | Admin：流程 CRUD、规则、节点模板、动作契约、复盘 |
| `services/design/dict_store.py` | 字典 |
| `services/design/knowledge_store.py` | 设计知识 |
| `services/design/quality_sample_store.py` | 美学样本 |
| `services/design/agent_controller.py` | Agent 主控 |
| `services/design/orchestrator.py` | 任务编排 |
| `services/security.py` | BYOK vault、脱敏、限流相关 |
| `services/db/backup.py` | 周期性 DB 备份 |

Admin HTTP 前缀：`/api/v1/admin/...`（需管理员会话）。

Postgres / 读写分离 / 备份：见仓库 [docs/postgres-switch.md](../../docs/postgres-switch.md)。

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
uvicorn main:app --reload --host 127.0.0.1 --port 8000
# 或仓库根：npm run dev:api
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

- `POST /api/v1/import/image` — 图片 → Scene JSON

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
