/**
 * Wallet API — card-key redeem (Token or plan).
 */

import { request } from '@/utils/request';
import type { PlanId } from '@/utils/wallet';

export type WalletLedgerDto = {
  id: string;
  kind: 'redeem' | 'spend' | 'plan' | 'recharge';
  amount: number;
  balanceAfter: number;
  detail?: string;
  createdAt: number;
};

export type WalletDto = {
  tokens: number;
  planId?: PlanId | string;
  /** Unix seconds; null when free / unset. */
  planExpiresAt?: number | null;
  /** True while a paid plan is still within its term. */
  planLocked?: boolean;
  /** Platform credit billing (WALLET_BILLING_ENABLED); false on self-host / local. */
  billingEnabled?: boolean;
  ledger: WalletLedgerDto[];
};


export type RedeemResultDto = {
  kind?: 'token' | 'plan' | string;
  tokensAdded: number;
  tokens: number;
  planId?: PlanId | string;
  planExpiresAt?: number | null;
  planLocked?: boolean;
  ledger: WalletLedgerDto[];
};

export const fetchWallet = () =>
  request<WalletDto>({
    url: '/api/v1/wallet',
    method: 'get',
  });

export type WalletLedgerKindFilter = 'all' | 'redeem' | 'spend';

export type PaginatedWalletLedger = {
  tokens: number;
  planId?: PlanId | string;
  planExpiresAt?: number | null;
  planLocked?: boolean;
  items: WalletLedgerDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  kind: WalletLedgerKindFilter | string;
};

/** Usage & billing tabs → kind=all|redeem|spend */
export const fetchWalletLedger = (params: {
  page: number;
  pageSize: number;
  kind: WalletLedgerKindFilter;
}) =>
  request<PaginatedWalletLedger>({
    url: '/api/v1/wallet/ledger',
    method: 'get',
    params,
  });

export const redeemCardKey = (code: string) =>
  request<RedeemResultDto>({
    url: '/api/v1/wallet/redeem',
    method: 'post',
    data: { code },
  });
