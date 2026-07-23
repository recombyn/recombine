/**
 * Account Agent tab: Auto routing prefs + custom OpenAI-compatible providers (Pro).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineTrash } from 'react-icons/hi2';
import { fetchLlmModels, type LlmModel } from '@/apis/chat';
import { Select } from '@/components/base';
import PlansDialog from '@/components/layout/PlansDialog';
import { cn } from '@/utils/classnames';
import { planHasProFeatures, type PlanId } from '@/utils/wallet';
import {
  createCustomLlmProviderId,
  loadCustomLlmProviders,
  saveCustomLlmProviders,
  type CustomLlmProvider,
} from './customLlmProviders';

type Props = {
  onProvidersChange?: () => void;
};

export type AgentRoutePreset = 'platform' | 'economy' | 'balanced' | 'quality' | 'custom';

export type AgentRoutePrefs = {
  preset: AgentRoutePreset;
  simple?: string;
  medium?: string;
  complex?: string;
  vision?: string;
  image?: string;
};

const ROUTE_PREFS_KEY = 'resume.agentRoutePrefs.v1';

const ROUTE_PRESETS: Record<Exclude<AgentRoutePreset, 'platform' | 'custom'>, AgentRoutePrefs> = {
  economy: {
    preset: 'economy',
    simple: 'doubao-seed-2-1-turbo',
    medium: 'doubao-seed-2-1-turbo',
    complex: 'deepseek-v4-flash',
    vision: 'doubao-seed-2-1-turbo',
    image: 'doubao-seedream-5-0-lite',
  },
  balanced: {
    preset: 'balanced',
    simple: 'doubao-seed-2-1-turbo',
    medium: 'glm-5-2',
    complex: 'deepseek-v4-pro',
    vision: 'doubao-seed-2-1-pro',
    image: 'doubao-seedream-5-0-lite',
  },
  quality: {
    preset: 'quality',
    simple: 'doubao-seed-2-1-pro',
    medium: 'glm-5-2',
    complex: 'deepseek-v4-pro',
    vision: 'doubao-seed-2-1-pro',
    image: 'doubao-seedream-5-0-pro',
  },
};

export function loadAgentRoutePrefs(): AgentRoutePrefs {
  try {
    const raw = localStorage.getItem(ROUTE_PREFS_KEY);
    if (!raw) return { preset: 'platform' };
    const parsed = JSON.parse(raw) as AgentRoutePrefs;
    if (!parsed || typeof parsed !== 'object') return { preset: 'platform' };
    const preset = (parsed.preset || 'platform') as AgentRoutePreset;
    if (preset === 'platform') return { preset: 'platform' };
    if (preset !== 'custom' && ROUTE_PRESETS[preset]) {
      return { ...ROUTE_PRESETS[preset] };
    }
    return {
      preset: 'custom',
      simple: String(parsed.simple || ''),
      medium: String(parsed.medium || ''),
      complex: String(parsed.complex || ''),
      vision: String(parsed.vision || ''),
      image: String(parsed.image || ''),
    };
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
  const base =
    prefs.preset !== 'custom' && ROUTE_PRESETS[prefs.preset]
      ? ROUTE_PRESETS[prefs.preset]
      : prefs;
  const out: Record<string, string> = {};
  for (const key of ['simple', 'medium', 'complex', 'vision', 'image'] as const) {
    const v = String(base[key] || '').trim();
    if (v) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

const fieldClass =
  'mt-1.5 w-full rounded-lg border-0 bg-[var(--account-main)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none ring-1 ring-[var(--line)] transition placeholder:text-[var(--muted)] focus:ring-[var(--ink)]/25';

const selectFieldClass =
  'mt-1.5 w-full !h-10 rounded-lg border-0 bg-[var(--account-main)] px-3 pr-8 text-[14px] text-[var(--ink)] ring-1 ring-[var(--line)]';

function modelOptions(models: LlmModel[], kind: 'text' | 'image'): { id: string; label: string }[] {
  return models
    .filter((m) => (kind === 'image' ? m.kind === 'image' : m.kind !== 'image'))
    .filter((m) => m.id && m.id !== 'auto')
    .map((m) => ({ id: m.id, label: m.label || m.id }));
}

export default function AgentModelsPanel({ onProvidersChange }: Props): ReactNode {
  const { t } = useTranslation();
  const planId = useSelector((state: any) => (state.wallet?.planId as PlanId) || 'free');
  const isPro = planHasProFeatures(planId);
  const [providers, setProviders] = useState<CustomLlmProvider[]>([]);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState('');
  const [plansOpen, setPlansOpen] = useState(false);
  const [routePrefs, setRoutePrefs] = useState<AgentRoutePrefs>({ preset: 'platform' });
  const [routeSaved, setRouteSaved] = useState(false);
  const [textModels, setTextModels] = useState<LlmModel[]>([]);
  const [imageModels, setImageModels] = useState<LlmModel[]>([]);

  useEffect(() => {
    setProviders(loadCustomLlmProviders());
    setRoutePrefs(loadAgentRoutePrefs());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchLlmModels()
      .then((res) => {
        if (cancelled) return;
        setTextModels(res?.models || []);
        setImageModels(res?.imageModels || []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const persistProviders = (next: CustomLlmProvider[]) => {
    setProviders(next);
    saveCustomLlmProviders(next);
    onProvidersChange?.();
  };

  const applyPreset = (preset: AgentRoutePreset) => {
    if (preset === 'platform') {
      const next = { preset: 'platform' as const };
      setRoutePrefs(next);
      saveAgentRoutePrefs(next);
      setRouteSaved(true);
      return;
    }
    if (preset === 'custom') {
      setRoutePrefs((prev) => ({ ...prev, preset: 'custom' }));
      return;
    }
    const next = { ...ROUTE_PRESETS[preset] };
    setRoutePrefs(next);
    saveAgentRoutePrefs(next);
    setRouteSaved(true);
  };

  const patchRouteField = (key: keyof AgentRoutePrefs, value: string) => {
    setRoutePrefs((prev) => {
      const next: AgentRoutePrefs = { ...prev, preset: 'custom', [key]: value };
      return next;
    });
    setRouteSaved(false);
  };

  const saveRoutePrefs = () => {
    saveAgentRoutePrefs(routePrefs);
    setRouteSaved(true);
  };

  const onSaveProvider = () => {
    if (!isPro) {
      setPlansOpen(true);
      return;
    }
    const n = name.trim();
    const url = baseUrl.trim().replace(/\/+$/, '');
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
    setError('');
    const next: CustomLlmProvider = {
      id: createCustomLlmProviderId(),
      name: n,
      website: website.trim(),
      apiKey: apiKey.trim(),
      baseUrl: url,
      createdAt: Date.now(),
    };
    persistProviders([next, ...providers]);
    setName('');
    setWebsite('');
    setApiKey('');
    setBaseUrl('');
  };

  const onRemove = (id: string) => {
    if (!isPro) {
      setPlansOpen(true);
      return;
    }
    persistProviders(providers.filter((p) => p.id !== id));
  };

  const textOpts = modelOptions(textModels, 'text');
  const imageOpts = modelOptions(imageModels.length ? imageModels : textModels, 'image');
  const showRouteDetail = routePrefs.preset !== 'platform';
  const followPlatformLabel = t('account.agentRouteFollowPlatform');
  const presetOptions = [
    { value: 'platform', label: t('account.agentRoutePresetPlatform') },
    { value: 'economy', label: t('account.agentRoutePresetEconomy') },
    { value: 'balanced', label: t('account.agentRoutePresetBalanced') },
    { value: 'quality', label: t('account.agentRoutePresetQuality') },
    { value: 'custom', label: t('account.agentRoutePresetCustom') },
  ];
  const textSelectOptions = [
    { value: '', label: followPlatformLabel },
    ...textOpts.map((m) => ({ value: m.id, label: m.label })),
  ];
  const imageSelectOptions = [
    { value: '', label: followPlatformLabel },
    ...imageOpts.map((m) => ({ value: m.id, label: m.label })),
  ];

  return (
    <>
      <div className="space-y-5">
        <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
          <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">
            {t('account.agentRouteSection')}
          </h2>
          <p className="mb-5 text-[13px] leading-relaxed text-[var(--muted)]">
            {t('account.agentRouteHint')}
          </p>

          <div className="mb-4">
            <span className="text-[13px] font-medium text-[var(--ink)]">
              {t('account.agentRoutePreset')}
            </span>
            <Select
              size="large"
              className={selectFieldClass}
              value={routePrefs.preset === 'custom' ? 'custom' : routePrefs.preset}
              options={presetOptions}
              onChange={(v) => applyPreset(String(v) as AgentRoutePreset)}
            />
          </div>

          {showRouteDetail ? (
            <div className="space-y-4">
              {(
                [
                  ['simple', t('account.agentRouteSimple')],
                  ['medium', t('account.agentRouteMedium')],
                  ['complex', t('account.agentRouteComplex')],
                  ['vision', t('account.agentRouteVision')],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <span className="text-[13px] font-medium text-[var(--ink)]">{label}</span>
                  <Select
                    size="large"
                    className={selectFieldClass}
                    value={routePrefs[key] || ''}
                    options={textSelectOptions}
                    onChange={(v) => patchRouteField(key, String(v))}
                  />
                </div>
              ))}
              <div>
                <span className="text-[13px] font-medium text-[var(--ink)]">
                  {t('account.agentRouteImage')}
                </span>
                <Select
                  size="large"
                  className={selectFieldClass}
                  value={routePrefs.image || ''}
                  options={imageSelectOptions}
                  onChange={(v) => patchRouteField('image', String(v))}
                />
              </div>
              <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                {t('account.agentRouteCostNote')}
              </p>
              {routePrefs.preset === 'custom' ? (
                <div className="flex justify-end border-t border-[var(--line)] pt-4">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-full bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--on-brand)] hover:opacity-90"
                    onClick={saveRoutePrefs}
                  >
                    {routeSaved ? t('account.agentRouteSaved') : t('account.agentRouteSave')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-[var(--muted)]">
              {t('account.agentRoutePlatformNote')}
            </p>
          )}
        </section>

        <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
          <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">
            {t('account.agentModelsSection')}
          </h2>
          <p className="mb-5 text-[13px] leading-relaxed text-[var(--muted)]">
            {t('agent.settingsHint')}
          </p>

          {!isPro ? (
            <div className="mb-5 rounded-lg bg-[var(--account-main)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink)] ring-1 ring-[var(--line)]">
              <p className="font-medium">{t('agent.providerProRequired')}</p>
              <p className="mt-1 text-[var(--muted)]">{t('agent.providerProHint')}</p>
              <button
                type="button"
                className="mt-2 text-[13px] font-medium text-[var(--ink)] underline underline-offset-2"
                onClick={() => setPlansOpen(true)}
              >
                {t('agent.providerUpgrade')}
              </button>
            </div>
          ) : null}

          <fieldset disabled={!isPro} className={cn(!isPro && 'opacity-50')}>
            <label className="mb-4 block">
              <span className="text-[13px] font-medium text-[var(--ink)]">{t('agent.providerName')}</span>
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('agent.providerNamePh')}
                autoComplete="off"
              />
            </label>

            <label className="mb-4 block">
              <span className="text-[13px] font-medium text-[var(--ink)]">{t('agent.providerWebsite')}</span>
              <input
                className={fieldClass}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://"
                autoComplete="off"
              />
            </label>

            <label className="mb-4 block">
              <span className="text-[13px] font-medium text-[var(--ink)]">API Key</span>
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

            <label className="mb-4 block">
              <span className="text-[13px] font-medium text-[var(--ink)]">{t('agent.providerBaseUrl')}</span>
              <input
                className={fieldClass}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com"
                autoComplete="off"
              />
              <span className="mt-1.5 block rounded-lg bg-[#FFF8E6] px-2.5 py-2 text-[12px] leading-relaxed text-[#8A6D1D] dark:bg-[#3A3218] dark:text-[#E8D48A]">
                {t('agent.providerBaseUrlHint')}
              </span>
            </label>
          </fieldset>

          {error ? <p className="mb-3 text-[13px] text-red-500">{error}</p> : null}

          <div className="flex justify-end border-t border-[var(--line)] pt-5">
            <button
              type="button"
              disabled={!isPro}
              className="inline-flex h-9 items-center rounded-full bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--on-brand)] hover:opacity-90 disabled:opacity-50"
              onClick={onSaveProvider}
            >
              {isPro ? t('agent.providerSave') : t('agent.providerSavePro')}
            </button>
          </div>
        </section>

        {providers.length ? (
          <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
            <h2 className="mb-4 text-[15px] font-semibold text-[var(--ink)]">
              {t('agent.providerSaved')}
            </h2>
            <ul className="flex flex-col gap-2">
              {providers.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-[var(--account-main)] px-3 py-2.5 ring-1 ring-[var(--line)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-[var(--ink)]">{p.name}</div>
                    <div className="truncate text-[12px] text-[var(--muted)]">{p.baseUrl}</div>
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

      <PlansDialog open={plansOpen} onClose={() => setPlansOpen(false)} />
    </>
  );
}
