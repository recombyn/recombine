# 架构

## Monorepo 布局

| 目录 | 职责 |
|------|------|
| `apps/web` | React 编辑器、首页、Agent 对话 |
| `apps/api` | FastAPI：导入、项目/广场、Design Agent、Admin API |
| `apps/docs` | 用户帮助与法律文档站 |
| `packages/scene-schema` | Scene JSON 协议 |
| `packages/scene-builder-py` | 解析块 → Scene JSON |
| `recombyn-admin`（独立仓） | 管理后台：流程编排、字典、能力配置、运营 |

后端细节见 [apps/api/README.md](../apps/api/README.md)。

## 后端分层

```
HTTP  api/v1/*          薄路由
业务  services/*        按域分包（design / plaza / wallet / …）
种子  data/*.json       流程、字典、字体、官方案例 → DB（INSERT 缺失，不覆盖已有）
运行  flow_runtime + agent_controller / orchestrator
```

Design Agent 的可配置内容（默认图、节点模板、动作契约、字典、全局规则）以 `data/` 为种子源，Admin 发布后以 DB / 已发布图为准。

## 导入数据流

```
PDF ──> pdfplumber / 页图+OCR ──────────────┐
DOCX -> LibreOffice -> PDF ──────────────────┤──> scene_builder ──> Scene JSON ──> Web
Image -> OpenCV + OCR/布局 ──────────────────┘
```

异步任务：Redis + Celery（`POST /api/v1/import/jobs`）。

## 部署

开发：`npm run dev:web` + `npm run dev:api`（+ Redis / Worker 按需）  
生产：Docker Compose（web + api + worker + redis）
