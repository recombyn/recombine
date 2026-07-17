/**
 * Token wallet API — card-key redeem (no WeChat/Alipay).
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

export type AdminCardKeyDto = {
  id: string;
  code?: string | null;
  tokens: number;
  status: 'unused' | 'used' | 'revoked' | string;
  createdAt: number;
  expiresAt?: number | null;
  redeemedAt?: number | null;
};

export type GenerateCardKeysResultDto = {
  count: number;
  tokens: number;
  expiresDays: number;
  keys: AdminCardKeyDto[];
};

export type AdminCardKeysListDto = {
  keys: AdminCardKeyDto[];
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

export const redeemCardKey = (code: string) =>
  request<RedeemResultDto>({
    url: '/api/v1/wallet/redeem',
    method: 'post',
    data: { code },
  });

export const generateCardKeys = (payload: {
  count: number;
  tokens: number;
  expiresDays?: number;
}) =>
  request<GenerateCardKeysResultDto>({
    url: '/api/v1/wallet/admin/generate-keys',
    method: 'post',
    data: payload,
  });

export const fetchAdminCardKeys = (status?: 'unused' | 'used' | 'revoked' | 'all') =>
  request<AdminCardKeysListDto>({
    url: '/api/v1/wallet/admin/keys',
    method: 'get',
    params: status && status !== 'all' ? { status } : undefined,
  });
