/**
 * Wallet display / catalog helpers — not Redux state.
 * Balance mutations live in `@/store/modules/wallet`.
 */

export type PayMethod = 'wechat' | 'alipay' | 'card';

/** free → plus → pro → ultra (4 monthly tiers; no annual). */
export type PlanId = 'free' | 'plus' | 'pro' | 'ultra';

export type LedgerKind = 'redeem' | 'spend' | 'recharge' | 'plan';

export type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  /** Wallet token units. */
  amount: number;
  method?: PayMethod;
  model?: string;
  detail?: string;
  /** Optional LLM usage metadata (not balance). */
  tokens?: number;
  usageTokens?: number;
  planId?: PlanId;
  balanceAfter: number;
  createdAt: number;
};

export type PlanDef = {
  id: PlanId;
  /** Monthly list price in CNY (0 = free). */
  priceCny: number;
  /** Tokens granted each billing month. */
  creditsIncluded: number;
  /** Highlight on the plans picker. */
  recommended?: boolean;
};

export const PLAN_CATALOG: Record<PlanId, PlanDef> = {
  free: { id: 'free', priceCny: 0, creditsIncluded: 30 },
  plus: { id: 'plus', priceCny: 29, creditsIncluded: 400, recommended: true },
  pro: { id: 'pro', priceCny: 99, creditsIncluded: 1000 },
  ultra: { id: 'ultra', priceCny: 199, creditsIncluded: 2200 },
};

export const PLAN_ORDER: PlanId[] = ['free', 'plus', 'pro', 'ultra'];

/** Map legacy ids → current catalog. */
export function normalizePlanId(raw: unknown): PlanId {
  if (raw === 'free' || raw === 'plus' || raw === 'pro' || raw === 'ultra') return raw;
  if (raw === 'hobby') return 'free';
  if (raw === 'basic') return 'plus';
  if (raw === 'pro_plus' || raw === 'teams' || raw === 'flagship') return 'ultra';
  return 'free';
}

/** Paid plans that unlock Pro-only settings (custom LLM, etc.). */
export function planHasProFeatures(id: PlanId): boolean {
  return id === 'pro' || id === 'ultra';
}

export function formatTokens(n: number, opts?: { compact?: boolean }) {
  const v = Number.isFinite(n) ? n : 0;
  if (opts?.compact && v >= 1000) return `${Math.round(v / 1000)}k`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Alias — PlansDialog / Billing use formatCredits. */
export const formatCredits = formatTokens;

export function planLabelKey(id: PlanId) {
  return `wallet.plan.${id}` as const;
}
