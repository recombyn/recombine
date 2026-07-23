import { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_PAGE = 20;

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

/**
 * Client-side infinite reveal for grids/lists.
 * Resets when `resetKey` changes (tab switch, filter, etc.).
 * Observes the nearest scrollable ancestor so nested panels (Me / Home) work.
 */
export function useInfiniteList<T>(
  items: T[],
  options?: { pageSize?: number; resetKey?: string | number }
) {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE;
  const resetKey = options?.resetKey;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [pageSize, resetKey, items.length]);

  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return undefined;
    const root = nearestScrollRoot(el);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setVisibleCount((n) => Math.min(n + pageSize, items.length));
      },
      { root, rootMargin: '320px 0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, items.length, pageSize, visibleCount]);

  return { visible, hasMore, sentinelRef, visibleCount };
}
