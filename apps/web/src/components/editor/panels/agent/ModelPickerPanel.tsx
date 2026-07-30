import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LlmModel } from '@/apis/chat';
import {
  modelIsImageGenerator,
  modelSupportsVisionInput,
} from '@/components/editor/panels/agent/llmModelMeta';
import { isCustomModelId } from '@/components/editor/panels/agent/customLlmProviders';
import { cn } from '@/utils/classnames';
import { FREE_IMAGE_MODEL_ID } from '@/utils/wallet';
import deepseek from '@/assets/model/deepseek.png';
import qwen from '@/assets/model/qwen.png';
import gemini from '@/assets/model/gemini.svg';
import claude from '@/assets/model/claude.svg';
import dreamina from '@/assets/model/dreamina.png';
import doubao from '@/assets/model/doubao.png';
import glm from '@/assets/model/glm.png';
import gptImage from '@/assets/model/openai.svg';
import kimi from '@/assets/model/kimi.png';
import flux from '@/assets/model/flux_kontext_pro.png';
import ideogram from '@/assets/model/ideogram.png';
import kling from '@/assets/model/kling.png';
import sora from '@/assets/model/sora.png';
import minimax from '@/assets/model/minimax_music.png';
import elevenlabs from '@/assets/model/elevenlabs_turbo.png';
import syncLipsync from '@/assets/model/sync_lipsync.png';

type ModelIconRef = {
  id?: string | null;
  provider?: string | null;
  kind?: string | null;
  label?: string | null;
  iconUrl?: string | null;
  icon_url?: string | null;
  iconKey?: string | null;
  icon_key?: string | null;
};

const MODEL_ICON_RULES: Array<{ test: (s: string) => boolean; src: string }> = [
  { test: (s) => s.includes('deepseek'), src: deepseek },
  { test: (s) => s.includes('seedream'), src: doubao },
  { test: (s) => s.includes('dreamina'), src: dreamina },
  { test: (s) => s.includes('glm') || s.includes('zhipu') || s.includes('智谱'), src: glm },
  { test: (s) => s.includes('doubao') || s.includes('豆包') || s.includes('seed-2'), src: doubao },
  { test: (s) => s.includes('qwen') || s.includes('dashscope'), src: qwen },
  { test: (s) => s.includes('banana') || s.includes('gemini') || s.includes('google'), src: gemini },
  { test: (s) => s.includes('claude') || s.includes('anthropic'), src: claude },
  { test: (s) => s.includes('gpt') || s.includes('openai'), src: gptImage },
  { test: (s) => s.includes('flux'), src: flux },
  { test: (s) => s.includes('ideogram'), src: ideogram },
  { test: (s) => s.includes('kling'), src: kling },
  { test: (s) => s.includes('sora'), src: sora },
  { test: (s) => s.includes('minimax'), src: minimax },
  { test: (s) => s.includes('eleven'), src: elevenlabs },
  { test: (s) => s.includes('lipsync') || s.includes('sync'), src: syncLipsync },
  { test: (s) => s.includes('moonshot') || s.includes('kimi'), src: kimi },
];

const MODEL_ICON_BY_PROVIDER: Record<string, string> = {
  deepseek,
  doubao,
  glm,
  zhipu: glm,
  qwen,
  dashscope: qwen,
  gemini,
  google: gemini,
  anthropic: claude,
  openai: gptImage,
  openrouter: gptImage,
  moonshot: kimi,
};

const MODEL_ICON_BY_KEY: Record<string, string> = {
  deepseek,
  doubao,
  glm,
  zhipu: glm,
  kimi,
  moonshot: kimi,
  seedream: doubao,
  dreamina,
  qwen,
  gemini,
  claude,
  openai: gptImage,
  gpt: gptImage,
  gpt_image: gptImage,
  flux,
  ideogram,
  kling,
  sora,
  minimax,
  elevenlabs,
  lipsync: syncLipsync,
};

/** Synthetic Auto row — same shape as API models. */
export const AUTO_MODEL: LlmModel = {
  id: 'auto',
  label: 'Auto',
  provider: 'system',
  kind: 'text',
};

function resolveModelIconSrc(model?: ModelIconRef | null): string | null {
  const remote = String(model?.iconUrl || model?.icon_url || '').trim();
  if (remote) return remote;
  const key = String(model?.iconKey || model?.icon_key || '').toLowerCase().trim();
  if (key && MODEL_ICON_BY_KEY[key]) return MODEL_ICON_BY_KEY[key];
  const id = String(model?.id || '').toLowerCase();
  const provider = String(model?.provider || '').toLowerCase();
  const label = String(model?.label || '').toLowerCase();
  if (id === 'auto' || provider === 'system' || label === 'auto') return null;
  const blob = `${id} ${provider} ${label}`;
  for (const rule of MODEL_ICON_RULES) {
    if (rule.test(blob)) return rule.src;
  }
  if (provider && MODEL_ICON_BY_PROVIDER[provider]) return MODEL_ICON_BY_PROVIDER[provider];
  if (model?.kind === 'image') return doubao;
  return deepseek;
}

export function ModelBrandIcon({
  model,
  className,
  size = 16,
}: {
  model?: ModelIconRef | null;
  className?: string;
  size?: number;
}) {
  const src = resolveModelIconSrc(model);
  if (!src) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        className={cn('shrink-0 text-[var(--ink)]', className)}
        aria-hidden
      >
        <path
          d="M8 1.5l1.2 3.6L13 6.3l-3.8 1.2L8 11.1 6.8 7.5 3 6.3l3.8-1.2L8 1.5z"
          fill="currentColor"
          opacity="0.9"
        />
        <circle cx="12.5" cy="3" r="1.1" fill="currentColor" opacity="0.55" />
        <circle cx="3.5" cy="11.5" r="1" fill="currentColor" opacity="0.45" />
      </svg>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

export type ModelPickerTab = 'design' | 'image' | 'video';

/** Shared chrome for model / size popovers (editor + home). */
export const AGENT_POPOVER_PANEL =
  'w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]';

/** Route-prefs primary panel — fixed 250px (opened via Dropdown). */
export const AGENT_ROUTE_POPOVER_PANEL =
  'w-[250px] max-w-[calc(100vw-24px)] max-h-[min(480px,calc(100vh-24px))] overflow-x-hidden overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]';

/** Secondary model/preset menu — opened via Popover beside the trigger row. */
export const AGENT_ROUTE_SUBMENU_PANEL =
  'w-[300px] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100vh-24px))] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]';

/** Preference tier cards (Standard / Pro / Max style). */
export const AGENT_ROUTE_PRESET_PANEL =
  'w-[300px] max-w-[calc(100vw-24px)] max-h-[min(520px,calc(100vh-24px))] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]';

/** 1 = 便宜 · 2 = 适中 · 3 = 较贵 (matches catalog price bands). */
export type ModelPriceLevel = 1 | 2 | 3;

export function parseModelPriceAmount(raw?: string | null): number | null {
  if (raw == null) return null;
  const n = Number.parseFloat(String(raw).trim().split(/\s+/)[0] || '');
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Map catalog `price` → relative cost level for the orange dots. */
export function modelPriceLevel(
  m: Pick<LlmModel, 'id' | 'kind' | 'price' | 'provider'> | null | undefined
): ModelPriceLevel | null {
  if (!m || m.id === 'auto' || m.provider === 'system' || isCustomModelId(m.id)) return null;
  const n = parseModelPriceAmount(m.price);
  if (n == null) return null;
  if (isImageKind(m)) {
    if (n <= 0.25) return 1;
    if (n <= 0.4) return 2;
    return 3;
  }
  // Text: display 元/百万 tokens
  if (n < 1) return 1;
  if (n < 8) return 2;
  return 3;
}

/** Orange-dot cost tag (title row, top-right) — same pattern as video model picker. */
export function ModelPriceTag({
  level,
  label,
}: {
  level: ModelPriceLevel;
  label: string;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={label}>
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-[5px] w-[5px] rounded-full',
              i <= level ? 'bg-[#f07818]' : 'bg-[#f07818]/30'
            )}
          />
        ))}
      </span>
      <span className="text-[11px] leading-none text-[var(--muted)]">{label}</span>
    </span>
  );
}

/** Soft pill for meta labels (自定义 / 多模态) — matches saved-provider kind tags. */
export function ModelMetaBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-lg bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--muted)]">
      {label}
    </span>
  );
}

export function isUserCustomModel(
  m: Pick<LlmModel, 'id' | 'provider'> | null | undefined
): boolean {
  if (!m) return false;
  return isCustomModelId(m.id) || m.provider === 'custom';
}

/** Dots + relative cost label (便宜 / 适中 / 较贵) — no raw ¥ amounts. */
export function modelPriceTagInfo(
  m: Pick<LlmModel, 'id' | 'kind' | 'price' | 'provider'> | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string
): { level: ModelPriceLevel; label: string } | null {
  const level = modelPriceLevel(m);
  if (!level) return null;
  if (level === 1) return { level, label: t('agent.priceCheap') };
  if (level === 2) return { level, label: t('agent.priceFair') };
  return { level, label: t('agent.priceCostly') };
}

export function isImageKind(m: Pick<LlmModel, 'kind' | 'id'> | null | undefined): boolean {
  if (!m) return false;
  if (m.kind === 'image') return true;
  return Boolean(m.id && /seedream|image|i2i|t2i/i.test(m.id));
}

export function isVideoKind(m: Pick<LlmModel, 'kind' | 'id'> | null | undefined): boolean {
  if (!m) return false;
  if (m.kind === 'video') return true;
  return Boolean(m.id && /seedance|kling|runway|luma|minimax.*video|sora/i.test(m.id));
}

export function modelTabOf(m: Pick<LlmModel, 'kind' | 'id'> | null | undefined): ModelPickerTab {
  if (isVideoKind(m)) return 'video';
  return isImageKind(m) ? 'image' : 'design';
}

export function modelDescription(
  m: LlmModel,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (m.id === 'auto') return t('agent.modelDescAuto');
  if (isUserCustomModel(m)) return t('agent.modelDescCustom');
  // Prefer per-model catalog copy from the API (admin / seed), not a kind-wide fallback.
  const fromCatalog = String(m.description || '').trim();
  if (fromCatalog) return fromCatalog;
  if (modelIsImageGenerator(m) || m.kind === 'image') return t('agent.modelDescImage');
  if (m.thinking || m.id.includes('reasoner')) return t('agent.modelDescReasonerDesign');
  const vision = modelSupportsVisionInput(m);
  if (m.id.includes('deepseek')) {
    return vision ? t('agent.modelDescDeepseekVision') : t('agent.modelDescDeepseekDesign');
  }
  return vision ? t('agent.modelDescChatVision') : t('agent.modelDescChatDesign');
}

type Props = {
  /** Filters the list: design (=agent/ask) vs image models. */
  tab: ModelPickerTab;
  /** Optional — kept for callers; mode switch lives in the composer toolbar. */
  onTabChange?: (tab: ModelPickerTab) => void;
  models: LlmModel[];
  selectedId: string;
  onPick: (id: string) => void;
  /** idle | loading | ready | error — drives empty / loading / error copy. */
  status?: 'idle' | 'loading' | 'ready' | 'error';
  /** Free plan: show all models; only Auto + fixed free image model are selectable. */
  autoOnly?: boolean;
  className?: string;
};

/**
 * Shared model picker — model list only (Agent / Ask / Image live in the composer mode menu).
 * Used by AgentDock and HomeAgentComposer.
 */
export default function ModelPickerPanel({
  tab,
  models,
  selectedId,
  onPick,
  status = 'ready',
  autoOnly = false,
  className,
}: Props): ReactNode {
  const { t } = useTranslation();

  const pool =
    !models.length && status === 'loading'
      ? [
          {
            id: '_loading',
            label: 'Loading...',
            provider: '',
            kind: (tab === 'image'
              ? 'image'
              : tab === 'video'
                ? 'video'
                : 'text') as LlmModel['kind'],
          } satisfies LlmModel,
        ]
      : models;

  const filtered = (() => {
    const raw =
      tab === 'image'
        ? pool.filter((m) => isImageKind(m) || m.id === '_loading')
        : tab === 'video'
          ? pool.filter((m) => isVideoKind(m) || m.id === '_loading')
          : (() => {
              const design = pool.filter(
                (m) =>
                  (!isImageKind(m) && !isVideoKind(m) && m.id !== 'auto') ||
                  m.id === '_loading'
              );
              if (design.some((m) => m.id === '_loading')) return design;
              const autoRow = pool.find((m) => m.id === 'auto') || {
                ...AUTO_MODEL,
                label: t('agent.autoToggle'),
              };
              return [autoRow, ...design];
            })();
    const seen = new Set<string>();
    return raw.filter((m) => {
      if (!m?.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  })();

  return (
    <div className={cn(AGENT_POPOVER_PANEL, 'flex flex-col', className)}>
      <div className="max-h-[min(360px,calc(100vh-160px))] min-w-0 overflow-y-auto px-1.5 pb-1.5 pt-1.5">
          {status === 'error' && models.length === 0 ? (
            <div className="px-2 py-4 text-center text-[12px] text-[var(--muted)]">
              <p>{t('agent.apiDown')}</p>
              <p className="mt-1">{t('agent.apiDownHint')}</p>
            </div>
          ) : null}

          {!filtered.length && status !== 'loading' ? (
            <div className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">
              {models.length === 0 && status === 'idle'
                ? t('home.composerModelsLoading')
                : t('agent.emptyModels')}
            </div>
          ) : (
            filtered.map((m) => {
              const selected = m.id === selectedId;
              const loading = m.id === '_loading';
              const freePick =
                m.id === 'auto' || m.id === FREE_IMAGE_MODEL_ID;
              const locked = autoOnly && !freePick && !loading;
              const desc = loading ? '...' : modelDescription(m, t);
              const descLine =
                autoOnly && freePick && !loading
                  ? `${desc} · ${t('agent.freeModelItemHint')}`
                  : desc;
              const custom = !loading && isUserCustomModel(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={loading || locked}
                  title={locked ? t('agent.freeModelLocked') : undefined}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                    selected && !locked ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]',
                    (loading || locked) && 'cursor-not-allowed',
                    locked && 'opacity-45 hover:bg-transparent'
                  )}
                  onClick={() => {
                    if (loading || locked) return;
                    onPick(m.id);
                  }}
                >
                  <ModelBrandIcon model={m} size={20} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5 text-[var(--ink)]">
                        {m.label || m.id}
                      </span>
                      {custom ? (
                        <ModelMetaBadge label={t('agent.modelBadgeCustom')} />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate whitespace-nowrap text-[11px] leading-[1.35] text-[var(--muted)]">
                      {descLine}
                    </span>
                  </span>
                </button>
              );
            })
          )}
      </div>
    </div>
  );
}
