import { useEffect, useRef, useState, type ReactNode } from 'react';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
import { projectThumbFrameClass } from '@/components/home/projectThumb';
import { nearestScrollRoot } from '@/hooks/useInfiniteList';
import { cn } from '@/utils/classnames';

type Props = {
  document?: unknown;
  fit?: 'contain' | 'cover';
  className?: string;
  children?: ReactNode;
  /** Keep SVG mounted once shown (default true). */
  once?: boolean;
};

/**
 * Mount TemplateThumbnail only when near viewport — avoids dozens of SVG boards
 * blocking the main thread on large project grids.
 */
export default function LazyTemplateThumb({
  document,
  fit = 'cover',
  className,
  children,
  once = true,
}: Props): ReactNode {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) {
          setActive(true);
          if (once) io.disconnect();
        } else if (!once) {
          setActive(false);
        }
      },
      { root: nearestScrollRoot(el), rootMargin: '200px 0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return (
    <div ref={rootRef} className={projectThumbFrameClass(className)}>
      {active && document ? (
        <TemplateThumbnail document={document} fit={fit} />
      ) : (
        <div
          className={cn(
            'flex h-full w-full items-center justify-center bg-[var(--accent-soft)]',
            active && 'animate-pulse'
          )}
        />
      )}
      {children}
    </div>
  );
}
