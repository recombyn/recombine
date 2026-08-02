# API

Base URL: `http://localhost:8000/api/v1`  
完整契约以 Swagger 为准：http://127.0.0.1:8000/docs

## 路由概览

| 前缀 | 说明 |
|------|------|
| `/auth` | 登录 / OAuth / 会话 |
| `/projects` | 项目 CRUD |
| `/plaza` | 广场 feed / 投稿 / 点赞 |
| `/chat` · `/chat-sessions` | Agent 对话与会话 |
| `/uploads` · `/fonts` | 上传与字体 |
| `/image-tools` | 抠图等视觉工具 |
| `/shares` · `/notices` · `/users` | 分享、公告、用户目录 |
| `/design/*` | Design Agent 跑图（SSE）、catalog、canvas-tools、scene 回传 |
| `/import/*` | 图片 → Scene（同步或异步 job） |
| `/admin/*` | 管理端（流程、字典、模型、广场审核等；需管理员） |

## Health

`GET /api/v1/health` → `{ "status": "ok" }`

## Design Agent（摘要）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/design/run` | SSE：权限 → LangGraph agent（事件流） |
| POST | `/design/run/{taskId}/scene` | 前端回传真实画布 inventory |
| GET | `/design/catalog` | 公开 catalog |
| GET | `/design/canvas-tools` | 画布 op 能力表 |

后端调用链与包结构见 [design-agent-runtime.md](./design-agent-runtime.md)。

## Import（摘要）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/import/image` | 上传图片 |
| POST | `/import/jobs` | 异步导入任务（`source_type=image`） |
| GET | `/import/jobs/{id}` | 查询任务状态 |

导入管线细节见 [import-pipeline.md](./import-pipeline.md)。
