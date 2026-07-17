/**
 * Internal design-style guides for the Agent.
 * Bodies live in `apps/web/agent-skills/*.md` (gitignored).
 * Do NOT dump all categories into the system prompt — the agent calls
 * `lookup_design_skill` for the section it needs at each phase.
 */

export type SkillId =
  | 'core'
  | 'ui'
  | 'icon'
  | 'banner'
  | 'poster'
  | 'ecommerce'
  | 'packaging'
  | 'brand';

export type SkillFocus =
  | 'all'
  | 'layout'
  | 'density'
  | 'spacing'
  | 'color'
  | 'typography'
  | 'icons'
  | 'decoration'
  | 'techniques'
  | 'illustration'
  | 'sizes'
  | 'components'
  | 'execution';

type SkillEntry = {
  id: SkillId;
  file: string;
  label: string;
  when: string;
};

const SKILL_FILES: SkillEntry[] = [
  {
    id: 'core',
    file: '_core.md',
    label: 'Core / 通用',
    when: 'Always available hard rules; density & progressive workflow',
  },
  {
    id: 'ui',
    file: 'ui.md',
    label: 'UI / UI设计',
    when: 'App / product UI / admin / dashboard / components / carousel chrome',
  },
  {
    id: 'icon',
    file: 'icon.md',
    label: 'Icon / 图标',
    when: 'Nav icons, 金刚区 shortcut grid, toolbar, tab bar, empty-state icons',
  },
  {
    id: 'banner',
    file: 'banner.md',
    label: 'Banner / Banner设计',
    when: 'Hero strip, 通栏, 广告条, 轮播画稿, in-UI campaign slot artwork',
  },
  {
    id: 'poster',
    file: 'poster.md',
    label: 'Poster / 海报',
    when: 'Poster, 主视觉, KV, campaign key visual',
  },
  {
    id: 'ecommerce',
    file: 'ecommerce.md',
    label: 'E-commerce / 电商',
    when: 'Main image, detail page, store promo',
  },
  {
    id: 'packaging',
    file: 'packaging.md',
    label: 'Packaging / 包装',
    when: 'Box face, label, dieline',
  },
  {
    id: 'brand',
    file: 'brand.md',
    label: 'Brand VI / VI·画册·展板',
    when: 'VI kit, brochure, exhibition board',
  },
];

const FOCUS_ALIASES: Record<Exclude<SkillFocus, 'all'>, string[]> = {
  layout: ['layout', '排版', '构图'],
  density: ['density', '疏密'],
  spacing: ['spacing', '边距', 'margin'],
  color: ['color', '配色'],
  typography: ['typography', 'type', '文字', '字体'],
  icons: ['icons', 'icon', '图标'],
  decoration: ['decoration', '装饰'],
  techniques: ['techniques', '手法'],
  illustration: ['illustration', '插画', 'carousel', '轮播'],
  sizes: ['sizes', 'canvas sizes', '尺寸'],
  components: ['components', '组件', 'execution', '落地', 'landing', 'ui embedding', '界面内嵌'],
  execution: ['execution', '落地', 'landing', '工作方式'],
};

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

function splitMarkdownSections(body: string): { title: string; content: string }[] {
  const lines = body.split(/\r?\n/);
  const sections: { title: string; content: string }[] = [];
  let curTitle = '_intro';
  let buf: string[] = [];
  const flush = () => {
    const content = buf.join('\n').trim();
    if (content || curTitle !== '_intro') {
      sections.push({ title: curTitle, content });
    }
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)\s*$/);
    if (m) {
      flush();
      curTitle = m[1].trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return sections;
}

function sectionMatchesFocus(title: string, focus: SkillFocus): boolean {
  if (focus === 'all') return true;
  const keys = FOCUS_ALIASES[focus] || [focus];
  const t = title.toLowerCase();
  return keys.some((k) => t.includes(k.toLowerCase()));
}

const CORE_FALLBACK = `
Design Agent · Core hard rules / 通用硬性规则
- Color: 1 primary + 1–2 secondary + neutrals; ≤4 hues.
- Layout first, then details; density: tight / medium / loose.
- Functional copy via create_text. Vector only; placeholders if no attach; no silent delete_nodes.
`.trim();

function loadBody(fileName: string): string {
  const raw = readRaw(fileName);
  if (!raw.trim()) return fileName === '_core.md' ? CORE_FALLBACK : '';
  return stripFrontmatter(raw).body || (fileName === '_core.md' ? CORE_FALLBACK : '');
}

/** Catalog string for the agent (no full bodies). */
export function listDesignSkillCatalog(): string {
  return SKILL_FILES.map((s) => `- **${s.id}** (${s.label}): ${s.when}`).join('\n');
}

/**
 * On-demand skill lookup. Prefer focus slices (layout → color → polish)
 * instead of loading an entire category at once.
 */
export function lookupDesignSkill(
  skillRaw: string,
  focusRaw?: string | null
): { skill: string; focus: string; found: boolean; body: string } {
  const skillKey = String(skillRaw || '')
    .trim()
    .toLowerCase()
    .replace(/\.md$/, '');
  const focus = (String(focusRaw || 'all').trim().toLowerCase() || 'all') as SkillFocus;

  const aliases: Record<string, SkillId> = {
    core: 'core',
    _core: 'core',
    general: 'core',
    ui: 'ui',
    app: 'ui',
    admin: 'ui',
    icon: 'icon',
    icons: 'icon',
    图标: 'icon',
    banner: 'banner',
    通栏: 'banner',
    轮播: 'banner',
    poster: 'poster',
    海报: 'poster',
    ecommerce: 'ecommerce',
    ecom: 'ecommerce',
    电商: 'ecommerce',
    packaging: 'packaging',
    包装: 'packaging',
    brand: 'brand',
    vi: 'brand',
    画册: 'brand',
    展板: 'brand',
  };

  const id = aliases[skillKey] || (SKILL_FILES.some((s) => s.id === skillKey) ? (skillKey as SkillId) : null);
  if (!id) {
    return {
      skill: skillKey,
      focus,
      found: false,
      body: `Unknown skill "${skillKey}". Available:\n${listDesignSkillCatalog()}`,
    };
  }

  const entry = SKILL_FILES.find((s) => s.id === id)!;
  const full = loadBody(entry.file);
  if (!full) {
    return {
      skill: id,
      focus,
      found: false,
      body: `Skill file ${entry.file} is missing. Copy from agent-skills.example/.`,
    };
  }

  if (focus === 'all') {
    return { skill: id, focus, found: true, body: full };
  }

  const sections = splitMarkdownSections(full);
  const picked = sections.filter((s) => sectionMatchesFocus(s.title, focus));
  if (!picked.length) {
    const titles = sections.map((s) => s.title).filter((t) => t !== '_intro');
    return {
      skill: id,
      focus,
      found: true,
      body: `No section matched focus="${focus}" in ${id}. Available sections: ${titles.join(' · ') || '(none)'}\n\nReturning full skill:\n\n${full}`,
    };
  }

  const body = picked
    .map((s) => (s.title === '_intro' ? s.content : `## ${s.title}\n\n${s.content}`))
    .join('\n\n');
  return { skill: id, focus, found: true, body };
}

export const LAYOUT_CORE = loadBody('_core.md') || CORE_FALLBACK;

/**
 * Slim router injected every turn — NOT the full skill library.
 * Category details come from lookup_design_skill.
 */
export const AUTO_STYLE_GUIDE = `
# Design skill router · 设计规范路由（按需查阅，禁止一次塞全库）

Skills are **not** all in context. Call tool **lookup_design_skill** when you need rules.
规范**不会**一次性全部注入。需要哪条规则就查哪条：调用 **lookup_design_skill**。

## Catalog · 可查 skill
${listDesignSkillCatalog()}

## Progressive workflow · 分阶段执行（默认顺序）

1. **Infer category** from the user brief (poster / UI / banner / icon / …).
   从需求判断品类。
2. **Layout + density + spacing first** — \`lookup_design_skill(category, focus="layout")\` then \`density\` / \`spacing\` (or core density). Decide composition, zones, type hierarchy, 疏密. Land frames/blocks/text positions.
   **先排版与疏密**：查 layout / density / spacing → 定构图、分区、字号层级与疏密，落地画板与文案块。
3. **Color next** — \`lookup_design_skill(category, focus="color")\` (+ core color if needed). Apply fills/palette; do not invent extra hues.
   **再配色**：查 color → 上色，不乱加色相。
4. **Polish** — as needed: typography redesign (display title?), icons (\`icon\` skill for 金刚区), decoration, techniques, illustration.
   **再打磨**：按需查 typography / icons / decoration / techniques / illustration。
5. Cross-skill: UI carousel/banner slot → layout chrome with **ui**; artwork with **banner**; icons with **icon**.
   UI 含轮播/活动位：界面跟 **ui**，画稿跟 **banner**，图标跟 **icon**。

## When to split steps · 何时分步让用户确认

- Prefer **one high-quality pass** when the ask is clear and scope is moderate.
  需求清晰、范围适中 → **一次高质量做完**。
- If the job is long (full multi-module screen + complex illustration + many states), use **ask_user** after the layout pass (or before a heavy illustration pass) with options like「继续配色与细化」「先确认排版再继续」.
  任务很长 → 排版完成后（或复杂插画前）用 **ask_user** 让用户确认再继续。
- **Illustration**: simple flat/geometric vector art → do inline. Complex narrative/scene illustration → separate step or \`create_image\` placeholder (never invent bitmaps).
  **插画**：简单几何矢量当面做；复杂叙事插画可分步或图片占位（禁止擅自生图）。

## Hard rules always on · 始终生效（不必查库也会遵守）

- Vector chrome & icons; functional copy = \`create_text\`; no silent \`delete_nodes\`.
- No image generation — user attach → \`attachmentIndex\`; else placeholder / vector illustration.
- User refs/style brief override category taste inside these hard rules.

## Focus values for lookup_design_skill · focus 可选值

\`layout\` | \`density\` | \`spacing\` | \`color\` | \`typography\` | \`icons\` | \`decoration\` | \`techniques\` | \`illustration\` | \`sizes\` | \`components\` | \`all\`
`.trim();

/** Public template URLs for agent shared assets. */
export const AGENT_TEMPLATES = {
  imagePlaceholder: '/agent-templates/image-placeholder.svg',
  avatarPlaceholder: '/agent-templates/avatar-placeholder.svg',
} as const;
