import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const STORAGE_KEY = 'resume-scene-wallet-v1';

export type PayMethod = 'wechat' | 'alipay' | 'card';

export type LedgerKind = 'recharge' | 'spend';

export type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  amount: number;
  /** Set for recharge */
  method?: PayMethod;
  /** Set for model usage spend */
  model?: string;
  /** Human-readable usage label */
  detail?: string;
  /** Optional token count for model calls */
  tokens?: number;
  balanceAfter: number;
  createdAt: number;
};

type WalletState = {
  /** Balance in CNY (元) */
  balance: number;
  /** Newest first */
  ledger: LedgerEntry[];
  /** One-time mock usage rows so billing is not recharge-only */
  demoUsageSeeded?: boolean;
};

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEMO_USAGE: Array<{
  amount: number;
  model: string;
  detail: string;
  tokens: number;
  hoursAgo: number;
}> = [
  {
    amount: 0.18,
    model: 'gpt-4o-mini',
    detail: '简历文案润色',
    tokens: 2140,
    hoursAgo: 3,
  },
  {
    amount: 0.42,
    model: 'claude-sonnet-4',
    detail: '布局与排版建议',
    tokens: 3680,
    hoursAgo: 28,
  },
  {
    amount: 0.09,
    model: 'gpt-4o-mini',
    detail: '关键词优化',
    tokens: 960,
    hoursAgo: 50,
  },
];

function applyDemoUsage(state: WalletState): WalletState {
  if (state.demoUsageSeeded) return state;
  if (state.ledger.some((e) => e.kind === 'spend')) {
    return { ...state, demoUsageSeeded: true };
  }

  const total = DEMO_USAGE.reduce((s, d) => s + d.amount, 0);
  // Only auto-seed when balance can cover demo spends (avoid surprise overdraft)
  if (state.balance < total) {
    return { ...state, demoUsageSeeded: true };
  }

  let balance = state.balance;
  const spends: LedgerEntry[] = [];
  // Oldest first while deducting, then reverse to newest-first for ledger head
  const ordered = [...DEMO_USAGE].sort((a, b) => b.hoursAgo - a.hoursAgo);
  for (const d of ordered) {
    balance = Math.round((balance - d.amount) * 100) / 100;
    spends.push({
      id: newId(),
      kind: 'spend',
      amount: d.amount,
      model: d.model,
      detail: d.detail,
      tokens: d.tokens,
      balanceAfter: balance,
      createdAt: Date.now() - d.hoursAgo * 3600 * 1000,
    });
  }

  return {
    balance,
    ledger: [...spends.reverse(), ...state.ledger],
    demoUsageSeeded: true,
  };
}

function loadWallet(): WalletState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const empty = { balance: 0, ledger: [], demoUsageSeeded: true };
      return empty;
    }
    const parsed = JSON.parse(raw);
    const balance = Number(parsed?.balance);
    const ledger = Array.isArray(parsed?.ledger)
      ? (parsed.ledger as LedgerEntry[]).filter(
          (e) => e && typeof e.id === 'string' && typeof e.amount === 'number'
        )
      : [];
    const base: WalletState = {
      balance: Number.isFinite(balance) && balance >= 0 ? balance : 0,
      ledger,
      demoUsageSeeded: Boolean(parsed?.demoUsageSeeded),
    };
    const next = applyDemoUsage(base);
    if (next !== base) persist(next);
    return next;
  } catch {
    return { balance: 0, ledger: [], demoUsageSeeded: true };
  }
}

function persist(state: WalletState) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      balance: state.balance,
      ledger: state.ledger.slice(0, 200),
      demoUsageSeeded: state.demoUsageSeeded ?? true,
    })
  );
}

const walletSlice = createSlice({
  name: 'wallet',
  initialState: loadWallet(),
  reducers: {
    /** Mock top-up — prepare for WeChat / Alipay + LLM billing later */
    recharge(
      state,
      action: PayloadAction<{ amount: number; method: PayMethod }>
    ) {
      const amount = Math.round(Number(action.payload.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) return;
      state.balance = Math.round((state.balance + amount) * 100) / 100;
      state.ledger.unshift({
        id: newId(),
        kind: 'recharge',
        amount,
        method: action.payload.method,
        balanceAfter: state.balance,
        createdAt: Date.now(),
      });
      persist(state);
    },
    /**
     * Deduct for AI model usage.
     * Call from future LLM pipelines: dispatch(spend({ amount, model, detail, tokens }))
     */
    spend(
      state,
      action: PayloadAction<{
        amount: number;
        model?: string;
        detail?: string;
        tokens?: number;
      }>
    ) {
      const amount = Math.round(Number(action.payload.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) return;
      if (state.balance < amount) return;
      state.balance = Math.round((state.balance - amount) * 100) / 100;
      state.ledger.unshift({
        id: newId(),
        kind: 'spend',
        amount,
        model: action.payload.model,
        detail: action.payload.detail,
        tokens: action.payload.tokens,
        balanceAfter: state.balance,
        createdAt: Date.now(),
      });
      persist(state);
    },
  },
});

export const { recharge, spend } = walletSlice.actions;
export default walletSlice.reducer;
