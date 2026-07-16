# 架构

## Monorepo 布局

| 目录 | 职责 |
|------|------|
| `apps/web` | React 编辑器，Fabric 直绘 Scene JSON |
| `apps/api` | FastAPI 导入服务 |
| `packages/scene-schema` | JSON 协议 |
| `packages/scene-builder-py` | 解析块 → Scene JSON |

## 数据流

```
PDF ──> pdfplumber ──────────────┐
DOCX -> LibreOffice -> PDF ──────┤──> scene_builder ──> Scene JSON ──> Web Editor
Image -> OpenCV + PaddleOCR ─────┘
```

## 部署

开发：`npm run dev:web` + `uvicorn`  
生产：Docker Compose（web + api）
