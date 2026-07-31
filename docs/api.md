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
| `/import/*` | 图片 → Scene（同步或异步 job；PDF/DOCX 为遗留接口） |
| `/admin/*` | 管理端（流程、字典、模型、广场审核等；需管理员） |

## Health

`GET /api/v1/health` → `{ "status": "ok" }`

## Import（摘要）

产品支持：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/import/image` | 上传图片 |
| POST | `/import/jobs` | 异步导入任务（`source_type=image`） |
| GET | `/import/jobs/{id}` | 查询任务状态 |

遗留（不作为正式产品能力）：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/import/pdf` | 上传 PDF |
| POST | `/import/docx` | 上传 DOCX |

导入管线细节见 [import-pipeline.md](./import-pipeline.md)。
