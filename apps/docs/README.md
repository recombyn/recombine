# recombyn 文档站

Vite + React 文档站。

- **帮助文档**：白底文档壳（顶栏 / 侧栏 / 面包屑），入口如 `/guide/getting-started`
- **法律页**：独立深色阅读页，入口如 `/legal/terms`（不嵌套帮助文档框架）
- **国际化**：顶栏语言切换，支持 `en` / `zh-CN` / `zh-TW` / `ja`；与主站共用 localStorage 键 `language`

## 本地预览

```bash
# 仓库根目录
npm install
npm run dev:docs
```

默认 [http://localhost:5175](http://localhost:5175)。主站开发时在 `apps/web` 设置：

```bash
VITE_DOCS_URL=http://localhost:5175
```

## 构建

```bash
npm run build:docs
```

产物在 `apps/docs/dist`。

## 内容

Markdown 按语言分目录，在 `content/{locale}/`：

| 路径 | 内容 |
|------|------|
| `content/zh-CN/` | 简体中文（默认） |
| `content/zh-TW/` | 繁體中文 |
| `content/en/` | English |
| `content/ja/` | 日本語 |

各语言下结构相同：`guide/`、`features/`、`faq/`、`legal/`。

顶栏 / 侧栏文案在 `src/i18n/locales/`。缺某语言正文时会按 `zh-CN → en → zh-TW → ja` 回退。

「开始创作 / 首页」指向 `VITE_APP_URL`（默认 `https://recombyn.com`）。
