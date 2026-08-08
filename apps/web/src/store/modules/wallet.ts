import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  PLAN_CATALOG,
  normalizePlanId,
  type LedgerEntry,
  type PayMethod,
  type PlanId,
} from '@/utils/wallet';

const STORAGE_KEY = 'resume-scene-wallet-v3';
const LEGACY_V2 = 'resume-scene-wallet-v2';

/**
 * Redux: prepaid token balance + ledger.
 * Display helpers / plan catalog → `@/utils/wallet` (not Redux).
 * Balance field is `tokens`; `credits` mirrors it for older UI.
 */

type WalletState = {
  /** Prepaid token balance (card-key redeem + plan allotment). */
  tokens: number;
  ledger: LedgerEntry[];
  /** Membership plan; `credits` mirrors `tokens` for older UI. */
  planId: PlanId;
  /** Paid plan end (unix seconds); null when free / unset. */
  planExpiresAt: number | null;
  /** True while paid plan term is still active — block plan switches. */
  planLocked: boolean;
  /** From API ``billingEnabled`` — hide credit UI when false. */
  billingEnabled: boolean;
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
    planId: 'free',
    planExpiresAt: null,
    planLocked: false,
    // Default off until /auth/config or /wallet says true (Cloud).
    billingEnabled: false,
    credits: 0,
    creditsIncluded: PLAN_CATALOG.free.creditsIncluded,
    demoUsageSeeded: true,
  };
}


function normalizeExpiresAt(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function persist(state: WalletState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tokens: state.tokens,
        ledger: state.ledger.slice(0, 200),
        planId: state.planId,
        planExpiresAt: state.planExpiresAt,
        planLocked: state.planLocked,
        billingEnabled: state.billingEnabled,
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
      const planId = normalizePlanId(parsed?.planId);
      const ledger = Array.isArray(parsed?.ledger)
        ? (parsed.ledger as LedgerEntry[]).filter(
            (e) => e && typeof e.id === 'string' && typeof e.amount === 'number'
          )
        : [];
      const planExpiresAt = normalizeExpiresAt(parsed?.planExpiresAt);
      const planLocked = Boolean(parsed?.planLocked) && planId !== 'free';
      return {
        tokens,
        ledger,
        planId,
        planExpiresAt,
        planLocked,
        billingEnabled: parsed?.billingEnabled === true,
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
        const planId = normalizePlanId(old?.planId);
        const next: WalletState = {
          tokens,
          ledger: [],
          planId,
          planExpiresAt: null,
          planLocked: false,
          billingEnabled: false,
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

const walletSlice = createSlice({
  name: 'wallet',
  initialState: loadWallet(),
  reducers: {
    /** Replace local state from authenticated API (card-key wallet). */
    syncFromServer(
      state,
      action: PayloadAction<{
        tokens: number;
        ledger?: LedgerEntry[];
        planId?: PlanId | string;
        planExpiresAt?: number | null;
        planLocked?: boolean;
        billingEnabled?: boolean;
      }>
    ) {
      state.tokens = roundTokens(action.payload.tokens);
      syncCreditsAlias(state);
      if (Array.isArray(action.payload.ledger)) {
        state.ledger = action.payload.ledger;
      }
      if (action.payload.planId != null) {
        const planId = normalizePlanId(action.payload.planId);
        state.planId = planId;
        state.creditsIncluded = PLAN_CATALOG[planId].creditsIncluded;
      }
      if (action.payload.planExpiresAt !== undefined) {
        state.planExpiresAt = normalizeExpiresAt(action.payload.planExpiresAt);
      }
      if (action.payload.planLocked !== undefined) {
        state.planLocked = Boolean(action.payload.planLocked) && state.planId !== 'free';
      } else if (state.planId === 'free') {
        state.planLocked = false;
      }
      if (action.payload.billingEnabled !== undefined) {
        state.billingEnabled = Boolean(action.payload.billingEnabled);
      }
      persist(state);
    },

    /** From public ``GET /auth/config`` (no login required). */
    setBillingEnabled(state, action: PayloadAction<boolean>) {
      state.billingEnabled = Boolean(action.payload);
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
    /** Deduct tokens for AI usage. */
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
      state.planId = 'free';
      state.planExpiresAt = null;
      state.planLocked = false;
      state.creditsIncluded = PLAN_CATALOG.free.creditsIncluded;
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_V2);
      } catch {
        /* ignore */
      }
    },


    /** Membership switch — blocked while a paid plan term is active. */
    setPlan(state, action: PayloadAction<{ planId: PlanId; refreshCredits?: boolean }>) {
      const planId = action.payload.planId;
      const def = PLAN_CATALOG[planId];
      if (!def) return;
      const prev = state.planId;
      if (state.planLocked && planId !== prev) return;
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
  setBillingEnabled,
  applyRedeem,
  spend,
  clearWallet,
  setPlan,
} = walletSlice.actions;

/** Credits UI only when API reports billing on (default off). */
export function selectBillingEnabled(state: {
  wallet?: { billingEnabled?: boolean };
}): boolean {
  return state.wallet?.billingEnabled === true;
}

export default walletSlice.reducer;
