import { useEffect, useRef, useState, type ReactNode } from 'react';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
import { projectThumbFrameClass } from '@/utils/projectThumb';
import { nearestScrollRoot } from '@/utils/useInfiniteList';
import { cn } from '@/utils/classnames';

type Props = {
  /** Lightweight cover document from Plaza list API (`coverDocument`). */
  coverDocument?: unknown | null;
  className?: string;
  children?: ReactNode;
  once?: boolean;
};

/**
 * Plaza card cover — renders artboard cover from feed payload.
 * Missing cover → empty slot (no placeholder mark).
 */
export default function PlazaCoverThumb({
  coverDocument,
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
      {active && coverDocument ? (
        <TemplateThumbnail document={coverDocument} fit="cover" />
      ) : (
        <div className={cn('h-full w-full bg-[var(--accent-soft)]')} />
      )}
      {children}
    </div>
  );
}
