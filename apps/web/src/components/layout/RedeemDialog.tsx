import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, Input, message } from '@/components/base';
import { redeemCardKey } from '@/apis/wallet';
import { normalizePlanId, type LedgerEntry, type PlanId } from '@/utils/wallet';
import { syncFromServer } from '@/store/modules/wallet';
import { buildLoginUrl } from '@/utils/authReturnTo';

type RedeemPanelProps = {
  active?: boolean;
  onRedeemed?: () => void;
  /** When set, show cancel that calls this (dialog mode). */
  onCancel?: () => void;
};

/** Redeem form — usable inside settings modal or standalone dialog. */
export function RedeemPanel({ active = true, onRedeemed, onCancel }: RedeemPanelProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state: any) => state.auth.user);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (active) setCode('');
  }, [active]);

  const submit = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      message.error(t('wallet.invalidCardKey'));
      return;
    }
    if (!user) {
      onCancel?.();
      navigate(buildLoginUrl('/home'));
      return;
    }
    setBusy(true);
    try {
      const res = await redeemCardKey(trimmed);
      const ledger = (res.ledger || []) as LedgerEntry[];
      const planId = normalizePlanId(res.planId) as PlanId;
      dispatch(
        syncFromServer({
          tokens: res.tokens,
          ledger,
          planId,
          planExpiresAt: res.planExpiresAt ?? null,
          planLocked: Boolean(res.planLocked),
        })
      );
      if (res.kind === 'plan') {
        message.success(
          t('wallet.redeemPlanSuccess', {
            plan: t(`wallet.plan.${planId}`),
            amount: res.tokensAdded,
          })
        );
      } else {
        message.success(t('wallet.redeemSuccess', { amount: res.tokensAdded }));
      }
      onRedeemed?.();
      setCode('');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const code =
        detail && typeof detail === 'object' ? String((detail as any).code || '') : '';
      if (code === 'plan_locked') {
        message.error(t('wallet.planLockedRedeem'));
      } else if (code === 'rate_limited' || err?.response?.status === 429) {
        message.error(t('wallet.redeemRateLimited'));
      } else {
        const msg =
          typeof detail === 'string'
            ? detail
            : detail && typeof detail === 'object' && (detail as any).message
              ? String((detail as any).message)
              : err?.message || t('wallet.redeemFailed');
        message.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md">
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
        {t('wallet.redeemHint')}
      </p>
      <div className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">{t('wallet.cardKey')}</div>
      <Input
        value={code}
        onChange={(e: any) => setCode(String(e.target.value || '').toUpperCase())}
        placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
        className="!h-11 !rounded-xl !font-mono !tracking-wider"
        onKeyDown={(e: any) => {
          if (e.key === 'Enter') void submit();
        }}
      />
      <div className="mt-5 flex items-center justify-start gap-2">
        {onCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-[12px] font-medium text-[var(--ink)] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-xl bg-[var(--ink)] px-3 py-2 text-[12px] font-medium text-[var(--on-brand)] transition hover:opacity-90 disabled:opacity-50"
        >
          {t('wallet.redeemNow')}
        </button>
      </div>
    </div>
  );
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  onRedeemed?: () => void;
};

/** Standalone redeem dialog (legacy callers). Prefer AccountSettingsDialog. */
export default function RedeemDialog({ open, onClose, onRedeemed }: DialogProps) {
  const { t } = useTranslation();
  const dismiss = () => {
    // Blur before hide — cancel/redeem call parent setState and skip Dialog.onClose blur.
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    onClose();
  };
  return (
    <Dialog
      show={open}
      onClose={dismiss}
      width={440}
      title={t('wallet.redeemTitle')}
      titleClassName="!text-[16px] !font-semibold"
      bodyClassName="pt-1"
      className="!w-full !bg-[var(--surface)] !p-6"
    >
      <RedeemPanel
        active={open}
        onCancel={dismiss}
        onRedeemed={() => {
          onRedeemed?.();
          dismiss();
        }}
      />
    </Dialog>
  );
}
