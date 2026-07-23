import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlinePencil } from 'react-icons/hi2';
import { updateProfile } from '@/apis/auth';
import { Button, Dialog, message } from '@/components/base';
import { userInitial } from '@/components/layout/UserAccountPanel';
import { setUser, type AuthUser } from '@/store/modules/auth';
import { cn } from '@/utils/classnames';

const NAME_RE = /^[\p{L}\p{N}\s.'\-_]{1,40}$/u;
const MAX_BIO = 200;
const MAX_AVATAR_MB = 2;

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function EditProfileDialog({ open, onClose }: Props): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const user = useSelector((s: any) => s.auth.user as AuthUser | null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(user?.name || '');
    setBio(user?.bio || '');
    setAvatar(user?.avatar || null);
    setSaving(false);
  }, [open, user]);

  const initial = userInitial(name || user?.name, user?.email);

  const onPickAvatar = () => {
    if (saving) return;
    fileRef.current?.click();
  };

  const onAvatarFile = (file: File | null) => {
    if (!file || saving) return;
    if (!file.type.startsWith('image/')) {
      message.warning(t('me.avatarTypeError'));
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      message.warning(t('me.avatarSizeError', { mb: MAX_AVATAR_MB }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (url.startsWith('data:image/')) setAvatar(url);
    };
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      message.warning(t('me.nameRequired'));
      return;
    }
    if (trimmed.length > 40 || !NAME_RE.test(trimmed)) {
      message.warning(t('me.nameHint'));
      return;
    }
    if (!user) {
      message.warning(t('me.needLogin'));
      return;
    }
    if (saving) return;
    const nextBio = bio.trim().slice(0, MAX_BIO) || null;
    setSaving(true);
    try {
      const res = await updateProfile({ name: trimmed, bio: nextBio, avatar });
      dispatch(
        setUser({
          ...user,
          id: res.user.id || user.id,
          name: res.user.name,
          bio: res.user.bio ?? nextBio,
          avatar: res.user.avatar ?? avatar,
          email: res.user.email || user.email,
          provider: res.user.provider || user.provider,
        })
      );
      message.success(t('me.profileSaved'));
      onClose();
    } catch {
      message.error(t('home.casesLoadFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      show={open}
      onClose={() => {
        if (saving) return;
        onClose();
      }}
      width={420}
      className="!rounded-2xl !px-0 !pb-4 !pt-0"
      bodyClassName="!p-0"
      footerClassName="!px-5 !pt-2"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="small" type="default" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="small" type="primary" loading={saving} disabled={saving} onClick={() => void onSave()}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="px-5 pb-2 pt-8">
        <div className="flex flex-col items-center">
          <div className="relative">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="h-20 w-20 rounded-full object-cover ring-1 ring-[var(--line)]"
              />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent)] text-[28px] font-semibold text-[var(--on-brand)]">
                {initial}
              </span>
            )}
            <button
              type="button"
              aria-label={t('me.changeAvatar')}
              onClick={onPickAvatar}
              className="absolute -bottom-0.5 -right-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink)] shadow ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
            >
              <HiOutlinePencil className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                onAvatarFile(e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-[13px] font-medium text-[var(--ink)]">
            {t('me.username')}
            <span className="ml-0.5 text-red-500">*</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className={cn(
              'h-10 w-full rounded-xl border-0 bg-[var(--canvas)] px-3 text-[14px] text-[var(--ink)] outline-none ring-1 ring-[var(--line)]',
              'placeholder:text-[var(--muted)] focus:ring-[var(--ink)]/30'
            )}
            placeholder={t('me.usernamePlaceholder')}
          />
          <span className="mt-1.5 block text-[11px] text-[var(--muted)]">{t('me.nameHint')}</span>
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-medium text-[var(--ink)]">
            {t('me.bio')}
          </span>
          <div className="relative">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
              rows={4}
              maxLength={MAX_BIO}
              placeholder={t('me.bioPlaceholder')}
              className={cn(
                'w-full resize-none rounded-xl border-0 bg-[var(--canvas)] px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none ring-1 ring-[var(--line)]',
                'placeholder:text-[var(--muted)] focus:ring-[var(--ink)]/30'
              )}
            />
            <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] text-[var(--muted)]">
              {bio.length}/{MAX_BIO}
            </span>
          </div>
        </label>
      </div>
    </Dialog>
  );
}
