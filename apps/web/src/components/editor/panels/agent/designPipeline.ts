/**
 * Fixed design execution pipelines (hard-coded order).
 * Runtime drives phases; the model only executes the current phase.
 *
 * Step-confirm mode = human-in-the-loop / approval gates
 * (similar to Cursor asking you to continue after a plan checkpoint).
 */

export type DesignCategory =
  | 'poster'
  | 'ui'
  | 'banner'
  | 'ecommerce'
  | 'packaging'
  | 'brand'
  | 'icon'
  | 'general';

export type DesignPhaseId =
  | 'structure'
  | 'layout'
  | 'typography'
  | 'color'
  | 'details'
  | 'polish';

export type DesignPhase = {
  id: DesignPhaseId;
  /** Short label for UI chips */
  label: string;
  /** Skill ids to lookup this phase (optional hints for the model) */
  skills: string[];
  /** focus args for lookup_design_skill */
  focuses: string[];
  /** Imperative brief injected into the agent for this phase only */
  brief: string;
};

export const STEP_CONFIRM_STORAGE_KEY = 'recombyn-agent-step-confirm';
export const COLLAB_MODE_STORAGE_KEY = 'recombyn-agent-collab-mode';

/**
 * Collaboration modes (not a boolean switch):
 * - collaborative: human-in-the-loop — confirm after every phase (default)
 * - milestone: confirm only at major gates (after typography / after details)
 * - auto: run the full pipeline without asking
 */
export type AgentCollabMode = 'collaborative' | 'milestone' | 'auto';

export function readCollabMode(): AgentCollabMode {
  try {
    const v = localStorage.getItem(COLLAB_MODE_STORAGE_KEY);
    if (v === 'auto' || v === 'milestone' || v === 'collaborative') return v;
    // Migrate legacy boolean key
    const legacy = localStorage.getItem(STEP_CONFIRM_STORAGE_KEY);
    if (legacy === '0') return 'auto';
    if (legacy === '1') return 'collaborative';
  } catch {
    /* ignore */
  }
  return 'collaborative';
}

export function writeCollabMode(mode: AgentCollabMode) {
  try {
    localStorage.setItem(COLLAB_MODE_STORAGE_KEY, mode);
    localStorage.setItem(STEP_CONFIRM_STORAGE_KEY, mode === 'auto' ? '0' : '1');
  } catch {
    /* ignore */
  }
}

/** @deprecated use readCollabMode */
export function readStepConfirmPreference(): boolean {
  return readCollabMode() !== 'auto';
}

/** @deprecated use writeCollabMode */
export function writeStepConfirmPreference(on: boolean) {
  writeCollabMode(on ? 'collaborative' : 'auto');
}

/** Whether to pause after completing `phaseId` (before advancing). */
export function shouldPauseAfterPhase(
  mode: AgentCollabMode,
  phaseId: DesignPhaseId,
  isLast: boolean,
  pipeline?: DesignPhase[]
): boolean {
  if (isLast || mode === 'auto') return false;
  if (mode === 'collaborative') return true;
  // milestone: major gates only
  const ids = new Set((pipeline || []).map((p) => p.id));
  if (ids.has('typography') || ids.has('details')) {
    return phaseId === 'typography' || phaseId === 'details';
  }
  return phaseId === 'layout' || phaseId === 'color';
}

const POSTER: DesignPhase[] = [
  {
    id: 'structure',
    label: '画板与构图',
    skills: ['poster', 'core'],
    focuses: ['layout', 'sizes'],
    brief:
      'Phase 结构：创建/选定画板，定八类构图之一与主视觉分区。只落框架色块与占位区，不要配色精修，不要装饰堆砌。lookup_design_skill("poster","layout").',
  },
  {
    id: 'layout',
    label: '排版与疏密',
    skills: ['poster', 'core'],
    focuses: ['layout', 'density', 'spacing'],
    brief:
      'Phase 排版：摆正文案块位置与疏密（紧/中/松），标题区与说明区组团。用 create_text 落标题/副标/正文占位文案。lookup density+spacing。不要上正式配色，可用中性灰/黑白。',
  },
  {
    id: 'typography',
    label: '字体与层级',
    skills: ['poster', 'core'],
    focuses: ['typography'],
    brief:
      'Phase 字体：统一层级 Title→Subtitle→Body→Caption；字号/字重；主标题若需展示字按 poster 规则。仍保持中性色，下一阶段再配色。',
  },
  {
    id: 'color',
    label: '配色',
    skills: ['poster', 'core'],
    focuses: ['color'],
    brief:
      'Phase 配色：lookup color。1主+1~2辅；给已有形状/文字上色。不要大改构图位置。',
  },
  {
    id: 'details',
    label: '装饰与插画',
    skills: ['poster', 'core'],
    focuses: ['decoration', 'techniques', 'illustration'],
    brief:
      'Phase 细节：少量装饰/基础手法；简单矢量插画可画，复杂插画用占位。禁止整图铺满酷炫手法。',
  },
  {
    id: 'polish',
    label: '收尾',
    skills: ['poster', 'core'],
    focuses: ['all'],
    brief:
      'Phase 收尾：检查裁切边、对比度、文案可读、疏密。仅小幅 update_node，不要推翻重做。',
  },
];

const UI: DesignPhase[] = [
  {
    id: 'structure',
    label: '整体原型',
    skills: ['ui', 'core'],
    focuses: ['layout', 'components'],
    brief:
      'Phase 原型：先搭整体线框——顶栏/内容/底栏或侧栏分区，卡片网格占位。中性灰白，无精致配色。lookup ui layout。',
  },
  {
    id: 'layout',
    label: '栅格与边距',
    skills: ['ui', 'core'],
    focuses: ['spacing', 'density'],
    brief:
      'Phase 栅格：严格 8px/偶数边距与疏密；对齐模块。仍用中性色。',
  },
  {
    id: 'typography',
    label: '文字与组件',
    skills: ['ui', 'core'],
    focuses: ['typography', 'components'],
    brief:
      'Phase 组件文案：全部 create_text；按钮/列表/表单文案与层级。禁止艺术字。',
  },
  {
    id: 'color',
    label: '配色',
    skills: ['ui', 'core'],
    focuses: ['color'],
    brief:
      'Phase 配色：主色/辅色/状态色上色；高饱和仅小面积。不改动大布局。',
  },
  {
    id: 'details',
    label: '图标与槽位',
    skills: ['ui', 'icon', 'banner'],
    focuses: ['icons', 'illustration', 'sizes'],
    brief:
      'Phase 细节：金刚区/导航查 icon；轮播/活动位查 banner，简单矢量或 create_image 占位（禁止生图）。',
  },
  {
    id: 'polish',
    label: '收尾',
    skills: ['ui', 'core'],
    focuses: ['all'],
    brief: 'Phase 收尾：检查栅格、对齐、对比；小幅修正。',
  },
];

const BANNER: DesignPhase[] = [
  {
    id: 'structure',
    label: '尺寸与构图',
    skills: ['banner', 'core'],
    focuses: ['sizes', 'layout'],
    brief: 'Phase 尺寸：选标准 Banner 尺寸建画板，定构图与安全区(PC≤1200)。',
  },
  {
    id: 'layout',
    label: '排版与疏密',
    skills: ['banner', 'core'],
    focuses: ['layout', 'density', 'spacing'],
    brief: 'Phase 排版：主文案+CTA 位置与疏密；中性色。',
  },
  {
    id: 'typography',
    label: '字体',
    skills: ['banner', 'core'],
    focuses: ['typography'],
    brief: 'Phase 字体：主标题可展示字，说明标准字；≤2 字体。',
  },
  {
    id: 'color',
    label: '配色',
    skills: ['banner', 'core'],
    focuses: ['color'],
    brief: 'Phase 配色：按 banner 商业/潮流规则上色。',
  },
  {
    id: 'details',
    label: '装饰',
    skills: ['banner', 'core'],
    focuses: ['decoration', 'techniques', 'illustration'],
    brief: 'Phase 装饰：轻量几何/光斑；故障风仅局部。',
  },
  {
    id: 'polish',
    label: '收尾',
    skills: ['banner', 'core'],
    focuses: ['all'],
    brief: 'Phase 收尾：裁切安全与 CTA 可点区域自检。',
  },
];

const ECOM: DesignPhase[] = [
  {
    id: 'structure',
    label: '模块结构',
    skills: ['ecommerce', 'core'],
    focuses: ['layout'],
    brief: 'Phase 结构：主图居中或详情模块骨架；一模块一卖点。',
  },
  {
    id: 'layout',
    label: '排版',
    skills: ['ecommerce', 'core'],
    focuses: ['layout', 'density', 'spacing'],
    brief: 'Phase 排版：价格/卖点放大；中性色。',
  },
  {
    id: 'typography',
    label: '文字',
    skills: ['ecommerce', 'core'],
    focuses: ['typography'],
    brief: 'Phase 文字：促销信息原生 text 层级。',
  },
  {
    id: 'color',
    label: '配色',
    skills: ['ecommerce', 'core'],
    focuses: ['color'],
    brief: 'Phase 配色：店色贯穿，活动辅色点缀。',
  },
  {
    id: 'details',
    label: '细节',
    skills: ['ecommerce', 'core'],
    focuses: ['decoration', 'illustration'],
    brief: 'Phase 细节：商品图位占位或附图；轻装饰。',
  },
  {
    id: 'polish',
    label: '收尾',
    skills: ['ecommerce', 'core'],
    focuses: ['all'],
    brief: 'Phase 收尾：促销可读性检查。',
  },
];

const PACK: DesignPhase[] = [
  {
    id: 'structure',
    label: '结构与出血',
    skills: ['packaging', 'core'],
    focuses: ['layout'],
    brief: 'Phase 结构：盒面/瓶贴分区，远离裁切线。',
  },
  {
    id: 'layout',
    label: '排版',
    skills: ['packaging', 'core'],
    focuses: ['layout', 'spacing'],
    brief: 'Phase 排版：居中/对称等允许构图；偶数边距。',
  },
  {
    id: 'typography',
    label: '文字',
    skills: ['packaging', 'core'],
    focuses: ['typography'],
    brief: 'Phase 文字：标语可展示字；说明标准字。',
  },
  {
    id: 'color',
    label: '配色',
    skills: ['packaging', 'core'],
    focuses: ['color'],
    brief: 'Phase 配色：大面积低饱和；强调色小面积。',
  },
  {
    id: 'details',
    label: '品牌纹样',
    skills: ['packaging', 'core'],
    focuses: ['decoration', 'techniques'],
    brief: 'Phase 细节：仅固定品牌纹样；禁用酷炫手法。',
  },
  {
    id: 'polish',
    label: '收尾',
    skills: ['packaging', 'core'],
    focuses: ['all'],
    brief: 'Phase 收尾：出血与合规信息检查。',
  },
];

const BRAND: DesignPhase[] = [
  {
    id: 'structure',
    label: '版式骨架',
    skills: ['brand', 'core'],
    focuses: ['layout'],
    brief: 'Phase 结构：对称/上下等允许构图的骨架。',
  },
  {
    id: 'layout',
    label: '排版',
    skills: ['brand', 'core'],
    focuses: ['layout', 'spacing'],
    brief: 'Phase 排版：留白均匀；偶数边距。',
  },
  {
    id: 'typography',
    label: '文字',
    skills: ['brand', 'core'],
    focuses: ['typography'],
    brief: 'Phase 文字：仅 LOGO 字可定制；其余基础字体。',
  },
  {
    id: 'color',
    label: '配色',
    skills: ['brand', 'core'],
    focuses: ['color'],
    brief: 'Phase 配色：系列固定主辅色，不新增色相。',
  },
  {
    id: 'details',
    label: '品牌图形',
    skills: ['brand', 'core'],
    focuses: ['decoration'],
    brief: 'Phase 细节：极简线条与固定品牌图形。',
  },
  {
    id: 'polish',
    label: '收尾',
    skills: ['brand', 'core'],
    focuses: ['all'],
    brief: 'Phase 收尾：系列一致性检查。',
  },
];

const ICON: DesignPhase[] = [
  {
    id: 'structure',
    label: '网格与隐喻',
    skills: ['icon', 'core'],
    focuses: ['layout', 'icons'],
    brief: 'Phase 结构：24 网格、安全边、一图标一隐喻。',
  },
  {
    id: 'layout',
    label: '造型',
    skills: ['icon', 'core'],
    focuses: ['icons', 'density'],
    brief: 'Phase 造型：闭合路径填充造型；中性色。',
  },
  {
    id: 'color',
    label: '配色',
    skills: ['icon', 'core'],
    focuses: ['color', 'icons'],
    brief: 'Phase 配色：跟随 UI；金刚区可低饱和底。',
  },
  {
    id: 'polish',
    label: '收尾',
    skills: ['icon', 'core'],
    focuses: ['all'],
    brief: 'Phase 收尾：同组粗细/圆角/大小统一。',
  },
];

const GENERAL: DesignPhase[] = [
  {
    id: 'structure',
    label: '结构',
    skills: ['core'],
    focuses: ['layout'],
    brief: 'Phase 结构：定画板与整体构图分区。',
  },
  {
    id: 'layout',
    label: '排版与疏密',
    skills: ['core'],
    focuses: ['layout', 'density', 'spacing'],
    brief: 'Phase 排版：文字块与疏密；中性色。',
  },
  {
    id: 'color',
    label: '配色',
    skills: ['core'],
    focuses: ['color'],
    brief: 'Phase 配色：1主+1~2辅上色。',
  },
  {
    id: 'details',
    label: '细节',
    skills: ['core'],
    focuses: ['decoration', 'illustration'],
    brief: 'Phase 细节：装饰/简单插画或占位。',
  },
  {
    id: 'polish',
    label: '收尾',
    skills: ['core'],
    focuses: ['all'],
    brief: 'Phase 收尾：可读性与对齐检查。',
  },
];

const PIPELINES: Record<DesignCategory, DesignPhase[]> = {
  poster: POSTER,
  ui: UI,
  banner: BANNER,
  ecommerce: ECOM,
  packaging: PACK,
  brand: BRAND,
  icon: ICON,
  general: GENERAL,
};

export function getPipeline(category: DesignCategory): DesignPhase[] {
  return PIPELINES[category] || GENERAL;
}

export function inferDesignCategory(message: string): DesignCategory {
  const s = String(message || '');
  if (/图标|金刚区|tab\s*bar|icon\s*set/i.test(s)) return 'icon';
  if (/banner|通栏|横幅|广告条|轮播画|活动位/i.test(s)) return 'banner';
  if (/海报|主视觉|\bkv\b|key\s*visual|poster/i.test(s)) return 'poster';
  if (/电商|详情页|主图|促销页|店铺/i.test(s)) return 'ecommerce';
  if (/包装|盒面|瓶贴|刀版|dieline/i.test(s)) return 'packaging';
  if (/画册|展板|\bvi\b|品牌手册|brochure/i.test(s)) return 'brand';
  if (/界面|ui\b|app\b|后台|dashboard|组件|落地页|官网|网页/i.test(s)) return 'ui';
  return 'general';
}

/** Full design jobs use the fixed pipeline; small tweaks skip it. */
export function shouldRunDesignPipeline(message: string): boolean {
  const s = String(message || '').trim();
  if (!s) return false;
  if (/^(继续|下一步|到此为止|停|不用了|取消)/.test(s)) return false;
  // Short incremental edits
  if (
    s.length < 100 &&
    /^(把|将|改|调|删|移|换成|改成|加大|缩小|改为|改下|修改)/.test(s) &&
    !/设计|做[一]?[张个套]|生成|海报|界面|包装/.test(s)
  ) {
    return false;
  }
  return /生成|绘制|设计|做[一]?[张个套]|海报|界面|ui|banner|通栏|包装|画册|展板|图标|金刚区|主视觉|详情页|主图|落地页|创建.*(海报|界面|banner)/i.test(
    s
  );
}

export function categoryLabel(category: DesignCategory): string {
  const map: Record<DesignCategory, string> = {
    poster: '海报',
    ui: 'UI',
    banner: 'Banner',
    ecommerce: '电商',
    packaging: '包装',
    brand: 'VI/画册',
    icon: '图标',
    general: '设计',
  };
  return map[category];
}

export function continueChoiceLabel(next: DesignPhase): string {
  return `继续：${next.label}`;
}

export function stopChoiceLabel(): string {
  return '到此为止';
}

export function parseContinueChoice(
  choice: string,
  pipeline: DesignPhase[]
): number | null {
  const s = String(choice || '').trim();
  if (s === stopChoiceLabel() || /到此为止|停|不用了/.test(s)) return -1;
  const m = s.match(/^继续[：:]\s*(.+)$/);
  if (!m) return null;
  const label = m[1].trim();
  const idx = pipeline.findIndex((p) => p.label === label);
  return idx >= 0 ? idx : null;
}

export type PipelineProgress = {
  category: DesignCategory;
  phaseIds: DesignPhaseId[];
  labels: string[];
  currentIndex: number;
  /** @deprecated prefer collabMode */
  stepConfirm: boolean;
  collabMode: AgentCollabMode;
};
