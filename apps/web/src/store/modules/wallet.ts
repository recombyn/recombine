import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const STORAGE_KEY = 'resume-scene-wallet-v3';
const LEGACY_V2 = 'resume-scene-wallet-v2';

/**
 * Active product: prepaid Tokens via card-key redeem (no WeChat/Alipay).
 * Legacy membership / mock recharge kept below so PlansDialog & RechargeDialog
 * still compile and can be wired back later.
 */

export type PayMethod = 'wechat' | 'alipay' | 'card';

export type PlanId = 'hobby' | 'pro' | 'pro_plus' | 'ultra' | 'teams';

export type LedgerKind = 'redeem' | 'spend' | 'recharge' | 'plan';

export type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  /** Token / credit units. */
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
  priceUsd: number;
  priceAnnualUsd?: number;
  creditsIncluded: number;
  perSeat?: boolean;
};

/** @deprecated Membership catalog — kept for PlansDialog / future restore. */
export const PLAN_CATALOG: Record<PlanId, PlanDef> = {
  hobby: { id: 'hobby', priceUsd: 0, creditsIncluded: 2 },
  pro: { id: 'pro', priceUsd: 20, priceAnnualUsd: 16, creditsIncluded: 20 },
  pro_plus: { id: 'pro_plus', priceUsd: 60, creditsIncluded: 70 },
  ultra: { id: 'ultra', priceUsd: 200, creditsIncluded: 400 },
  teams: { id: 'teams', priceUsd: 40, creditsIncluded: 40, perSeat: true },
};

/** @deprecated Kept for PlansDialog. */
export const PLAN_ORDER: PlanId[] = ['hobby', 'pro', 'pro_plus', 'ultra', 'teams'];

type WalletState = {
  /** Prepaid Token balance (card-key redeem — active path). */
  tokens: number;
  ledger: LedgerEntry[];
  /**
   * Legacy membership fields (PlansDialog / RechargeDialog).
   * `credits` mirrors `tokens` so old UI still reads a balance.
   */
  planId: PlanId;
  credits: number;
  creditsIncluded: number;
  demoUsageSeeded?: boolean;
};

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function roundTokens(n: number) {
  return Math.max(0, Math.round(Number(n) || 0));
}

function syncCreditsAlias(state: WalletState) {
  state.credits = state.tokens;
}

function defaultState(): WalletState {
  return {
    tokens: 0,
    ledger: [],
    planId: 'hobby',
    credits: 0,
    creditsIncluded: PLAN_CATALOG.hobby.creditsIncluded,
    demoUsageSeeded: true,
  };
}

function persist(state: WalletState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tokens: state.tokens,
        ledger: state.ledger.slice(0, 200),
        planId: state.planId,
        credits: state.credits,
        creditsIncluded: state.creditsIncluded,
        demoUsageSeeded: state.demoUsageSeeded ?? true,
      })
    );
  } catch {
    /* ignore quota */
  }
}

function loadWallet(): WalletState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const tokens = roundTokens(parsed?.tokens ?? parsed?.credits ?? 0);
      const planId = (PLAN_CATALOG[parsed?.planId as PlanId] ? parsed.planId : 'hobby') as PlanId;
      const ledger = Array.isArray(parsed?.ledger)
        ? (parsed.ledger as LedgerEntry[]).filter(
            (e) => e && typeof e.id === 'string' && typeof e.amount === 'number'
          )
        : [];
      return {
        tokens,
        ledger,
        planId,
        credits: tokens,
        creditsIncluded: Number(parsed?.creditsIncluded) || PLAN_CATALOG[planId].creditsIncluded,
        demoUsageSeeded: Boolean(parsed?.demoUsageSeeded ?? true),
      };
    }

    const legacy = localStorage.getItem(LEGACY_V2);
    if (legacy) {
      try {
        const old = JSON.parse(legacy);
        const credits = Number(old?.credits ?? old?.balance);
        const tokens = Number.isFinite(credits) && credits > 0 ? roundTokens(credits) : 0;
        const planId = (PLAN_CATALOG[old?.planId as PlanId] ? old.planId : 'hobby') as PlanId;
        const next: WalletState = {
          tokens,
          ledger: [],
          planId,
          credits: tokens,
          creditsIncluded: Number(old?.creditsIncluded) || PLAN_CATALOG[planId].creditsIncluded,
          demoUsageSeeded: Boolean(old?.demoUsageSeeded ?? true),
        };
        persist(next);
        return next;
      } catch {
        /* fall through */
      }
    }
    return defaultState();
  } catch {
    return defaultState();
  }
}

export function formatTokens(n: number, opts?: { compact?: boolean }) {
  const v = Number.isFinite(n) ? n : 0;
  if (opts?.compact && v >= 1000) return `${Math.round(v / 1000)}k`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Alias — legacy PlansDialog / Billing used formatCredits. */
export const formatCredits = formatTokens;

export function planLabelKey(id: PlanId) {
  return `wallet.plan.${id}` as const;
}

const walletSlice = createSlice({
  name: 'wallet',
  initialState: loadWallet(),
  reducers: {
    /** Replace local state from authenticated API (card-key wallet). */
    syncFromServer(
      state,
      action: PayloadAction<{ tokens: number; ledger?: LedgerEntry[] }>
    ) {
      state.tokens = roundTokens(action.payload.tokens);
      syncCreditsAlias(state);
      if (Array.isArray(action.payload.ledger)) {
        state.ledger = action.payload.ledger;
      }
      persist(state);
    },
    /** Optimistic / local redeem row (prefer syncFromServer after API). */
    applyRedeem(state, action: PayloadAction<{ amount: number; detail?: string }>) {
      const amount = roundTokens(action.payload.amount);
      if (amount <= 0) return;
      state.tokens = roundTokens(state.tokens + amount);
      syncCreditsAlias(state);
      state.ledger.unshift({
        id: newId(),
        kind: 'redeem',
        amount,
        detail: action.payload.detail || '卡密兑换',
        balanceAfter: state.tokens,
        createdAt: Date.now(),
      });
      persist(state);
    },
    /** Deduct Tokens for AI usage. */
    spend(
      state,
      action: PayloadAction<{
        amount: number;
        model?: string;
        detail?: string;
        tokens?: number;
        usageTokens?: number;
      }>
    ) {
      const amount = roundTokens(action.payload.amount);
      if (amount <= 0) return;
      if (state.tokens < amount) return;
      state.tokens = roundTokens(state.tokens - amount);
      syncCreditsAlias(state);
      state.ledger.unshift({
        id: newId(),
        kind: 'spend',
        amount,
        model: action.payload.model,
        detail: action.payload.detail,
        tokens: action.payload.tokens,
        usageTokens: action.payload.usageTokens ?? action.payload.tokens,
        balanceAfter: state.tokens,
        createdAt: Date.now(),
      });
      persist(state);
    },
    clearWallet(state) {
      state.tokens = 0;
      syncCreditsAlias(state);
      state.ledger = [];
      persist(state);
    },

    // ── Legacy (kept for RechargeDialog / PlansDialog; not used by current UI) ──

    /** @deprecated Mock WeChat/Alipay top-up — kept for RechargeDialog. */
    recharge(state, action: PayloadAction<{ amount: number; method: PayMethod }>) {
      const amount = roundTokens(Number(action.payload.amount));
      if (!Number.isFinite(amount) || amount <= 0) return;
      state.tokens = roundTokens(state.tokens + amount);
      syncCreditsAlias(state);
      state.ledger.unshift({
        id: newId(),
        kind: 'recharge',
        amount,
        method: action.payload.method,
        detail: '积分充值',
        balanceAfter: state.tokens,
        createdAt: Date.now(),
      });
      persist(state);
    },
    /** @deprecated Membership switch — kept for PlansDialog. */
    setPlan(state, action: PayloadAction<{ planId: PlanId; refreshCredits?: boolean }>) {
      const planId = action.payload.planId;
      const def = PLAN_CATALOG[planId];
      if (!def) return;
      const prev = state.planId;
      state.planId = planId;
      state.creditsIncluded = def.creditsIncluded;
      if (action.payload.refreshCredits !== false) {
        state.tokens = roundTokens(def.creditsIncluded);
        syncCreditsAlias(state);
      }
      state.ledger.unshift({
        id: newId(),
        kind: 'plan',
        amount: def.creditsIncluded,
        planId,
        detail: `订阅变更 ${prev} → ${planId}`,
        balanceAfter: state.tokens,
        createdAt: Date.now(),
      });
      persist(state);
    },
  },
});

export const {
  syncFromServer,
  applyRedeem,
  spend,
  clearWallet,
  recharge,
  setPlan,
} = walletSlice.actions;

export default walletSlice.reducer;
