/**
 * Card-key pricing: CNY price → app Tokens.
 *
 * Anchored to DeepSeek-class chat API cost (~¥1–2 / 1M tokens).
 * 1 app Token ≈ 1 API token for chat; Seedream images cost more, so we
 * leave a small cushion and still pass most value to the buyer.
 *
 * Default: ¥1 → 400_000 Tokens (near cost, thin margin — not meant to profit hard).
 */

/** App Tokens granted per 1 CNY at list price. */
export const TOKENS_PER_CNY = 400_000;

/** Reference API cost used in the hover explainer (tokens per ¥1 at ~¥2/M). */
export const TOKENS_PER_CNY_AT_COST = 500_000;

export function tokensFromPriceCny(priceCny: number): number {
  if (!Number.isFinite(priceCny) || priceCny <= 0) return 0;
  return Math.max(1, Math.round(priceCny * TOKENS_PER_CNY));
}

export function formatPriceInput(raw: string): string {
  // Allow digits + one decimal point (Xianyu-style 9.9 / 19.9)
  const cleaned = raw.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
}
