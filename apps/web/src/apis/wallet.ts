/**
 * Wallet API — card-key redeem for tokens.
 */

import { request } from '@/utils/request';

export type WalletLedgerDto = {
  id: string;
  kind: 'redeem' | 'spend';
  amount: number;
  balanceAfter: number;
  detail?: string;
  createdAt: number;
};

export type WalletDto = {
  tokens: number;
  ledger: WalletLedgerDto[];
};

export type PurchaseInfoDto = {
  xianyuUrl?: string | null;
  authorContact?: string | null;
  xianyuQrUrl?: string | null;
  wechatQrUrl?: string | null;
  hint?: string;
};

export type RedeemResultDto = {
  tokensAdded: number;
  tokens: number;
  ledger: WalletLedgerDto[];
};

export const fetchPurchaseInfo = () =>
  request<PurchaseInfoDto>({
    url: '/api/v1/wallet/purchase-info',
    method: 'get',
  });

export const fetchWallet = () =>
  request<WalletDto>({
    url: '/api/v1/wallet',
    method: 'get',
  });

export type WalletLedgerKindFilter = 'all' | 'redeem' | 'spend';

export type PaginatedWalletLedger = {
  tokens: number;
  items: WalletLedgerDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  kind: WalletLedgerKindFilter | string;
};

/** Usage & billing tabs → kind=all|redeem|spend */
export const fetchWalletLedger = (opts: {
  page?: number;
  pageSize?: number;
  kind?: WalletLedgerKindFilter;
} = {}) =>
  request<PaginatedWalletLedger>({
    url: '/api/v1/wallet/ledger',
    method: 'get',
    params: {
      page: opts.page ?? 1,
      pageSize: opts.pageSize ?? 15,
      kind: opts.kind ?? 'all',
    },
  });

export const redeemCardKey = (code: string) =>
  request<RedeemResultDto>({
    url: '/api/v1/wallet/redeem',
    method: 'post',
    data: { code },
  });
