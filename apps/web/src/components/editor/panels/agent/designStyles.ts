/**
 * Internal design-style guides for the Agent.
 * Bodies live in `apps/web/agent-skills/*.md` (gitignored) — not user-selectable.
 * Category MDs are merged into AUTO_STYLE_GUIDE; the model infers style from the prompt
 * (and any user-uploaded attachments / context).
 */

const CATEGORY_FILES = [
  { file: 'ui.md', label: 'UI' },
  { file: 'poster.md', label: '海报' },
  { file: 'ecommerce.md', label: '电商' },
  { file: 'packaging.md', label: '包装' },
  { file: 'brand.md', label: 'VI/画册/展板' },
] as const;

const rawModules = import.meta.glob('@agent-skills/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function readRaw(fileName: string): string {
  const hit = Object.entries(rawModules).find(([k]) =>
    k.replace(/\\/g, '/').endsWith(`/${fileName}`)
  );
  return hit ? String(hit[1] || '') : '';
}

function stripFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  if (!text.startsWith('---')) return { meta: {}, body: text.trim() };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: text.trim() };
  const fm = text.slice(3, end).trim();
  const body = text.slice(end + 4).trim();
  const meta: Record<string, string> = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body };
}

const CORE_FALLBACK = `
设计 Agent · 通用规则
- 配色：1主色+1~2辅色+中性，色相≤4。
- 排版：先定构图再细节；8pt 间距；对齐与留白分层。
- 文字：标题→副标题→正文→备注；功能文案原生 text。
- 装饰点缀不铺满；创意手法局部使用。
- 矢量落地；无附图用占位图；禁止擅自 delete_nodes。
`.trim();

function loadCore(): string {
  const raw = readRaw('_core.md');
  if (!raw.trim()) return CORE_FALLBACK;
  return stripFrontmatter(raw).body || CORE_FALLBACK;
}

function loadCategoryBodies(): string {
  const parts: string[] = [];
  for (const c of CATEGORY_FILES) {
    const raw = readRaw(c.file);
    if (!raw.trim()) continue;
    const { body } = stripFrontmatter(raw);
    if (!body) continue;
    parts.push(`### ${c.label}\n${body}`);
  }
  return parts.join('\n\n');
}

export const LAYOUT_CORE = loadCore();

/**
 * Always injected into the agent. No UI skill picker —
 * infer category from the user prompt; honor uploaded refs when present.
 */
export const AUTO_STYLE_GUIDE = `
设计风格：全局内部规范（用户未单独上传风格要求时按此执行）
根据用户提示词判断品类（UI / 海报 / 电商 / 包装 / VI·画册·展板），并遵守通用规则与对应品类规范。
若用户上传了参考图或风格说明，优先对齐用户意图，在通用硬性约束内做调整。

推断提示：
- 含「界面/App/组件/后台/管理」→ UI（后台界面也按 UI：栅格、原生字、禁用酷炫手法）。
- 含「海报/主视觉/活动 KV」→ 海报。
- 含「电商/详情页/主图/促销/店铺」→ 电商。
- 含「包装/盒面/瓶贴/展开图」→ 包装。
- 含「VI/画册/展板/品牌物料/手册」→ VI/画册/展板。
- 含「官网/落地页/网页」→ 偏 UI 栅格与原生字；若强营销主视觉可局部参考海报主标题规则。
- 含「图标/icon」→ 按 UI 图标规则（同层统一、线面分区）。

${LAYOUT_CORE}

${loadCategoryBodies()}
`.trim();

/** Public template URLs for agent shared assets. */
export const AGENT_TEMPLATES = {
  imagePlaceholder: '/agent-templates/image-placeholder.svg',
  avatarPlaceholder: '/agent-templates/avatar-placeholder.svg',
} as const;
