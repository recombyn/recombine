import { useMemo, useState, type ComponentType } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { FiPenTool } from 'react-icons/fi';
import { LuPencil } from 'react-icons/lu';
import { RxText } from 'react-icons/rx';
import { BiExit } from 'react-icons/bi';
import {
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineMinus,
  HiOutlinePhoto,
  HiOutlineStop,
} from 'react-icons/hi2';
import { TbArrowUpRight, TbCircle, TbPolygon, TbStar, TbTriangle } from 'react-icons/tb';
import Tooltip from '@/components/base/tooltip';
import { listSceneNodes } from '@/store/scene/sceneDocument';
import { cn } from '@/utils/classnames';
import { setSelectedNodeId } from '@/store/modules/editor';

type LayerIconComponent = ComponentType<{ className?: string }>;

const LAYER_ICON_SLOT =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]';

const layerIconByKind: Record<string, LayerIconComponent> = {
  text: RxText,
  image: HiOutlinePhoto,
  rect: HiOutlineStop,
  line: HiOutlineMinus,
  arrow: TbArrowUpRight,
  circle: TbCircle,
  triangle: TbTriangle,
  star: TbStar,
  polygon: TbPolygon,
  pen: FiPenTool,
  pencil: LuPencil,
  path: FiPenTool,
};

const layerIconSizeByKind: Record<string, string> = {
  text: 'h-[14px] w-[14px]',
  image: 'h-[12px] w-[12px]',
  rect: 'h-[12px] w-[12px]',
  line: 'h-[11px] w-[16px]',
  arrow: 'h-[13px] w-[13px]',
  circle: 'h-[16px] w-[16px]',
  triangle: 'h-[14px] w-[14px]',
  star: 'h-[14px] w-[14px]',
  polygon: 'h-[13px] w-[13px]',
  pen: 'h-[14px] w-[14px]',
  pencil: 'h-[14px] w-[14px]',
  path: 'h-[14px] w-[14px]',
};

function resolveLayerIconKind(node: { key: string; attrs?: { shapeType?: string } }) {
  if (node.key === 'shape') return node.attrs?.shapeType || 'rect';
  return node.key;
}

function LayerIcon({
  node,
  filled,
}: {
  node: { key: string; attrs?: { shapeType?: string; ['fill-color']?: string } };
  filled?: boolean;
}) {
  const kind = resolveLayerIconKind(node);
  const Icon = layerIconByKind[kind] || HiOutlineStop;
  const sizeClass = layerIconSizeByKind[kind] || layerIconSizeByKind.rect;
  const fill = String(node.attrs?.['fill-color'] || '');
  const isSolidRect =
    filled ||
    (kind === 'rect' && fill && fill !== 'transparent' && !/^rgba?\([^)]*,\s*0\)/.test(fill));

  return (
    <span
      className={cn(
        LAYER_ICON_SLOT,
        isSolidRect && 'bg-[var(--accent-soft)]'
      )}
    >
      {isSolidRect && kind === 'rect' ? (
        <span
          className="block h-3 w-3 rounded-[2px]"
          style={{ background: fill || 'var(--muted)' }}
        />
      ) : (
        <Icon className={cn(sizeClass, 'block shrink-0')} />
      )}
    </span>
  );
}

function layerLabel(node: { key: string; attrs?: { shapeType?: string } }) {
  const kind = resolveLayerIconKind(node);
  const map: Record<string, string> = {
    text: '文字',
    image: '图片',
    rect: '矩形',
    line: '线条',
    arrow: '箭头',
    circle: '椭圆',
    triangle: '多边形',
    polygon: '多边形',
    star: '星形',
    pen: '钢笔',
    pencil: '铅笔',
    path: '路径',
  };
  return map[kind] || kind;
}

/** Left layers dock — history + scene nodes (fig.2). */
export default function LayerPanel({ onClose }: { onClose?: () => void } = {}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const document = useSelector((state: any) => state.editor.document);
  const selectedNodeId = useSelector((state: any) => state.editor.selectedNodeId);
  const historyPast = useSelector((state: any) => state.editor.historyPast || []);
  const nodes = listSceneNodes(document);
  const [historyOpen, setHistoryOpen] = useState(true);

  const historyItems = useMemo(() => {
    // Newest first — length is enough for a simple step list.
    return historyPast.map((_: unknown, i: number) => ({
      id: `h-${i}`,
      label: t('editor.historyStep', { n: historyPast.length - i }),
    }));
  }, [historyPast, t]);

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)]">
      <div className="flex h-11 shrink-0 items-center justify-between px-3">
        <span className="text-[14px] font-semibold text-[var(--ink)]">{t('editor.layers')}</span>
        {onClose ? (
          <Tooltip title={'退出'} placement="bottom">
            <button
              type="button"
              aria-label={'退出'}
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            >
              <BiExit className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
        ) : null}
      </div>

      {/* History */}
      <div className="shrink-0 border-b border-[var(--line)] px-2 pb-2">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
        >
          <span>{t('editor.history')}</span>
          {historyOpen ? (
            <HiOutlineChevronUp className="h-3.5 w-3.5 text-[var(--muted)]" />
          ) : (
            <HiOutlineChevronDown className="h-3.5 w-3.5 text-[var(--muted)]" />
          )}
        </button>
        {historyOpen ? (
          historyItems.length ? (
            <ul className="mt-1 max-h-[120px] space-y-0.5 overflow-y-auto">
              {historyItems.map((item) => (
                <li
                  key={item.id}
                  className="truncate rounded-md px-2 py-1.5 text-[12px] text-[var(--muted)]"
                >
                  {item.label}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-[var(--muted)]">
              <HiOutlinePhoto className="h-8 w-8 opacity-40" />
              <p className="text-[12px]">{t('editor.noHistory')}</p>
            </div>
          )
        ) : null}
      </div>

      {/* Layer rows */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {nodes.length ? (
          <ul>
            {[...nodes].reverse().map(({ id, node }: any) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => dispatch(setSelectedNodeId(id))}
                  className={cn(
                    'flex min-h-[40px] w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors',
                    selectedNodeId === id
                      ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                      : 'text-[var(--ink)] hover:bg-[var(--accent-soft)]'
                  )}
                >
                  <LayerIcon node={node} />
                  <span className="min-w-0 flex-1 truncate">{layerLabel(node)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-8 text-center text-[12px] text-[var(--muted)]">{t('editor.noLayers')}</p>
        )}
      </div>
    </aside>
  );
}
