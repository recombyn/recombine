<p align="center">
  <img src="docs/assets/logo-mark.png" alt="Recombyn" width="96" height="96" />
</p>

<p align="center">
  <strong>recombyn</strong><br />
  <sub>开源画布 + AI 设计 Agent</sub>
</p>

<p align="center">
  <a href="docs/self-hosting.md"><strong>自托管</strong></a> ·
  <a href="https://recombyn.com"><strong>Cloud</strong></a> ·
  <a href="apps/docs"><strong>文档</strong></a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="#readme">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Source--Available-orange.svg" alt="Recombyn Source Available License" /></a>
  <a href="docs/self-hosting.md"><img src="https://img.shields.io/badge/self--host-Docker%20Compose-2496ED?logo=docker&logoColor=white" alt="Self-host" /></a>
  <a href="apps/web"><img src="https://img.shields.io/badge/web-React%20%2B%20TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="apps/api"><img src="https://img.shields.io/badge/api-FastAPI%20%2B%20Python-3776AB?logo=python&logoColor=white" alt="Python" /></a>
</p>

**Recombyn** 是 **画布编辑器 + AI Design Agent**（源码可得 / source-available）。  
在无限画布上创作；Agent 基于 LangGraph 直接改图层、图形、文字与布局——用对话驱动设计。

几分钟用 Docker Compose 自托管（默认 **MySQL** + Redis + Web + API + **Yjs 协作**）。本地开发可空 `DATABASE_URL` 用 **SQLite**；也可切 **PostgreSQL**（见 [docs/postgres-switch.md](docs/postgres-switch.md)）。

---

## 为什么选 Recombyn？

- **真·画布编辑** — 画板、形状、图片、视频、文字，可导出与分享
- **实时多人协作** — 同一项目 Yjs 同步（光标、选区、撤销）；分享可只读或可编辑
- **Agent 落笔改稿** — 对话规划并执行画布操作
- **自托管优先** — 本地 / 服务器同一套栈
- **可组合** — `apps/api/data/public/` 含基建种子 + 提示词包 + **5 个核心 Agent Skill**

## 核心能力

- **可视化编辑** — 选区、图层、填充、导出、分享  
- **实时协作** — Yjs WebSocket（`apps/collab`）；编辑器 Live 状态条；生产经 nginx `/collab/` 走 WSS  
- **Design Agent** — LangGraph 工具 / 技能；创建 / 编辑 / 闲聊，流式对话 UI  
- **图片导入** — 本地图片 → 可编辑画布节点  
- **广场与项目** — 灵感流与作品（API）

## 快速开始（自托管）

```bash
git clone https://github.com/recombyn/recombine.git
cd recombine
cp apps/api/.env.example apps/api/.env   # 填入 LLM_API_KEY 等
docker compose up -d --build
```

| 服务 | 地址 |
|------|------|
| Web | http://localhost:3000 |
| API 文档 | http://localhost:8000/docs |
| MySQL | `127.0.0.1:3306` · `recombyn` / `recombyn` |

更多选项（环境变量、模型密钥、生产加固）：**[docs/self-hosting.md](docs/self-hosting.md)** · Postgres：**[docs/postgres-switch.md](docs/postgres-switch.md)**

### 本地开发

```bash
docker compose up -d redis
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api              # 空 DATABASE_URL → SQLite
npm run dev:collab           # Yjs WS :1234（可选；Vite DEV 默认开协作）
npm run dev:web
```

画布 Live / WSS：**[docs/self-hosting.md § Canvas multiplayer](docs/self-hosting.md#canvas-multiplayer-yjs--wss)** · [apps/collab/README.md](apps/collab/README.md)

## 仓库结构

```
apps/web/          React 画布 + Agent UI + Yjs 客户端
apps/api/          FastAPI（含 collab room-token）
apps/collab/       Yjs WebSocket 服务（y-websocket）
apps/docs/         帮助 / 法律站
packages/          共享协议
docs/              架构与自托管（含 Postgres 切换）
deploy/            Dockerfile / Nginx
e2e/               Playwright
```

## 文档与社区

- [自托管](docs/self-hosting.md) · [PostgreSQL 切换](docs/postgres-switch.md) · [贡献指南](CONTRIBUTING.md) · [安全](SECURITY.md) · [行为准则](CODE_OF_CONDUCT.md)
- Issue / PR 模板见 `.github/`
## 协议

[Recombyn Source Available License v1.0](./LICENSE) © Recombyn contributors · [NOTICE](./NOTICE)

源码可得协议（非 OSI 开源）：

- **个人 / 私有自托管** — 免费
- **单一组织内部使用** — 允许
- **将 Recombyn 作为托管/管理型服务提供给第三方**（无论收费与否）— **需商业授权**（`702680355@qq.com`）

完整条款见 [LICENSE](./LICENSE)。

## 帮忙点个 ⭐ Star

开源不易，如果觉得 Recombyn 对您的工作还有帮助，请帮忙在 GitHub 仓库右上角点个 ⭐ Star。您的支持是让 Recombyn 变得更好最大的动力。

→ [https://github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)
