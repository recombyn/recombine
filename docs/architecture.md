# 架构

## 仓库结构

| 目录 | 职责 |
|------|------|
| `apps/web` | React 编辑器、首页、Agent 对话 |
| `apps/api` | FastAPI：导入、项目/广场、Design Agent 等 |
| `apps/docs` | 用户帮助与法律文档站 |
| `packages/scene-schema` | Scene JSON 协议 |
| `packages/scene-builder-py` | 解析块 → Scene JSON |

后端细节见 [apps/api/README.md](../apps/api/README.md)。

## Web 画布

混排约 **5k** 节点日常编辑流畅（Chromium 平移中位约 **17ms**）；矩形向可到约 **10k**；超重 path 建议单场景约 **1k–2k**。靠视口裁剪 + LOD、空间索引命中、写时复制历史实现。复测：`npm run test:stress --workspace=apps/web`。

## 后端分层

```
HTTP  api/v1/*          薄路由
业务  services/*        按域分包（design / plaza / wallet / …）
种子  data/*.json       流程、字典、字体、官方案例 → DB（INSERT 缺失，不覆盖已有）
运行  design.runtime（agent_controller / orchestrator / flow_runtime）
```

Design Agent 的可配置内容（默认图、节点模板、动作契约、字典、全局规则、**Skill**）以 `apps/api/data/` 为种子源；也可在运行后直接改数据库。Skill 支持 `core` / `ext` / `user` 命名空间、ACL 与版本 pin（见 [design_skills/README.md](../apps/api/data/design_skills/README.md)）。

数据库：SQLite / MySQL / PostgreSQL（见 [postgres-switch.md](./postgres-switch.md)）；SQLite 默认 WAL，可选周期备份。

## 导入数据流

```
Image -> OpenCV + OCR/布局 ──> scene_builder ──> Scene JSON ──> Web
```

异步任务：Redis + Celery（`POST /api/v1/import/jobs`，`source_type=image`）。

## 部署

开发：`npm run dev:web` + `npm run dev:api`（+ Redis / Worker 按需）  
生产：Docker Compose（web + api + worker + redis）
