/**
 * Account Agent tab: Auto routing prefs + custom OpenAI-compatible providers (Pro).
 */

import { useEffect, useRef, useState, type ReactNode, memo } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiChevronLeft, HiChevronRight, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';
import {
  invalidateChatModelsCache,
  listModels,
  type LlmModel,
  type ByokPlatform,
} from '@/apis/chat';
import { modelAllowsRouteSlot, modelIsImageGenerator } from '@/components/editor/panels/agent/llmModelMeta';
import { fetchDesignCatalog } from '@/apis/design';
import { Dropdown, SegmentedControl, Select, Tooltip } from '@/components/base';
import AccountSettingsDialog from '@/components/layout/AccountSettingsDialog';
import { cn } from '@/utils/classnames';
import { isDesktopLocal } from '@/utils/apiBase';
import { readFileAsDataUrl } from '@/utils/uploadImage';
import { planAllowsCustomModels, type PlanId } from '@/utils/wallet';
import {
  createCustomLlmProviderId,
  createPlatformModelId,
  customProvidersAsModels,
  hydrateCustomLlmProviders,
  isCustomModelId,
  isPlatformByokId,
  isPlatformModelId,
  persistCustomLlmProvider,
  platformProviderFromModelId,
  removeCustomLlmProvider,
  type CustomLlmProvider,
  type CustomModelKind,
} from './customLlmProviders';
import ModelPickerPanel, {
  AGENT_ROUTE_POPOVER_PANEL,
  AGENT_ROUTE_SUBMENU_PANEL,
  CUSTOM_MODEL_ICON_OPTIONS,
  ModelBrandIcon,
  ModelMetaBadge,
  ModelPriceTag,
  isUserCustomModel,
  modelDescription,
  modelPriceTagInfo,
} from './ModelPickerPanel';

const NARROW_MQ = '(max-width: 767px)';

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_MQ).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return narrow;
}

/** Nested route flyouts — same dismiss guard as AgentComposerShell model Dropdown. */
const ROUTE_SUBMENU_DISMISS_GUARD =
  '[data-agent-route-submenu], .rcb-agent-route-submenu-popup';

type Props = {
  onProvidersChange?: () => void;
  /** When set (e.g. inside settings modal), open plans tab instead of nested dialog. */
  onRequestUpgrade?: () => void;
};

export type AgentRoutePreset = 'platform' | 'economy' | 'balanced' | 'quality' | 'custom';

export type AgentRoutePrefs = {
  preset: AgentRoutePreset;
  fast?: string;
  standard?: string;
  reasoning?: string;
  vision?: string;
  image?: string;
};

const ROUTE_PREFS_KEY = 'resume.agentRoutePrefs.v2';
const ROUTE_PREFS_KEY_LEGACY = 'resume.agentRoutePrefs.v1';

/** Code fallback if Admin has not seeded precheck.user_preset.* yet. */
const ROUTE_PRESETS_FALLBACK: Record<
  Exclude<AgentRoutePreset, 'platform' | 'custom'>,
  AgentRoutePrefs
> = {
  /** Legacy key — same domestic ladder as 标准版 platform defaults. */
  economy: {
    preset: 'economy',
    fast: 'doubao-seed-2-1-turbo',
    standard: 'deepseek-v4-flash',
    reasoning: 'deepseek-v4-pro',
    vision: 'doubao-seed-2-1-turbo',
    image: 'doubao-seedream-5-0-lite',
  },
  balanced: {
    preset: 'balanced',
    fast: 'doubao-seed-2-1-turbo',
    standard: 'or-gpt-5-6-luna',
    reasoning: 'or-gemini-3-flash-preview',
    vision: 'or-gemini-3-flash-preview',
    image: 'or-gpt-image-2',
  },
  quality: {
    preset: 'quality',
    fast: 'or-gemini-3-flash-preview',
    standard: 'or-gemini-3-5-flash',
    reasoning: 'or-gpt-5-6-sol',
    vision: 'or-gemini-3-5-flash',
    image: 'or-gpt-image-2',
  },
};

let cachedPresetRules: Record<string, string> | null = null;
/** From GET /chat/models — null until first fetch. */
let cachedOpenrouterAvailable: boolean | null = null;

function isOpenRouterModelId(id: string | undefined): boolean {
  const s = String(id || '').trim().toLowerCase();
  return s.startsWith('or-') || s.startsWith('openrouter/');
}

function remapPrefsWithoutOpenRouter(prefs: AgentRoutePrefs): AgentRoutePrefs {
  const domestic = resolveNamedPreset('economy');
  const out: AgentRoutePrefs = { ...prefs };
  for (const key of ['fast', 'standard', 'reasoning', 'vision', 'image'] as const) {
    if (isOpenRouterModelId(out[key])) {
      out[key] = domestic[key];
    }
  }
  return out;
}

function resolvePresetForRegion(
  name: Exclude<AgentRoutePreset, 'platform' | 'custom'>,
  rules?: Record<string, string> | null
): AgentRoutePrefs {
  const base = resolveNamedPreset(name, rules);
  if (cachedOpenrouterAvailable === false) {
    return { ...remapPrefsWithoutOpenRouter(base), preset: name };
  }
  return base;
}

function migrateLegacyRouteKeys(
  raw: Record<string, unknown>
): Partial<AgentRoutePrefs> {
  const out: Partial<AgentRoutePrefs> = {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = String(raw[k] || '').trim();
      if (v) return v;
    }
    return undefined;
  };
  out.fast = pick('fast', 'simple');
  out.standard = pick('standard', 'medium');
  out.reasoning = pick('reasoning', 'complex');
  out.vision = pick('vision');
  out.image = pick('image');
  return out;
}

function parseUserPresetRoutes(raw: string): Partial<AgentRoutePrefs> {
  const bag: Record<string, unknown> = {};
  for (const part of String(raw || '').split(';')) {
    const p = part.trim();
    if (!p.includes('->')) continue;
    const [left, right] = p.split('->', 2).map((s) => s.trim());
    const key = left.toLowerCase();
    const val = (right || '').trim();
    if (!val) continue;
    if (
      key === 'fast' ||
      key === 'standard' ||
      key === 'reasoning' ||
      key === 'simple' ||
      key === 'medium' ||
      key === 'complex' ||
      key === 'vision' ||
      key === 'image'
    ) {
      bag[key] = val;
    }
  }
  return migrateLegacyRouteKeys(bag);
}

function resolveNamedPreset(
  name: Exclude<AgentRoutePreset, 'platform' | 'custom'>,
  rules?: Record<string, string> | null
): AgentRoutePrefs {
  const fallback = ROUTE_PRESETS_FALLBACK[name];
  const source = rules ?? cachedPresetRules;
  const raw = source?.[`precheck.user_preset.${name}`] || '';
  const parsed = parseUserPresetRoutes(raw);
  return {
    preset: name,
    fast: parsed.fast || fallback.fast,
    standard: parsed.standard || fallback.standard,
    reasoning: parsed.reasoning || fallback.reasoning,
    vision: parsed.vision || fallback.vision,
    image: parsed.image || fallback.image,
  };
}

function emptyCustomRoutePrefs(): AgentRoutePrefs {
  return {
    preset: 'custom',
    fast: '',
    standard: '',
    reasoning: '',
    vision: '',
    image: '',
  };
}

/** Seed values when switching into the custom lane from another preset. */
function seedCustomLaneFromPrefs(prefs: AgentRoutePrefs): AgentRoutePrefs {
  if (prefs.preset === 'balanced' || prefs.preset === 'quality') {
    return resolveNamedPreset(prefs.preset);
  }
  if (prefs.preset === 'custom') return prefs;
  return resolveNamedPreset('balanced');
}

export function loadAgentRoutePrefs(
  rules?: Record<string, string> | null
): AgentRoutePrefs {
  // Local desktop: no platform catalog — only custom/BYOK lane picks.
  if (isDesktopLocal()) {
    try {
      const raw =
        localStorage.getItem(ROUTE_PREFS_KEY) ||
        localStorage.getItem(ROUTE_PREFS_KEY_LEGACY);
      if (!raw) return emptyCustomRoutePrefs();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return emptyCustomRoutePrefs();
      const migrated = migrateLegacyRouteKeys(parsed);
      const keep = (id: string | undefined) =>
        isCustomModelId(String(id || '').trim()) ? String(id).trim() : '';
      return {
        preset: 'custom',
        fast: keep(migrated.fast),
        standard: keep(migrated.standard),
        reasoning: keep(migrated.reasoning),
        vision: keep(migrated.vision),
        image: keep(migrated.image),
      };
    } catch {
      return emptyCustomRoutePrefs();
    }
  }
  try {
    const raw =
      localStorage.getItem(ROUTE_PREFS_KEY) ||
      localStorage.getItem(ROUTE_PREFS_KEY_LEGACY);
    if (!raw) return { preset: 'platform' };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return { preset: 'platform' };
    let preset = (String(parsed.preset || 'platform') || 'platform') as AgentRoutePreset;
    if (preset === 'economy') {
      preset = 'platform';
      try {
        localStorage.setItem(ROUTE_PREFS_KEY, JSON.stringify({ preset: 'platform' }));
      } catch {
        /* ignore */
      }
    }
    if (preset === 'platform') return { preset: 'platform' };
    if (preset === 'balanced' || preset === 'quality') {
      return resolvePresetForRegion(preset, rules);
    }
    if (preset === 'custom') {
      const migrated = migrateLegacyRouteKeys(parsed);
      return {
        preset: 'custom',
        fast: migrated.fast,
        standard: migrated.standard,
        reasoning: migrated.reasoning,
        vision: migrated.vision,
        image: migrated.image,
      };
    }
    return { preset: 'platform' };
  } catch {
    return { preset: 'platform' };
  }
}

export function saveAgentRoutePrefs(prefs: AgentRoutePrefs) {
  try {
    localStorage.setItem(ROUTE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Payload for /design/run when chat model is Auto. null = follow platform. */
export function routeOverridesForApi(
  prefs: AgentRoutePrefs = loadAgentRoutePrefs()
): Record<string, string> | null {
  if (!prefs || prefs.preset === 'platform') return null;
  let base: AgentRoutePrefs =
    prefs.preset === 'economy' ||
    prefs.preset === 'balanced' ||
    prefs.preset === 'quality'
      ? resolvePresetForRegion(prefs.preset)
      : { ...prefs };
  if (cachedOpenrouterAvailable === false) {
    base = remapPrefsWithoutOpenRouter(base);
  }
  // When every lane fell back to domestic Standard, omit overrides (same as platform).
  if (prefs.preset === 'balanced' || prefs.preset === 'quality') {
    const platformish = resolveNamedPreset('economy');
    const sameAsDomestic = (
      ['fast', 'standard', 'reasoning', 'vision', 'image'] as const
    ).every((k) => String(base[k] || '') === String(platformish[k] || ''));
    if (sameAsDomestic) return null;
  }
  const out: Record<string, string> = {};
  for (const key of ['fast', 'standard', 'reasoning', 'vision', 'image'] as const) {
    const v = String(base[key] || '').trim();
    if (v) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Cache OpenRouter availability from GET /chat/models (region gate). */
export function warmOpenrouterAvailability(available: boolean | null | undefined) {
  if (available == null) return;
  cachedOpenrouterAvailable = Boolean(available);
}

/** Warm Admin preset cache (call before send if panel not opened). */
export async function warmAgentRoutePresetRules(
  rules?: Record<string, string> | null,
): Promise<void> {
  if (rules && typeof rules === 'object') {
    cachedPresetRules = rules;
  } else {
    try {
      const cat = await fetchDesignCatalog();
      cachedPresetRules = cat.global_rules || {};
    } catch {
      /* keep fallback */
    }
  }
  if (cachedOpenrouterAvailable == null) {
    try {
      const res = await listModels();
      warmOpenrouterAvailability(res?.openrouterAvailable);
    } catch {
      /* keep null */
    }
  }
}

const fieldClass =
  'mt-1.5 w-full rounded-lg border-0 bg-[var(--account-main)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none ring-1 ring-[var(--line)] transition placeholder:text-[var(--muted)] focus:ring-[var(--ink)]/25';

const selectFieldClass =
  'mt-1.5 w-full !h-10 rounded-lg border-0 bg-[var(--account-main)] px-3 pr-8 text-[14px] text-[var(--ink)] ring-1 ring-[var(--line)]';

function parseCustomModelKind(value: string): CustomModelKind {
  if (value === 'vision') return 'vision';
  if (value === 'image') return 'image';
  if (value === 'video') return 'video';
  return 'text';
}

function splitByokRouteModels(byok: LlmModel[]): { text: LlmModel[]; image: LlmModel[] } {
  return {
    text: byok.filter((m) => m.kind !== 'image' && m.kind !== 'video'),
    image: byok.filter((m) => m.kind === 'image' || modelIsImageGenerator(m)),
  };
}

/** Local desktop → BYOK lanes only; otherwise platform catalog. */
function routeCatalogFromListModels(res?: {
  models?: LlmModel[] | null;
  imageModels?: LlmModel[] | null;
} | null): { text: LlmModel[]; image: LlmModel[] } {
  if (isDesktopLocal()) return splitByokRouteModels(customProvidersAsModels());
  return {
    text: res?.models || [],
    image: res?.imageModels || [],
  };
}

/** Sentinel provider option: fall back to the free-text form. */
const MANUAL_PROVIDER_ID = '__manual__';

function platformModelKindOptions(t: (key: string) => string) {
  return [
    { value: 'text', label: t('agent.providerModelKindText') },
    { value: 'image', label: t('agent.providerModelKindImage') },
    { value: 'video', label: t('agent.providerModelKindVideo') },
    { value: 'vision', label: t('agent.providerModelKindVision') },
  ];
}

function AddPlatformModelFields(props: {
  fieldClass: string;
  selectFieldClass: string;
  apiId: string;
  name: string;
  kind: CustomModelKind;
  iconKey: string;
  iconUrl: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onApiId: (v: string) => void;
  onName: (v: string) => void;
  onKind: (v: CustomModelKind) => void;
  onIconKey: (v: string) => void;
  onIconUrl: (v: string) => void;
}): ReactNode {
  const {
    fieldClass,
    selectFieldClass,
    apiId,
    name,
    kind,
    iconKey,
    iconUrl,
    t,
    onApiId,
    onName,
    onKind,
    onIconKey,
    onIconUrl,
  } = props;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickPreset = (key: string) => {
    if (iconKey === key && !iconUrl) onIconKey('');
    else {
      onIconUrl('');
      onIconKey(key);
    }
  };

  const onUploadIcon = (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    void (async () => {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        onIconKey('');
        onIconUrl(dataUrl);
      } catch {
        /* ignore read errors */
      }
    })();
  };

  return (
    <>
      <label className="mb-4 block">
        <span className="text-[13px] font-medium text-[var(--ink)]">
          {t('agent.providerApiModel')}
          <span className="text-red-500"> *</span>
        </span>
        <input
          className={fieldClass}
          value={apiId}
          onChange={(e) => onApiId(e.target.value)}
          placeholder={t('agent.providerApiModelPh')}
          autoComplete="off"
        />
      </label>
      <label className="mb-4 block">
        <span className="text-[13px] font-medium text-[var(--ink)]">
          {t('agent.providerPlatformModelName')}
          <span className="text-red-500"> *</span>
        </span>
        <input
          className={fieldClass}
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t('agent.providerPlatformModelNamePh')}
          autoComplete="off"
        />
      </label>
      <div className="mb-4">
        <span className="text-[13px] font-medium text-[var(--ink)]">
          {t('agent.providerModelIcon')}
          <span className="text-red-500"> *</span>
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            title={t('agent.providerModelIconUpload')}
            aria-label={t('agent.providerModelIconUpload')}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1 transition',
              iconUrl
                ? 'ring-2 ring-[var(--ink)] ring-offset-1 ring-offset-[var(--account-card)]'
                : 'ring-[var(--line)] hover:bg-[var(--accent-soft)]'
            )}
            onClick={() => fileRef.current?.click()}
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="h-5 w-5 rounded object-cover" />
            ) : (
              <HiOutlinePlus className="h-4 w-4 text-[var(--ink)]" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onUploadIcon(e.target.files?.[0] || null);
              e.target.value = '';
            }}
          />
          {CUSTOM_MODEL_ICON_OPTIONS.map((opt) => {
            const selected = !iconUrl && iconKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={selected}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--account-card)] ring-1 transition',
                  selected
                    ? 'ring-2 ring-[var(--ink)] ring-offset-1 ring-offset-[var(--account-card)]'
                    : 'ring-[var(--line)] hover:bg-[var(--accent-soft)]'
                )}
                onClick={() => pickPreset(opt.key)}
              >
                <ModelBrandIcon model={{ iconKey: opt.key, label: opt.label }} size={18} />
              </button>
            );
          })}
        </div>
      </div>
      <label className="mb-4 block">
        <span className="text-[13px] font-medium text-[var(--ink)]">
          {t('agent.providerModelKind')}
          <span className="text-red-500"> *</span>
        </span>
        <Select
          size="large"
          className={selectFieldClass}
          value={kind === 'platform' ? 'text' : kind}
          options={platformModelKindOptions(t)}
          onChange={(v) => onKind(parseCustomModelKind(String(v)))}
        />
      </label>
    </>
  );
}

type RouteLaneT = (key: string, opts?: Record<string, unknown>) => string;

function renderRouteLaneSelectLabel(opts: {
  model: LlmModel | null;
  label: string;
  muted: boolean;
}): ReactNode {
  const { model, label, muted } = opts;
  return (
    <span className="flex min-w-0 items-center gap-2 pr-4">
      {model ? <ModelBrandIcon model={model} size={18} className="shrink-0" /> : null}
      <span className={cn('truncate', muted ? 'text-[var(--muted)]' : '')}>{label}</span>
    </span>
  );
}

function renderRouteLaneOptionMeta(
  full: LlmModel | null,
  t: RouteLaneT
): ReactNode {
  if (!full) return null;
  if (isUserCustomModel(full)) {
    return <ModelMetaBadge label={t('agent.modelBadgeCustom')} />;
  }
  const priceTag = modelPriceTagInfo(full, t);
  if (!priceTag) return null;
  return <ModelPriceTag level={priceTag.level} label={priceTag.label} />;
}

function renderRouteLaneSelectOption(
  opt: { value: string | number; label: ReactNode },
  catalogPool: LlmModel[],
  t: RouteLaneT
): ReactNode {
  const full = catalogPool.find((x) => x.id === opt.value) || null;
  const desc = full ? modelDescription(full, t) : undefined;
  return (
    <span className="flex w-full min-w-0 items-start gap-2.5">
      {full ? <ModelBrandIcon model={full} size={18} className="mt-0.5 shrink-0" /> : null}
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-[var(--ink)]">
            {opt.label}
          </span>
          {renderRouteLaneOptionMeta(full, t)}
        </span>
        {desc ? (
          <span className="mt-0.5 block min-w-0 max-w-full truncate text-[11px] leading-[1.35] text-[var(--muted)]">
            {desc}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Select `value` — only named presets; everything else maps to platform. */
function selectValueForRoutePreset(preset: AgentRoutePreset): AgentRoutePreset {
  if (preset === 'balanced' || preset === 'quality' || preset === 'custom') return preset;
  return 'platform';
}

function routePresetNoteText(preset: AgentRoutePreset, t: RouteLaneT): string {
  switch (preset) {
    case 'balanced':
      return t('account.agentRouteBalancedNote');
    case 'quality':
      return t('account.agentRouteQualityNote');
    case 'custom':
      return t('account.agentRouteCard.custom.desc');
    default:
      return t('account.agentRoutePlatformNote');
  }
}

function customModelKindLabelKey(kind: CustomModelKind): string {
  if (kind === 'vision') return 'agent.providerModelKindVision';
  if (kind === 'image') return 'agent.providerModelKindImage';
  if (kind === 'video') return 'agent.providerModelKindVideo';
  if (kind === 'platform') return 'agent.providerModelKindPlatform';
  return 'agent.providerModelKindText';
}

function modelOptions(
  models: LlmModel[],
  slot: 'fast' | 'standard' | 'reasoning' | 'vision' | 'image'
): { id: string; label: string }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string }[] = [];
  for (const m of models) {
    if (!m.id || m.id === 'auto') continue;
    if (!modelAllowsRouteSlot(m, slot)) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({ id: m.id, label: m.label || m.id });
  }
  return out;
}

function mergeModelCatalogPool(textModels: LlmModel[], imageModels: LlmModel[]): LlmModel[] {
  const byId = new Map<string, LlmModel>();
  for (const m of textModels) {
    if (m?.id) byId.set(m.id, m);
  }
  for (const m of imageModels) {
    if (!m?.id) continue;
    byId.set(m.id, { ...byId.get(m.id), ...m, kind: 'image' });
  }
  return [...byId.values()];
}

function routePresetShortLabel(
  preset: string | undefined,
  t: (key: string) => string
): string {
  switch (preset) {
    case 'balanced':
      return t('account.agentRouteCard.balanced.title');
    case 'quality':
      return t('account.agentRouteCard.quality.title');
    case 'custom':
      return t('account.agentRouteCard.custom.title');
    default:
      return t('account.agentRouteCard.platform.title');
  }
}

type CompactSubmenu =
  | { kind: 'preset' }
  | { kind: 'field'; key: 'fast' | 'standard' | 'reasoning' | 'vision' | 'image' }
  | null;

function submenuSelectedIdOf(
  submenu: CompactSubmenu,
  routePrefs: AgentRoutePrefs
): string {
  if (submenu?.kind === 'field') return String(routePrefs[submenu.key] || '');
  if (submenu?.kind !== 'preset') return '';
  if (routePrefs.preset === 'economy') return 'platform';
  if (routePrefs.preset === 'custom') return '';
  return routePrefs.preset;
}

type AgentRoutePrefsEditorProps = {
  /** Popover in agent dock / home — Lovart-style card (not account form). */
  compact?: boolean;
  /** Shown on the compact header left (Agent / Ask). */
  modeLabel?: string;
  className?: string;
  /** Fired after prefs are written to localStorage. */
  onChanged?: (prefs: AgentRoutePrefs) => void;
};

/**
 * Auto routing prefs editor — shared by Account settings and Agent/Ask model popover.
 * Same storage + presets as account.agentRoute* (platform / economy / balanced / quality / custom).
 */
function AgentRoutePrefsEditor({
  compact = false,
  modeLabel,
  className,
  onChanged,
}: AgentRoutePrefsEditorProps): ReactNode {
  const { t } = useTranslation();
  const desktopLocal = isDesktopLocal();
  const [routePrefs, setRoutePrefs] = useState<AgentRoutePrefs>(() =>
    desktopLocal ? emptyCustomRoutePrefs() : { preset: 'platform' }
  );
  const [routeSaved, setRouteSaved] = useState(false);
  const [textModels, setTextModels] = useState<LlmModel[]>([]);
  const [imageModels, setImageModels] = useState<LlmModel[]>([]);
  const [submenu, setSubmenu] = useState<CompactSubmenu>(null);
  const [openrouterAvailable, setOpenrouterAvailable] = useState<boolean | null>(
    cachedOpenrouterAvailable
  );
  const narrow = useNarrowViewport();

  useEffect(() => {
    setRoutePrefs(loadAgentRoutePrefs());
    let cancelled = false;
    async function loadDesignCatalog() {
      try {
        const cat = await fetchDesignCatalog();
        if (cancelled) return;
        const rules = cat.global_rules || {};
        cachedPresetRules = rules;
        setRoutePrefs(loadAgentRoutePrefs(rules));
      } catch {
        /* ignore */
      }
    }
    void loadDesignCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadRouteModels() {
      try {
        const res = await listModels();
        if (cancelled) return;
        const orOk = res?.openrouterAvailable !== false;
        cachedOpenrouterAvailable = orOk;
        setOpenrouterAvailable(orOk);
        const { text, image } = routeCatalogFromListModels(res);
        setTextModels(text);
        setImageModels(image);
        setRoutePrefs(loadAgentRoutePrefs(cachedPresetRules));
      } catch {
        /* ignore */
      }
    }
    void loadRouteModels();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh BYOK lane options when providers change (local desktop).
  useEffect(() => {
    if (!desktopLocal) return;
    let cancelled = false;
    async function refreshByokRouteModels() {
      await hydrateCustomLlmProviders();
      if (cancelled) return;
      const { text, image } = splitByokRouteModels(customProvidersAsModels());
      setTextModels(text);
      setImageModels(image);
    }
    void refreshByokRouteModels();
    return () => {
      cancelled = true;
    };
  }, [desktopLocal]);

  const commit = (next: AgentRoutePrefs) => {
    setRoutePrefs(next);
    if (desktopLocal || next.preset === 'custom') {
      saveAgentRoutePrefs({
        preset: 'custom',
        fast: next.fast,
        standard: next.standard,
        reasoning: next.reasoning,
        vision: next.vision,
        image: next.image,
      });
    } else if (next.preset === 'balanced' || next.preset === 'quality') {
      saveAgentRoutePrefs({ preset: next.preset });
    } else {
      saveAgentRoutePrefs({ preset: 'platform' });
    }
    setRouteSaved(true);
    onChanged?.(next);
  };

  const applyPreset = (preset: AgentRoutePreset) => {
    if (desktopLocal) {
      commit({ ...routePrefs, preset: 'custom' });
      return;
    }
    if (preset === 'custom') {
      const seed = seedCustomLaneFromPrefs(routePrefs);
      commit({
        preset: 'custom',
        fast: routePrefs.fast || seed.fast,
        standard: routePrefs.standard || seed.standard,
        reasoning: routePrefs.reasoning || seed.reasoning,
        vision: routePrefs.vision || seed.vision,
        image: routePrefs.image || seed.image,
      });
      return;
    }
    if (preset === 'platform' || preset === 'economy') {
      commit({ preset: 'platform' });
      return;
    }
    if (preset === 'balanced' || preset === 'quality') {
      commit(resolvePresetForRegion(preset));
      return;
    }
    commit({ preset: 'platform' });
  };

  const patchRouteField = (key: keyof AgentRoutePrefs, value: string) => {
    setRoutePrefs((prev) => {
      const next: AgentRoutePrefs = { ...prev, preset: 'custom', [key]: value };
      saveAgentRoutePrefs(next);
      setRouteSaved(true);
      onChanged?.(next);
      return next;
    });
  };

  const saveRoutePrefs = () => {
    saveAgentRoutePrefs(routePrefs);
    setRouteSaved(true);
    onChanged?.(routePrefs);
  };

  const catalogPool = mergeModelCatalogPool(textModels, imageModels);
  const fastOpts = modelOptions(catalogPool, 'fast');
  const standardOpts = modelOptions(catalogPool, 'standard');
  const reasoningOpts = modelOptions(catalogPool, 'reasoning');
  const visionOpts = modelOptions(catalogPool, 'vision');
  const imageOpts = modelOptions(catalogPool, 'image');
  const presetOptions = desktopLocal
    ? [{ value: 'custom', label: t('account.agentRoutePresetCustom') }]
    : [
        { value: 'platform', label: t('account.agentRoutePresetPlatform') },
        { value: 'balanced', label: t('account.agentRoutePresetBalanced') },
        { value: 'quality', label: t('account.agentRoutePresetQuality') },
        { value: 'custom', label: t('account.agentRoutePresetCustom') },
      ];

  const presetShortLabel = routePresetShortLabel(routePrefs.preset, t);

  const fieldRows = [
    { key: 'fast' as const, label: t('account.agentRouteFast'), opts: fastOpts },
    { key: 'standard' as const, label: t('account.agentRouteStandard'), opts: standardOpts },
    { key: 'reasoning' as const, label: t('account.agentRouteReasoning'), opts: reasoningOpts },
    { key: 'vision' as const, label: t('account.agentRouteVision'), opts: visionOpts },
    { key: 'image' as const, label: t('account.agentRouteImage'), opts: imageOpts },
  ];

  const laneEmptyLabel = t('account.agentRouteLaneEmpty');

  const modelLabelOf = (id: string | undefined, opts: { id: string; label: string }[]) => {
    const v = String(id || '').trim();
    if (!v) return opts[0]?.label || laneEmptyLabel;
    return opts.find((o) => o.id === v)?.label || v;
  };

  /** Only return a catalog hit — never invent a stub (stub still draws a brand icon). */
  const modelRefOf = (id: string | undefined, opts: { id: string; label: string }[]) => {
    const v = String(id || '').trim() || opts[0]?.id || '';
    if (!v) return null;
    return catalogPool.find((m) => m.id === v) || null;
  };

  const headerTitle = modeLabel || t('agent.interactionAgent');
  /** Named presets → Auto; only `custom` → Custom (shows per-tier picks). */
  const multimodalAuto = routePrefs.preset !== 'custom';

  if (compact) {
    const presetOrder = (
      desktopLocal ? (['custom'] as const) : (['platform', 'balanced', 'quality'] as const)
    );

    let submenuTitle = '';
    let submenuOptions: Array<{ id: string; label: string; desc?: string; model?: LlmModel | null }> =
      [];
    if (submenu?.kind === 'preset') {
      submenuTitle = t('account.agentRoutePreset');
      submenuOptions = presetOrder.map((id) => ({
        id,
        label: t(`account.agentRouteCard.${id}.title`),
        model: null,
      }));
    } else if (submenu?.kind === 'field') {
      const row = fieldRows.find((r) => r.key === submenu.key);
      if (row) {
        submenuTitle = row.label;
        submenuOptions = row.opts.map((m) => {
          const full = catalogPool.find((x) => x.id === m.id) || null;
          return {
            id: m.id,
            label: m.label,
            desc: full ? modelDescription(full, t) : undefined,
            model: full,
          };
        });
      }
    }

    const submenuSelectedId = submenuSelectedIdOf(submenu, routePrefs);
    const submenuTab =
      submenu?.kind === 'field' && submenu.key === 'image' ? 'image' : 'design';
    const submenuModels = submenuOptions.map(
      (o) =>
        o.model ||
        ({ id: o.id, label: o.label, provider: '' } satisfies LlmModel)
    );

    const renderSubmenuPanel = (opts?: { embedded?: boolean }) => {
      const embedded = Boolean(opts?.embedded);
      if (submenu?.kind === 'preset') {
        return (
          <div
            data-agent-route-submenu=""
            className={cn(
              embedded ? 'w-full' : AGENT_ROUTE_SUBMENU_PANEL,
              !embedded && 'rcb-agent-route-submenu-popup'
            )}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {embedded ? (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setSubmenu(null)}
                className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                <HiChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
                {t('agent.routeBack')}
              </button>
            ) : (
              <div className="px-3 pt-2.5 pb-1">
                <p className="truncate text-[12px] font-medium text-[var(--muted)]">
                  {t('account.agentRoutePreset')}
                </p>
              </div>
            )}
            <div className={cn('flex flex-col gap-1.5', embedded ? 'pt-0.5' : 'p-2 pt-1')}>
              {presetOrder.map((id) => {
                const active = routePrefs.preset === id;
                const title = t(`account.agentRouteCard.${id}.title`);
                const mult = t(`account.agentRouteCard.${id}.mult`);
                const badge = t(`account.agentRouteCard.${id}.badge`);
                const desc =
                  openrouterAvailable === false && (id === 'balanced' || id === 'quality')
                    ? t('account.agentRouteOpenrouterBlocked')
                    : t(`account.agentRouteCard.${id}.desc`);
                return (
                  <button
                    key={id}
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      applyPreset(id);
                      setSubmenu(null);
                    }}
                    className={cn(
                      'w-full min-w-0 rounded-xl px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                        : 'text-[var(--ink)] hover:bg-[var(--accent-soft)]'
                    )}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                        <span className="truncate text-[13px] font-bold leading-none">{title}</span>
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                            active
                              ? 'bg-[var(--surface)] text-[var(--muted)]'
                              : 'bg-[var(--line)]/55 text-[var(--muted)]'
                          )}
                        >
                          {mult}
                        </span>
                      </div>
                      <span className="min-w-0 shrink truncate text-[11px] leading-none text-[var(--muted)]">
                        {badge}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-[var(--ink)]/75">
                      {desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <div
          data-agent-route-submenu=""
          className={cn(embedded ? 'w-full' : 'rcb-agent-route-submenu-popup')}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {embedded ? (
            <div className="w-full">
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setSubmenu(null)}
                className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                <HiChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
                {t('agent.routeBack')}
              </button>
              <ModelPickerPanel
                chrome="plain"
                hideAuto
                useModelsAsIs
                tab={submenuTab}
                models={submenuModels}
                selectedId={submenuSelectedId}
                onPick={(id) => {
                  if (submenu?.kind === 'field') patchRouteField(submenu.key, id);
                  setSubmenu(null);
                }}
                onRowPointerDown={(e) => e.preventDefault()}
              />
            </div>
          ) : (
            <ModelPickerPanel
              chrome="submenu"
              hideAuto
              useModelsAsIs
              title={submenuTitle}
              tab={submenuTab}
              models={submenuModels}
              selectedId={submenuSelectedId}
              onPick={(id) => {
                if (submenu?.kind === 'field') patchRouteField(submenu.key, id);
                setSubmenu(null);
              }}
              onRowPointerDown={(e) => e.preventDefault()}
            />
          )}
        </div>
      );
    };

    /** Keep focus inside the parent floating menu — remounting rows would blur to body and flicker-close. */
    const keepParentMenuFocus = (e: { preventDefault: () => void }) => {
      e.preventDefault();
    };

    if (narrow && submenu) {
      return (
        <div className={cn(AGENT_ROUTE_POPOVER_PANEL, className)}>
          <div className="p-2.5">{renderSubmenuPanel({ embedded: true })}</div>
        </div>
      );
    }

    /**
     * Side flyout via Dropdown (flip/shift), not absolute RouteSideFlyout.
     * `items[].children` is hover 二级 for flat menus; here the body is custom
     * ModelPickerPanel / preset cards → popupRender.
     */
    const routeSideDropdown = (opts: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      trigger: ReactNode;
    }) => (
      <Dropdown
        trigger="click"
        placement="right-start"
        strategy="fixed"
        offset={20}
        items={[]}
        open={opts.open}
        onOpenChange={opts.onOpenChange}
        nestedDismissGuard={ROUTE_SUBMENU_DISMISS_GUARD}
        floatingClassName="z-[80]"
        referenceClassName="block w-full"
        popupRender={() => (
          <div className="max-w-full" onPointerDown={(e) => e.stopPropagation()}>
            {renderSubmenuPanel()}
          </div>
        )}
      >
        {opts.trigger}
      </Dropdown>
    );

    return (
      <div className={cn(AGENT_ROUTE_POPOVER_PANEL, 'overflow-visible', className)}>
        <div className="p-2.5">
          {routeSideDropdown({
            open: !narrow && submenu?.kind === 'preset',
            onOpenChange: (open) => {
              if (open) setSubmenu({ kind: 'preset' });
              else setSubmenu((v) => (v?.kind === 'preset' ? null : v));
            },
            trigger: (
              <button
                type="button"
                className={cn(
                  'flex w-full min-w-0 items-center justify-between gap-2 rounded-xl bg-[var(--canvas)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--canvas)]/80',
                  submenu?.kind === 'preset' && 'ring-1 ring-[var(--line)]'
                )}
                onPointerDown={keepParentMenuFocus}
              >
                <span className="shrink-0 text-[13px] font-semibold text-[var(--ink)]">
                  {headerTitle}
                </span>
                <span className="inline-flex min-w-0 max-w-[58%] items-center gap-0.5 text-[12px] text-[var(--muted)]">
                  <span className="truncate">{presetShortLabel}</span>
                  <HiChevronRight className="h-3.5 w-3.5 shrink-0" />
                </span>
              </button>
            ),
          })}

          <div className="mx-1 mt-2 border-t border-[var(--line)]" />

          <div className="mt-2.5 flex items-center justify-between gap-2 px-1">
            <Tooltip tip={t('agent.routeMultimodalTip')} placement="top">
              <span className="cursor-default text-[13px] font-medium text-[var(--ink)]">
                {t('agent.routeMultimodal')}
              </span>
            </Tooltip>
            <SegmentedControl
              size="xs"
              radius="full"
              aria-label={t('agent.routeMultimodal')}
              value={multimodalAuto ? 'auto' : 'custom'}
              onChange={(v) => {
                if (v === 'auto') {
                  if (routePrefs.preset === 'custom') applyPreset('platform');
                } else if (routePrefs.preset !== 'custom') {
                  applyPreset('custom');
                }
                setSubmenu(null);
              }}
              options={[
                { value: 'auto', label: t('agent.routeMultimodalAuto') },
                { value: 'custom', label: t('agent.routeMultimodalCustom') },
              ]}
            />
          </div>

          {!multimodalAuto ? (
            <div className="mt-1 px-0.5">
              {fieldRows.map((row) => {
                const active = submenu?.kind === 'field' && submenu.key === row.key;
                const laneModel = modelRefOf(routePrefs[row.key], row.opts);
                return (
                  <div key={row.key}>
                    {routeSideDropdown({
                      open: !narrow && active,
                      onOpenChange: (open) => {
                        if (open) setSubmenu({ kind: 'field', key: row.key });
                        else
                          setSubmenu((v) =>
                            v?.kind === 'field' && v.key === row.key ? null : v
                          );
                      },
                      trigger: (
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2 text-left transition-colors',
                            active
                              ? 'bg-[var(--accent-soft)]'
                              : 'hover:bg-[var(--accent-soft)]'
                          )}
                          onPointerDown={keepParentMenuFocus}
                        >
                          <span className="shrink-0 text-[13px] text-[var(--ink)]">
                            {row.label}
                          </span>
                          <span className="inline-flex w-[6.75rem] shrink-0 items-center justify-start gap-1 text-[12px] text-[var(--muted)]">
                            {laneModel ? <ModelBrandIcon model={laneModel} size={14} /> : null}
                            <span className="min-w-0 flex-1 truncate text-left">
                              {modelLabelOf(routePrefs[row.key], row.opts)}
                            </span>
                            <HiChevronRight className="h-3.5 w-3.5 shrink-0" />
                          </span>
                        </button>
                      ),
                    })}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const selectCls = selectFieldClass;
  const labelCls = 'text-[13px] font-medium text-[var(--ink)]';

  return (
    <div className={cn('space-y-4', className)}>
      <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">
        {t('account.agentRouteSection')}
      </h2>
      <p className="mb-1 text-[13px] leading-relaxed text-[var(--muted)]">
        {t('account.agentRouteHint')}
      </p>

      <div>
        <span className={labelCls}>{t('account.agentRoutePreset')}</span>
        <Select
          size="large"
          className={selectCls}
          value={selectValueForRoutePreset(routePrefs.preset)}
          options={presetOptions}
          onChange={(v) => applyPreset(String(v) as AgentRoutePreset)}
        />
      </div>

      {openrouterAvailable === false ? (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          {t('account.agentRouteOpenrouterBlocked')}
        </p>
      ) : (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          {routePresetNoteText(routePrefs.preset, t)}
        </p>
      )}

      {routePrefs.preset === 'custom' ? (
        <div className="space-y-3 rounded-lg bg-[var(--account-main)] p-3 ring-1 ring-[var(--line)]">
          {fieldRows.map((row) => {
            const currentId =
              String(routePrefs[row.key] || '').trim() || row.opts[0]?.id || '';
            const currentModel = modelRefOf(routePrefs[row.key], row.opts);
            const emptyLane = !currentId;
            return (
              <label key={row.key} className="block">
                <span className={labelCls}>{row.label}</span>
                <Select
                  size="large"
                  className={selectCls}
                  value={currentId || undefined}
                  placeholder={laneEmptyLabel}
                  options={row.opts.map((m) => ({ value: m.id, label: m.label }))}
                  onChange={(v) => patchRouteField(row.key, String(v))}
                  labelRender={() =>
                    renderRouteLaneSelectLabel({
                      model: currentModel,
                      label: modelLabelOf(routePrefs[row.key], row.opts),
                      muted: emptyLane || !currentModel,
                    })
                  }
                  optionRender={(opt) => renderRouteLaneSelectOption(opt, catalogPool, t)}
                />
              </label>
            );
          })}
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            {t('account.agentRouteCostNote')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AgentModelsPanel({
  onProvidersChange,
  onRequestUpgrade,
}: Props): ReactNode {
  const { t } = useTranslation();
  const planId = useSelector((state: any) => (state.wallet?.planId as PlanId) || 'free');
  // Local desktop: BYOK is always allowed (no cloud membership).
  const canCustom = isDesktopLocal() || planAllowsCustomModels(planId);
  const [providers, setProviders] = useState<CustomLlmProvider[]>([]);
  const [platforms, setPlatforms] = useState<ByokPlatform[]>([]);
  // '' = nothing picked yet; MANUAL_PROVIDER_ID = free-text; else a platform id.
  const [presetId, setPresetId] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiModel, setApiModel] = useState('');
  const [modelKind, setModelKind] = useState<CustomModelKind>('text');
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Optional extra model id while adding a platform key (also reused for「添加模型」on saved rows).
  const [addModelForId, setAddModelForId] = useState('');
  const [addModelName, setAddModelName] = useState('');
  const [addModelApiId, setAddModelApiId] = useState('');
  const [addModelKind, setAddModelKind] = useState<CustomModelKind>('text');
  const [addModelIconKey, setAddModelIconKey] = useState('');
  const [addModelIconUrl, setAddModelIconUrl] = useState('');
  const [addModelError, setAddModelError] = useState('');

  const selectedPlatform =
    presetId && presetId !== MANUAL_PROVIDER_ID
      ? platforms.find((p) => p.id === presetId) ?? null
      : null;
  const isManualProvider = presetId === MANUAL_PROVIDER_ID;

  const askUpgrade = () => {
    if (isDesktopLocal()) return;
    if (onRequestUpgrade) onRequestUpgrade();
    else setSettingsOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    async function loadProviderData() {
      try {
        const list = await hydrateCustomLlmProviders();
        if (!cancelled) setProviders(list);
      } catch {
        /* ignore */
      }
      try {
        const res = await listModels();
        if (cancelled) return;
        const list = res.byokPlatforms?.length
          ? res.byokPlatforms
          : (res.byokPresets as ByokPlatform[] | undefined) ?? [];
        setPlatforms(
          list.map((p) => ({
            ...p,
            rowId: p.rowId || `platform:${p.id}`,
            kinds: p.kinds?.length ? p.kinds : ['text'],
          }))
        );
      } catch {
        /* platforms optional — manual form still works */
      }
    }
    void loadProviderData();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistProviders = (next: CustomLlmProvider[]) => {
    setProviders(next);
    onProvidersChange?.();
    invalidateChatModelsCache();
  };

  const onPickPlatform = (id: string) => {
    setPresetId(id);
    setError('');
    setAddModelApiId('');
    setAddModelName('');
    setAddModelKind('text');
    setAddModelIconKey('');
    setAddModelIconUrl('');
    setAddModelError('');
    if (id === MANUAL_PROVIDER_ID || !id) {
      setModelKind('text');
      setApiModel('');
      return;
    }
    const platform = platforms.find((p) => p.id === id);
    if (!platform) return;
    setBaseUrl(platform.baseUrl);
    setWebsite(platform.website || '');
    setName(platform.name);
    setApiModel('*');
    setModelKind('platform');
  };

  const resetForm = () => {
    setPresetId('');
    setName('');
    setWebsite('');
    setApiKey('');
    setBaseUrl('');
    setApiModel('');
    setModelKind('text');
    setAddModelApiId('');
    setAddModelName('');
    setAddModelKind('text');
    setAddModelIconKey('');
    setAddModelIconUrl('');
    setAddModelError('');
  };

  const providerSelectOptions = [
    ...platforms.map((p) => ({
      value: p.id,
      label: p.name,
    })),
    { value: MANUAL_PROVIDER_ID, label: t('agent.providerPresetManual') },
  ];

  const onSaveProvider = () => {
    if (!canCustom) {
      askUpgrade();
      return;
    }
    const isPlatform = Boolean(selectedPlatform) || modelKind === 'platform';
    // Platform presets always carry name / baseUrl — refill if the user cleared an autofilled field.
    const n = (name.trim() || selectedPlatform?.name || '').trim();
    const url = (baseUrl.trim() || selectedPlatform?.baseUrl || '').trim().replace(/\/+$/, '');
    const site = (website.trim() || selectedPlatform?.website || '').trim();
    if (!isPlatform && !modelKind) {
      setError(t('agent.providerModelKindRequired'));
      return;
    }
    if (!n) {
      setError(t('agent.providerNameRequired'));
      return;
    }
    if (!url) {
      setError(t('agent.providerBaseUrlRequired'));
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError(t('agent.providerBaseUrlInvalid'));
      return;
    }
    // Aggregators: one key unlocks the catalog (apiModel sentinel). Model IDs only via「添加模型」or manual.
    const mid = isPlatform ? '*' : apiModel.trim();
    if (!mid) {
      setError(t('agent.providerApiModelRequired', { defaultValue: '请填写模型 ID（如 gpt-4o）' }));
      return;
    }
    const key = apiKey.trim();
    if (!key) {
      setError(t('agent.providerApiKeyRequired', { defaultValue: 'API key is required' }));
      return;
    }
    setError('');
    const draft: CustomLlmProvider = {
      id: selectedPlatform
        ? selectedPlatform.rowId || `platform:${selectedPlatform.id}`
        : createCustomLlmProviderId(),
      name: n,
      website: site,
      apiKey: key,
      baseUrl: url,
      apiModel: mid,
      modelKind: isPlatform ? 'platform' : modelKind,
      createdAt: Date.now(),
    };
    const extraMid = isPlatform ? addModelApiId.trim() : '';
    const extraName = addModelName.trim();
    const extraIconKey = addModelIconKey.trim();
    const extraIconUrl = addModelIconUrl.trim();
    const extraKind = addModelKind === 'platform' ? 'text' : addModelKind;
    if (extraMid) {
      if (!extraName) {
        setError(t('agent.providerPlatformModelNameRequired'));
        return;
      }
      if (!extraIconKey && !extraIconUrl) {
        setError(t('agent.providerModelIconRequired'));
        return;
      }
      if (!extraKind) {
        setError(t('agent.providerModelKindRequired'));
        return;
      }
    }
    void (async () => {
      try {
        const saved = await persistCustomLlmProvider(draft);
        let next = [saved, ...providers.filter((p) => p.id !== saved.id)];
        if (extraMid && selectedPlatform) {
          const child: CustomLlmProvider = {
            id: createPlatformModelId(selectedPlatform.id),
            name: extraName,
            website: site,
            apiKey: '',
            baseUrl: url,
            apiModel: extraMid,
            modelKind: extraKind,
            iconKey: extraIconKey,
            iconUrl: extraIconUrl,
            createdAt: Date.now(),
          };
          try {
            const savedChild = await persistCustomLlmProvider(child);
            next = [savedChild, ...next.filter((p) => p.id !== savedChild.id)];
          } catch {
            setError(t('agent.providerPlatformModelFailed'));
            persistProviders(next);
            return;
          }
        }
        persistProviders(next);
        resetForm();
      } catch {
        setError(t('agent.providerSaveFailed', { defaultValue: 'Failed to save provider' }));
      }
    })();
  };

  const onRemove = (id: string) => {
    if (!canCustom) {
      askUpgrade();
      return;
    }
    const removeIds = new Set<string>([id]);
    if (isPlatformByokId(id) || providers.find((p) => p.id === id)?.modelKind === 'platform') {
      for (const child of childModelsOf(id)) removeIds.add(child.id);
    }
    void (async () => {
      await Promise.all([...removeIds].map((rid) => removeCustomLlmProvider(rid)));
      persistProviders(providers.filter((p) => !removeIds.has(p.id)));
      if (addModelForId === id) closeAddModel();
    })();
  };

  const openAddModel = (platformRowId: string) => {
    setAddModelForId(platformRowId);
    setAddModelName('');
    setAddModelApiId('');
    setAddModelKind('text');
    setAddModelIconKey('');
    setAddModelIconUrl('');
    setAddModelError('');
  };

  const closeAddModel = () => {
    setAddModelForId('');
    setAddModelName('');
    setAddModelApiId('');
    setAddModelKind('text');
    setAddModelIconKey('');
    setAddModelIconUrl('');
    setAddModelError('');
  };

  const onSavePlatformModel = (platformRow: CustomLlmProvider) => {
    if (!canCustom) {
      askUpgrade();
      return;
    }
    const mid = addModelApiId.trim();
    const n = addModelName.trim();
    const iconKey = addModelIconKey.trim();
    const iconUrl = addModelIconUrl.trim();
    const kind = addModelKind === 'platform' ? 'text' : addModelKind;
    if (!mid) {
      setAddModelError(t('agent.providerApiModelRequired', { defaultValue: '请填写模型 ID' }));
      return;
    }
    if (!n) {
      setAddModelError(t('agent.providerPlatformModelNameRequired'));
      return;
    }
    if (!iconKey && !iconUrl) {
      setAddModelError(t('agent.providerModelIconRequired'));
      return;
    }
    if (!kind) {
      setAddModelError(t('agent.providerModelKindRequired'));
      return;
    }
    const providerKey =
      platformProviderFromModelId(platformRow.id) ||
      (isPlatformByokId(platformRow.id)
        ? platformRow.id.slice('platform:'.length)
        : platforms.find((x) => x.rowId === platformRow.id)?.id || '');
    if (!providerKey) {
      setAddModelError(t('agent.providerPlatformModelFailed'));
      return;
    }
    setAddModelError('');
    const draft: CustomLlmProvider = {
      id: createPlatformModelId(providerKey),
      name: n,
      website: platformRow.website || '',
      apiKey: '',
      baseUrl: platformRow.baseUrl,
      apiModel: mid,
      modelKind: kind,
      iconKey,
      iconUrl,
      createdAt: Date.now(),
    };
    void (async () => {
      try {
        const saved = await persistCustomLlmProvider(draft);
        persistProviders([saved, ...providers.filter((p) => p.id !== saved.id)]);
        closeAddModel();
      } catch {
        setAddModelError(t('agent.providerPlatformModelFailed'));
      }
    })();
  };

  const platformRows = providers.filter(
    (p) => isPlatformByokId(p.id) || p.modelKind === 'platform'
  );
  const childModelsOf = (platformRowId: string) => {
    const key = isPlatformByokId(platformRowId)
      ? platformRowId.slice('platform:'.length)
      : platforms.find((x) => x.rowId === platformRowId)?.id || '';
    return providers.filter(
      (p) => isPlatformModelId(p.id) && platformProviderFromModelId(p.id) === key
    );
  };
  const otherProviders = providers.filter(
    (p) =>
      !isPlatformByokId(p.id) &&
      p.modelKind !== 'platform' &&
      !isPlatformModelId(p.id)
  );

  return (
    <>
      <div className="space-y-5">
        <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
          <AgentRoutePrefsEditor />
        </section>

        <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
          <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">
            {t('account.agentModelsSection')}
          </h2>
          <p className="mb-5 text-[13px] leading-relaxed text-[var(--muted)]">
            {t('agent.settingsHint')}
          </p>

          {!canCustom ? (
            <div className="mb-5 rounded-lg bg-[var(--account-main)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink)] ring-1 ring-[var(--line)]">
              <p className="font-medium">{t('agent.providerMemberRequired')}</p>
              <p className="mt-1 text-[var(--muted)]">{t('agent.providerMemberHint')}</p>
              <button
                type="button"
                className="mt-2 text-[13px] font-medium text-[var(--ink)] underline underline-offset-2"
                onClick={askUpgrade}
              >
                {t('agent.providerUpgrade')}
              </button>
            </div>
          ) : null}

          <fieldset disabled={!canCustom} className={cn(!canCustom && 'opacity-50')}>
            <label className="mb-4 block">
              <span className="text-[13px] font-medium text-[var(--ink)]">
                {t('agent.providerPresetLabel')}
                <span className="text-red-500"> *</span>
              </span>
              <Select
                size="large"
                className={selectFieldClass}
                value={presetId}
                placeholder={t('agent.providerPresetPlaceholder')}
                options={providerSelectOptions}
                onChange={(v) => onPickPlatform(String(v))}
              />
              <span className="mt-1.5 block text-[12px] text-[var(--muted)]">
                {t('agent.providerPlatformHint')}
              </span>
            </label>

            {presetId ? (
              <>
                <label className="mb-4 block">
                  <span className="text-[13px] font-medium text-[var(--ink)]">
                    API Key
                    <span className="text-red-500"> *</span>
                  </span>
                  <input
                    className={fieldClass}
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t('agent.providerApiKeyPh')}
                    autoComplete="off"
                  />
                  <span className="mt-1.5 block text-[12px] text-[var(--muted)]">
                    {t('agent.providerApiKeyHint')}
                  </span>
                </label>

                {selectedPlatform ? (
                  <AddPlatformModelFields
                    fieldClass={fieldClass}
                    selectFieldClass={selectFieldClass}
                    t={t}
                    apiId={addModelApiId}
                    name={addModelName}
                    iconKey={addModelIconKey}
                    iconUrl={addModelIconUrl}
                    kind={addModelKind}
                    onApiId={setAddModelApiId}
                    onName={setAddModelName}
                    onIconKey={setAddModelIconKey}
                    onIconUrl={setAddModelIconUrl}
                    onKind={setAddModelKind}
                  />
                ) : null}

                {isManualProvider ? (
                  <>
                    <label className="mb-4 block">
                      <span className="text-[13px] font-medium text-[var(--ink)]">
                        {t('agent.providerModelKind')}
                        <span className="text-red-500"> *</span>
                      </span>
                      <Select
                        size="large"
                        className={selectFieldClass}
                        value={modelKind === 'platform' ? 'text' : modelKind}
                        options={[
                          { value: 'text', label: t('agent.providerModelKindText') },
                          { value: 'vision', label: t('agent.providerModelKindVision') },
                          { value: 'image', label: t('agent.providerModelKindImage') },
                        ]}
                        onChange={(v) => setModelKind(parseCustomModelKind(String(v)))}
                      />
                      <span className="mt-1.5 block text-[12px] text-[var(--muted)]">
                        {t('agent.providerModelKindHint')}
                      </span>
                    </label>

                    <label className="mb-4 block">
                      <span className="text-[13px] font-medium text-[var(--ink)]">
                        {t('agent.providerApiModel', { defaultValue: '模型 ID' })}
                        <span className="text-red-500"> *</span>
                      </span>
                      <input
                        className={fieldClass}
                        value={apiModel}
                        onChange={(e) => setApiModel(e.target.value)}
                        placeholder={t('agent.providerApiModelPh', {
                          defaultValue: '例如 gpt-4o / deepseek-chat',
                        })}
                        autoComplete="off"
                        required
                      />
                      <span className="mt-1.5 block text-[12px] text-[var(--muted)]">
                        {t('agent.providerApiModelHint', {
                          defaultValue: '上游 chat/completions 使用的 model 字段，不是供应商显示名。',
                        })}
                      </span>
                    </label>
                  </>
                ) : null}

                <label className="mb-4 block">
                  <span className="text-[13px] font-medium text-[var(--ink)]">
                    {t('agent.providerName')}
                    {isManualProvider ? <span className="text-red-500"> *</span> : null}
                  </span>
                  <input
                    className={fieldClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('agent.providerNamePh')}
                    autoComplete="off"
                    required={isManualProvider}
                  />
                </label>

                <label className="mb-4 block">
                  <span className="text-[13px] font-medium text-[var(--ink)]">
                    {t('agent.providerBaseUrl')}
                    {isManualProvider ? <span className="text-red-500"> *</span> : null}
                  </span>
                  <input
                    className={fieldClass}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com"
                    autoComplete="off"
                    required={isManualProvider}
                  />
                  {isManualProvider ? (
                    <span className="mt-1.5 block rounded-lg bg-[#FFF8E6] px-2.5 py-2 text-[12px] leading-relaxed text-[#8A6D1D] dark:bg-[#3A3218] dark:text-[#E8D48A]">
                      {t('agent.providerBaseUrlHint')}
                    </span>
                  ) : (
                    <span className="mt-1.5 block text-[12px] text-[var(--muted)]">
                      {t('agent.providerPlatformAutofillHint')}
                    </span>
                  )}
                </label>

                <label className="mb-4 block">
                  <span className="text-[13px] font-medium text-[var(--ink)]">
                    {t('agent.providerWebsite')}
                  </span>
                  <input
                    className={fieldClass}
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://"
                    autoComplete="off"
                  />
                </label>
              </>
            ) : null}
          </fieldset>

          {error ? <p className="mb-3 text-[13px] text-red-500">{error}</p> : null}

          <div className="flex justify-end border-t border-[var(--line)] pt-5">
            <button
              type="button"
              disabled={!canCustom}
              className="inline-flex h-9 items-center rounded-xl bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--on-brand)] hover:opacity-90 disabled:opacity-50"
              onClick={onSaveProvider}
            >
              {canCustom ? t('agent.providerSave') : t('agent.providerSaveMember')}
            </button>
          </div>
        </section>

        {providers.length ? (
          <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
            <h2 className="mb-4 text-[15px] font-semibold text-[var(--ink)]">
              {t('agent.providerSaved')}
            </h2>
            <ul className="flex flex-col gap-3">
              {platformRows.map((p) => {
                const children = childModelsOf(p.id);
                const adding = addModelForId === p.id;
                return (
                  <li
                    key={p.id}
                    className="rounded-lg bg-[var(--account-main)] px-3 py-2.5 ring-1 ring-[var(--line)]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-[var(--ink)]">
                          {p.name}
                        </div>
                        <div className="truncate text-[12px] text-[var(--muted)]">
                          {p.baseUrl}
                          {p.apiKeyHint ? ` · ${p.apiKeyHint}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                        onClick={() => (adding ? closeAddModel() : openAddModel(p.id))}
                      >
                        {adding ? t('common.cancel') : t('agent.providerAddPlatformModel')}
                      </button>
                      <button
                        type="button"
                        aria-label={t('common.delete')}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                        onClick={() => onRemove(p.id)}
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>

                    {children.length ? (
                      <ul className="mt-2 space-y-1 border-t border-[var(--line)] pt-2">
                        {children.map((child) => (
                          <li
                            key={child.id}
                            className="flex items-center gap-2 rounded-md px-1.5 py-1"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <ModelBrandIcon
                                  model={{
                                    iconKey: child.iconKey,
                                    iconUrl: child.iconUrl,
                                    label: child.name,
                                    id: child.apiModel,
                                  }}
                                  size={16}
                                />
                                <span className="truncate text-[13px] text-[var(--ink)]">
                                  {child.name}
                                </span>
                                <span className="shrink-0 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                                  {t(customModelKindLabelKey(child.modelKind))}
                                </span>
                              </div>
                              <div className="truncate text-[11px] text-[var(--muted)]">
                                {child.apiModel}
                              </div>
                            </div>
                            <button
                              type="button"
                              aria-label={t('common.delete')}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                              onClick={() => onRemove(child.id)}
                            >
                              <HiOutlineTrash className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {adding ? (
                      <div className="mt-2 border-t border-[var(--line)] pt-2">
                        <AddPlatformModelFields
                          fieldClass={fieldClass}
                          selectFieldClass={selectFieldClass}
                          t={t}
                          apiId={addModelApiId}
                          name={addModelName}
                          iconKey={addModelIconKey}
                          iconUrl={addModelIconUrl}
                          kind={addModelKind}
                          onApiId={setAddModelApiId}
                          onName={setAddModelName}
                          onIconKey={setAddModelIconKey}
                          onIconUrl={setAddModelIconUrl}
                          onKind={setAddModelKind}
                        />
                        {addModelError ? (
                          <p className="mb-3 text-[12px] text-red-500">{addModelError}</p>
                        ) : null}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center rounded-lg bg-[var(--ink)] px-3 text-[12px] font-medium text-[var(--on-brand)] hover:opacity-90"
                            onClick={() => onSavePlatformModel(p)}
                          >
                            {t('agent.providerAddPlatformModelSave')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}

              {otherProviders.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-[var(--account-main)] px-3 py-2.5 ring-1 ring-[var(--line)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-[14px] font-medium text-[var(--ink)]">
                        {p.name}
                      </div>
                      <span className="shrink-0 rounded-lg bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
                        {t(customModelKindLabelKey(p.modelKind))}
                      </span>
                    </div>
                    <div className="truncate text-[12px] text-[var(--muted)]">
                      {p.apiModel ? `${p.apiModel} · ` : ''}
                      {p.baseUrl}
                      {p.apiKeyHint ? ` · ${p.apiKeyHint}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                    onClick={() => onRemove(p.id)}
                  >
                    <HiOutlineTrash className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {!onRequestUpgrade ? (
        <AccountSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialTab="plans"
        />
      ) : null}
    </>
  );
}

export default memo(AgentModelsPanel);

const MemoizedAgentRoutePrefsEditor = memo(AgentRoutePrefsEditor);
export { MemoizedAgentRoutePrefsEditor as AgentRoutePrefsEditor };
