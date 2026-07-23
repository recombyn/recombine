import { useEffect, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaWeixin } from 'react-icons/fa';
import { Button, Dialog, Input, message } from '@/components/base';
import { fetchPurchaseInfo, redeemCardKey, type PurchaseInfoDto } from '@/apis/wallet';
import type { LedgerEntry } from '@/utils/wallet';
import { syncFromServer } from '@/store/modules/wallet';
import { cn } from '@/utils/classnames';
import { buildLoginUrl } from '@/utils/authReturnTo';
import xianyuIcon from '@/assets/channels/xianyu.webp';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful redeem so the parent can refresh the ledger. */
  onRedeemed?: () => void;
};

function QrHoverIcon({
  label,
  tip,
  qrSrc,
  onClick,
  children,
}: {
  label: string;
  tip: string;
  qrSrc: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="group relative flex flex-col items-center">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className={cn(
          'inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface)]',
          'ring-1 ring-[var(--line)] transition hover:ring-[var(--ink)]/25 hover:shadow-sm'
        )}
      >
        {children}
      </button>
      {/* Hover: QR above icon */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-20 w-[160px] -translate-x-1/2',
          'rounded-xl bg-[var(--surface)] p-2 opacity-0 shadow-[0_12px_32px_rgba(12,12,13,0.18)] ring-1 ring-[var(--line)]',
          'transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100'
        )}
        role="tooltip"
      >
        <img
          src={qrSrc}
          alt={tip}
          className="h-[144px] w-[144px] rounded-lg bg-white object-cover"
          draggable={false}
        />
        <span
          className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-[var(--surface)]"
          aria-hidden
        />
      </div>
    </div>
  );
}

/** Card-key redeem dialog — Xianyu / WeChat QR icons (no WeChat Pay / Alipay). */
export default function RedeemDialog({ open, onClose, onRedeemed }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state: any) => state.auth.user);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<PurchaseInfoDto | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode('');
    void fetchPurchaseInfo()
      .then((res) => setInfo(res || null))
      .catch(() => setInfo(null));
  }, [open]);

  const submit = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      message.error(t('wallet.invalidCardKey'));
      return;
    }
    if (!user) {
      onClose();
      navigate(buildLoginUrl('/home'));
      return;
    }
    setBusy(true);
    try {
      const res = await redeemCardKey(trimmed);
      const ledger = (res.ledger || []) as LedgerEntry[];
      dispatch(syncFromServer({ tokens: res.tokens, ledger }));
      message.success(t('wallet.redeemSuccess', { amount: res.tokensAdded }));
      onRedeemed?.();
      onClose();
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        t('wallet.redeemFailed');
      message.error(typeof detail === 'string' ? detail : t('wallet.redeemFailed'));
    } finally {
      setBusy(false);
    }
  };

  const xianyuUrl = (info?.xianyuUrl || '').trim();
  const xianyuQr =
    (info?.xianyuQrUrl || '').trim() ||
    (xianyuUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(xianyuUrl)}`
      : '/qr/xianyu.png');
  const wechatQr = (info?.wechatQrUrl || '').trim() || '/qr/wechat.png';

  const openXianyu = () => {
    if (!xianyuUrl) {
      message.warning(t('wallet.xianyuSoon'));
      return;
    }
    window.open(xianyuUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog
      show={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      width={440}
      title={t('wallet.redeemTitle')}
      titleClassName="!text-[16px] !font-semibold"
      bodyClassName="pt-1"
      className="!w-full !overflow-visible !bg-[var(--surface)] !p-6"
      footer={
        <>
          <Button size="small" type="default" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="small" type="primary" loading={busy} disabled={busy} onClick={() => void submit()}>
            {t('wallet.redeemNow')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] leading-relaxed text-[var(--muted)]">
        {t('wallet.redeemHint')}
      </p>

      <div className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">{t('wallet.cardKey')}</div>
      <Input
        value={code}
        onChange={(e: any) => setCode(String(e.target.value || '').toUpperCase())}
        placeholder="XXXXX-XXXXX"
        className="!h-10 !font-mono !tracking-wider"
        onKeyDown={(e: any) => {
          if (e.key === 'Enter') void submit();
        }}
      />

      <div className="mt-5 overflow-visible rounded-xl bg-[var(--canvas)] px-3 pb-4 pt-3 ring-1 ring-[var(--line)]">
        <div className="text-center text-[12px] font-medium text-[var(--ink)]">
          {t('wallet.buyCardKey')}
        </div>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-[var(--muted)]">
          {t('wallet.buyCardKeyHint')}
        </p>
        <div className="mt-4 flex items-center justify-center gap-10 overflow-visible pt-1">
          <QrHoverIcon
            label={t('wallet.channelXianyu')}
            tip={t('wallet.scanXianyu')}
            qrSrc={xianyuQr}
            onClick={openXianyu}
          >
            <img src={xianyuIcon} alt="" className="h-8 w-8 object-contain" draggable={false} />
          </QrHoverIcon>
          <QrHoverIcon
            label={t('wallet.channelWechat')}
            tip={t('wallet.scanWechat')}
            qrSrc={wechatQr}
          >
            <FaWeixin className="h-7 w-7 text-[#07C160]" />
          </QrHoverIcon>
        </div>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--muted)]">
          {t('wallet.buyChannelHint')}
        </p>
      </div>
    </Dialog>
  );
}
