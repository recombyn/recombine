import {
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';

/** Walk up to the nearest overflow scroll container (Home / Me nested panels). */
export function nearestScrollRoot(el: HTMLElement | null): Element | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

type ScrollLoadMoreOptions = {
  hasMore: boolean;
  /** Initial / blocking load — do not fire load-more. */
  loading?: boolean;
  loadingMore?: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
};

/**
 * IntersectionObserver against the nearest scroll parent.
 * Call `onLoadMore` when the sentinel enters the viewport (with rootMargin prefetch).
 */
export function useScrollLoadMore({
  hasMore,
  loading = false,
  loadingMore = false,
  onLoadMore,
  rootMargin = '320px 0px',
}: ScrollLoadMoreOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return undefined;
    const root = nearestScrollRoot(el);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        onLoadMoreRef.current();
      },
      { root, rootMargin, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, rootMargin]);

  return sentinelRef;
}

type ScrollLoadFooterProps = {
  sentinelRef: RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  loadingMore?: boolean;
  className?: string;
};

/** Bottom sentinel — shows「加载中…」while the next page is fetching. */
export function ScrollLoadFooter({
  sentinelRef,
  hasMore,
  loadingMore = false,
  className,
}: ScrollLoadFooterProps) {
  const { t } = useTranslation();
  if (!hasMore && !loadingMore) return null;
  return (
    <div
      ref={sentinelRef}
      className={cn('flex h-12 w-full items-center justify-center', className)}
      aria-busy={loadingMore || undefined}
      aria-hidden={!loadingMore}
    >
      {loadingMore ? (
        <span className="text-[12px] text-[var(--muted)]">{t('common.loading')}</span>
      ) : null}
    </div>
  );
}

type InfiniteScrollSectionProps = {
  loading: boolean;
  loadingMore?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  isEmpty?: boolean;
  empty?: ReactNode;
  /** Shown while `loading` (usually a grid of skeletons). */
  skeleton: ReactNode;
  gridClassName?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Shared list shell: initial skeleton → empty → grid + scroll-load footer.
 * Used by Home plaza, Projects, and Me.
 */
export function InfiniteScrollSection({
  loading,
  loadingMore = false,
  hasMore,
  onLoadMore,
  isEmpty = false,
  empty = null,
  skeleton,
  gridClassName,
  className,
  children,
}: InfiniteScrollSectionProps) {
  const sentinelRef = useScrollLoadMore({
    hasMore,
    loading,
    loadingMore,
    onLoadMore,
  });

  if (loading) {
    return (
      <div className={cn(className)}>
        <div className={cn(gridClassName)}>{skeleton}</div>
      </div>
    );
  }

  if (isEmpty) {
    return <div className={cn(className)}>{empty}</div>;
  }

  return (
    <div className={cn(className)}>
      <div className={cn(gridClassName)}>{children}</div>
      <ScrollLoadFooter
        sentinelRef={sentinelRef}
        hasMore={hasMore}
        loadingMore={loadingMore}
      />
    </div>
  );
}

type SkeletonGridProps = {
  count: number;
  className?: string;
  children: (index: number) => ReactNode;
};

/** Renders `count` skeleton placeholders inside an optional grid class. */
export function SkeletonGrid({ count, className, children }: SkeletonGridProps) {
  return (
    <div className={cn(className)} aria-busy="true">
      {Array.from({ length: count }, (_, i) => children(i))}
    </div>
  );
}

/** Default skeleton card count — ~2 rows on a 5-column home grid. */
export const GRID_SKELETON_COUNT = 10;
