import { useMemo, useState, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheck } from 'react-icons/hi2';
import { SiAlipay, SiWechat } from 'react-icons/si';
import { Button, Dialog, Input, message } from '@/components/base';
import { cn } from '@/utils/classnames';
import { recharge, type PayMethod } from '@/store/modules/wallet';

const PRESETS = [10, 30, 50, 100, 200, 500];

type Props = {
  open: boolean;
  onClose: () => void;
};

/** In-app top-up dialog (local mock WeChat/Alipay).
 * Kept for future restore — current product uses RedeemDialog + Xianyu card keys.
 */
export default function RechargeDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [preset, setPreset] = useState<number | null>(50);
  const [custom, setCustom] = useState('');
  const [method, setMethod] = useState<Extract<PayMethod, 'wechat' | 'alipay'>>('wechat');

  const amount = useMemo(() => {
    if (custom.trim()) {
      const n = Number(custom);
      return Number.isFinite(n) ? n : 0;
    }
    return preset ?? 0;
  }, [custom, preset]);

  const submit = () => {
    if (!Number.isFinite(amount) || amount <= 0) {
      message.error(t('wallet.invalidAmount'));
      return;
    }
    // Local simulation only — real WeChat / Alipay later.
    dispatch(recharge({ amount, method }));
    message.success(t('wallet.rechargeSuccess', { amount: amount.toFixed(2) }));
    onClose();
  };

  const methods: { id: 'wechat' | 'alipay'; label: string; icon: ReactNode }[] = [
    {
      id: 'wechat',
      label: t('wallet.wechat'),
      icon: <SiWechat className="h-6 w-6 text-[#07c160]" />,
    },
    {
      id: 'alipay',
      label: t('wallet.alipay'),
      icon: <SiAlipay className="h-6 w-6 text-[#1677ff]" />,
    },
  ];

  return (
    <Dialog
      show={open}
      onClose={onClose}
      width={440}
      title={t('wallet.rechargeTitle')}
      titleClassName="!text-[16px] !font-semibold"
      bodyClassName="pt-1"
      className="!w-full !bg-[var(--surface)] !p-6"
      footer={
        <>
          <Button size="small" type="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="small" type="primary" onClick={submit}>
            {t('wallet.payNow')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] leading-relaxed text-[var(--muted)]">{t('wallet.rechargeHint')}</p>

      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((n) => {
          const active = !custom.trim() && preset === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => {
                setPreset(n);
                setCustom('');
              }}
              className={cn(
                'rounded-lg px-2 py-2.5 text-[13px] font-medium tabular-nums transition',
                active
                  ? 'bg-[var(--accent-soft)] text-[var(--ink)] ring-1 ring-[var(--accent)]'
                  : 'bg-[var(--canvas)] text-[var(--ink)] ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)]'
              )}
            >
              ¥{n}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">{t('wallet.customAmount')}</div>
        <Input
          value={custom}
          onChange={(e: any) => {
            setCustom(e.target.value);
            setPreset(null);
          }}
          placeholder={`¥ ${t('wallet.customPlaceholder')}`}
          className="!h-10"
        />
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[12px] font-medium text-[var(--ink)]">{t('wallet.payMethod')}</div>
        <div className="grid grid-cols-2 gap-2">
          {methods.map((m) => {
            const active = method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={cn(
                  'relative flex items-center gap-2.5 rounded-xl px-3 py-3 text-left transition',
                  active
                    ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
                    : 'bg-[var(--canvas)] ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)]'
                )}
              >
                {m.icon}
                <span className="text-[13px] font-medium text-[var(--ink)]">{m.label}</span>
                {active ? (
                  <span className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-brand)]">
                    <HiOutlineCheck className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
