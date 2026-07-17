import { useMemo, type MouseEvent, type ReactNode } from 'react';
import { HiPlus, HiCheck } from 'react-icons/hi2';
import { cn } from '@/utils/classnames';

type AuthorFollowAvatarProps = {
  name: string;
  avatar?: string | null;
  size?: number;
  /** Show follow affordance (hidden for self). */
  showFollow?: boolean;
  following?: boolean;
  onOpenProfile?: () => void;
  onToggleFollow?: (e: MouseEvent) => void;
  className?: string;
  followLabel?: string;
  unfollowLabel?: string;
};

/**
 * Creator avatar — click opens profile; optional + badge to follow.
 */
export default function AuthorFollowAvatar({
  name,
  avatar,
  size = 40,
  showFollow = true,
  following = false,
  onOpenProfile,
  onToggleFollow,
  className,
  followLabel = 'Follow',
  unfollowLabel = 'Following',
}: AuthorFollowAvatarProps): ReactNode {
  const initial = ((name || 'U').trim()[0] || 'U').toUpperCase();
  const dim = `${size}px`;
  const badge = Math.max(14, Math.round(size * 0.38));

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: dim, height: dim }}>
      <button
        type="button"
        onClick={onOpenProfile}
        title={name}
        className="block h-full w-full overflow-hidden rounded-full ring-1 ring-[var(--line)] transition hover:opacity-90"
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[var(--ink)] text-[11px] font-bold text-[var(--on-brand)]">
            {initial}
          </span>
        )}
      </button>
      {showFollow ? (
        <button
          type="button"
          aria-label={following ? unfollowLabel : followLabel}
          aria-pressed={following}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFollow?.(e);
          }}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center rounded-full text-white shadow-sm ring-2 ring-[var(--surface)] transition',
            following
              ? 'bg-[var(--ink)] hover:bg-[var(--ink)]/85'
              : 'bg-[#2563eb] hover:bg-[#1d4ed8]'
          )}
          style={{ width: badge, height: badge }}
        >
          {following ? (
            <HiCheck className="h-[60%] w-[60%]" strokeWidth={2.5} />
          ) : (
            <HiPlus className="h-[65%] w-[65%]" strokeWidth={2.5} />
          )}
        </button>
      ) : null}
    </div>
  );
}
