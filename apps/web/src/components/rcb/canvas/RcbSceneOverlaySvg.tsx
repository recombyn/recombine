import type { ReactNode, SVGProps } from 'react';

type Props = {
  children?: ReactNode;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'>;

/**
 * Scene-space SVG overlay for pen/pencil draw previews (under the camera layer).
 *
 * no fixed ±N plane. Identity mapping (1 user unit = 1 scene px)
 * from world origin; overflow paints outside the 1×1 host (Chrome paints this,
 * unlike a true 0×0 root).
 */
export default function RcbSceneOverlaySvg({ children, className, style, ...rest }: Props) {
  return (
    <svg
      className={
        className
          ? `pointer-events-none absolute z-20 overflow-visible ${className}`
          : 'pointer-events-none absolute z-20 overflow-visible'
      }
      width={1}
      height={1}
      style={{ left: 0, top: 0, overflow: 'visible', ...style }}
      {...rest}
    >
      {children}
    </svg>
  );
}
