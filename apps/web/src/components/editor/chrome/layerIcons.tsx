import type { ComponentType, SVGProps } from 'react';
import {
  LuArrowUpRight,
  LuCircle,
  LuHexagon,
  LuImage,
  LuMinus,
  LuPenTool,
  LuPencil,
  LuSquare,
  LuStar,
  LuTriangle,
  LuType,
} from 'react-icons/lu';
import { cn } from '@/utils/classnames';

export type LayerIconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

/** One family (Lucide) so layer glyphs share stroke weight and optical size. */
export const layerIconByKind: Record<string, LayerIconComponent> = {
  text: LuType,
  image: LuImage,
  rect: LuSquare,
  line: LuMinus,
  arrow: LuArrowUpRight,
  circle: LuCircle,
  triangle: LuTriangle,
  star: LuStar,
  polygon: LuHexagon,
  pen: LuPenTool,
  pencil: LuPencil,
  path: LuPenTool,
};

export function resolveLayerIconKind(node: { key: string; attrs?: { shapeType?: string } }) {
  if (node.key === 'shape') return node.attrs?.shapeType || 'rect';
  return node.key;
}

type LayerIconProps = {
  node?: { key: string; attrs?: { shapeType?: string } };
  kind?: string;
  className?: string;
  iconClassName?: string;
};

/** Compact list glyph — smaller than the left toolbar rail icons. */
const LAYER_ICON_SIZE = 14;

export function LayerKindIcon({ node, kind, className, iconClassName }: LayerIconProps) {
  const resolved = kind || (node ? resolveLayerIconKind(node) : 'rect');
  const Icon = layerIconByKind[resolved] || LuSquare;
  return (
    <span
      className={cn(
        'inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center text-[var(--muted)]',
        '[&>svg]:block [&>svg]:h-full [&>svg]:w-full',
        className
      )}
    >
      <Icon
        size={LAYER_ICON_SIZE}
        className={cn('block shrink-0', iconClassName)}
        strokeWidth={1.75}
      />
    </span>
  );
}
