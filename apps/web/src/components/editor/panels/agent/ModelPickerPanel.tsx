import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LlmModel } from '@/apis/chat';
import { modelIsImageGenerator, modelSupportsVisionInput } from '@/apis/chat';
import { isCustomModelId } from '@/components/editor/panels/agent/customLlmProviders';
import { cn } from '@/utils/classnames';
import deepseek from '@/assets/model/deepseek.png';
import qwen from '@/assets/model/qwen.png';
import gemini from '@/assets/model/gemini.png';
import claude from '@/assets/model/claude.png';
import dreamina from '@/assets/model/dreamina.png';
import doubao from '@/assets/model/doubao.png';
import glm from '@/assets/model/glm.png';
import gptImage from '@/assets/model/gpt_image.png';
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
  { test: (s) => s.includes('gemini') || s.includes('google'), src: gemini },
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

function ModelBrandIcon({
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

function VisionModelBadge({ label }: { label: string }): ReactNode {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#EAF1FF] px-1.5 py-0.5 text-[10px] font-medium leading-4 text-[#3B6FE8]">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0">
        <circle cx="6" cy="2.6" r="1.35" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="2.9" cy="9" r="1.35" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="9.1" cy="9" r="1.35" stroke="currentColor" strokeWidth="1.1" />
        <path
          d="M5.15 3.55L3.55 7.75M6.85 3.55L8.45 7.75M4.25 9H7.75"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </span>
  );
}

export type ModelPickerTab = 'design' | 'image';

/** Shared chrome for model / size popovers (editor + home). */
export const AGENT_POPOVER_PANEL =
  'w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]';

export function isImageKind(m: Pick<LlmModel, 'kind' | 'id'> | null | undefined): boolean {
  if (!m) return false;
  if (m.kind === 'image') return true;
  return Boolean(m.id && /seedream|image|i2i|t2i/i.test(m.id));
}

export function modelTabOf(m: Pick<LlmModel, 'kind' | 'id'> | null | undefined): ModelPickerTab {
  return isImageKind(m) ? 'image' : 'design';
}

export function modelDescription(
  m: LlmModel,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (m.id === 'auto') return t('agent.modelDescAuto');
  if (isCustomModelId(m.id) || m.provider === 'custom') return t('agent.modelDescCustom');
  if (modelIsImageGenerator(m) || m.kind === 'image') return t('agent.modelDescImage');
  if (m.thinking || m.id.includes('reasoner')) return t('agent.modelDescReasonerDesign');
  const vision = modelSupportsVisionInput(m);
  if (m.id.includes('deepseek')) {
    return vision ? t('agent.modelDescDeepseekVision') : t('agent.modelDescDeepseekDesign');
  }
  return vision ? t('agent.modelDescChatVision') : t('agent.modelDescChatDesign');
}

type Props = {
  tab: ModelPickerTab;
  onTabChange: (tab: ModelPickerTab) => void;
  models: LlmModel[];
  selectedId: string;
  onPick: (id: string) => void;
  /** idle | loading | ready | error — drives empty / loading / error copy. */
  status?: 'idle' | 'loading' | 'ready' | 'error';
  className?: string;
};

/**
 * Shared model picker — left Agent/Image tabs + right list (Auto is first agent row).
 * Used by AgentDock and HomeAgentComposer.
 */
export default function ModelPickerPanel({
  tab,
  onTabChange,
  models,
  selectedId,
  onPick,
  status = 'ready',
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
            kind: (tab === 'image' ? 'image' : 'text') as LlmModel['kind'],
          } satisfies LlmModel,
        ]
      : models;

  const filtered =
    tab === 'image'
      ? pool.filter((m) => isImageKind(m) || m.id === '_loading')
      : (() => {
          const design = pool.filter(
            (m) => (!isImageKind(m) && m.id !== 'auto') || m.id === '_loading'
          );
          if (design.some((m) => m.id === '_loading')) return design;
          const autoRow = pool.find((m) => m.id === 'auto') || {
            ...AUTO_MODEL,
            label: t('agent.autoToggle'),
          };
          return [autoRow, ...design];
        })();

  return (
    <div className={cn(AGENT_POPOVER_PANEL, 'flex items-stretch', className)}>
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('agent.modelCategory')}
        className="flex w-[6.5rem] shrink-0 flex-col border-r border-[var(--line)]"
      >
        <div className="flex flex-col gap-0.5 p-1.5">
          {(
            [
              { id: 'design' as const, label: t('agent.modeDesign') },
              { id: 'image' as const, label: t('agent.modeImage') },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn(
                  'rounded-lg px-2 py-2 text-left text-[12px] font-medium transition-colors',
                  active
                    ? 'bg-[var(--canvas)] text-[var(--ink)]'
                    : 'text-[var(--muted)] hover:bg-[var(--canvas)]/70 hover:text-[var(--ink)]'
                )}
                onClick={() => onTabChange(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="max-h-[min(360px,calc(100vh-160px))] min-w-0 flex-1 overflow-y-auto px-1.5 pb-1.5 pt-1.5">
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
              const vision = !loading && modelSupportsVisionInput(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={loading}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors',
                    selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]',
                    loading && 'cursor-default'
                  )}
                  onClick={() => {
                    if (!loading) onPick(m.id);
                  }}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--canvas)] text-[var(--ink)] ring-1 ring-[var(--line)]">
                    <ModelBrandIcon model={m} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--ink)]">
                        {m.label || m.id}
                      </span>
                      {vision ? <VisionModelBadge label={t('agent.modelBadgeVision')} /> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                      {loading ? '...' : modelDescription(m, t)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
