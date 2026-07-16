import type { CSSProperties, ReactNode, Ref } from 'react';

type SvgPaperProps = {
  paperRef: Ref<HTMLDivElement>;
  hostRef: Ref<HTMLDivElement>;
  width: number;
  height: number;
  background: string;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
};

/**
 * Artboard in world pixels (1:1 with scene).
 * Visual zoom/pan is handled by InfiniteCanvasStage camera transform.
 */
export default function SvgPaper({
  paperRef,
  hostRef,
  width,
  height,
  background,
  children,
  style,
  className,
}: SvgPaperProps) {
  return (
    <div
      ref={paperRef}
      className={className || 'canvas-paper relative overflow-visible'}
      data-doc-width={width}
      data-doc-height={height}
      style={{
        width,
        height,
        background,
        overflow: 'visible',
        ...style,
      }}
    >
      <div ref={hostRef} className="absolute inset-0 overflow-visible [&>svg]:h-full [&>svg]:w-full" />
      {children}
    </div>
  );
}
