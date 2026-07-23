import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { LuPanelRight } from 'react-icons/lu';
import { HiOutlineClipboardDocument } from 'react-icons/hi2';
import { message } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import { ExportSelectionPanel } from '@/components/editor/panels/ExportSelectionPanel';
import { cn } from '@/utils/classnames';
import { radiiFromAttrs } from '@/components/rcb/scene/sceneRadii';
import {
  resolveFillColor,
  resolveShadow,
  resolveStroke,
} from '@/components/rcb/scene/sceneEffects';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';

function formatPx(n: number) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

function toRgbaDisplay(color: string): string {
  const c = (color || '').trim();
  if (!c || c === 'transparent' || c === 'rgba(0,0,0,0)') return 'rgba(0, 0, 0, 0)';
  if (/^rgba?\(/i.test(c)) return c.replace(/\s+/g, ' ');
  const hex = c.replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return `rgba(${r}, ${g}, ${b}, 1)`;
  }
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100;
    if ([r, g, b, a].every((n) => Number.isFinite(n))) return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return c;
}

function ColorSwatch({ color }: { color: string }) {
  const display = toRgbaDisplay(color);
  const isClear = display === 'rgba(0, 0, 0, 0)' || display.includes(', 0)');
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-sm ring-1 ring-[var(--line)]"
      style={{
        background: isClear
          ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px'
          : display,
      }}
      title={display}
    />
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[var(--line)] px-3 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium text-[var(--ink)]">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-[var(--accent-soft)] px-2 py-1.5">
      <span className="text-[11px] font-medium text-[var(--muted)]">{label}</span>
      <span className="min-w-0 truncate text-[12px] tabular-nums text-[var(--ink)]">{value}</span>
    </div>
  );
}

function buildCss(opts: {
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  shadow: ReturnType<typeof resolveShadow>;
}) {
  const lines = [
    `left: ${formatPx(opts.left)}px;`,
    `top: ${formatPx(opts.top)}px;`,
    `width: ${formatPx(opts.width)}px;`,
    `height: ${formatPx(opts.height)}px;`,
    `opacity: ${opts.opacity};`,
  ];
  if (opts.radius > 0) lines.push(`border-radius: ${formatPx(opts.radius)}px;`);
  if (opts.fill && opts.fill !== 'rgba(0,0,0,0)' && opts.fill !== 'transparent') {
    lines.push(`background: ${toRgbaDisplay(opts.fill)};`);
  }
  if (opts.strokeWidth > 0 && opts.stroke && opts.stroke !== 'transparent') {
    lines.push(`border: ${formatPx(opts.strokeWidth)}px solid ${toRgbaDisplay(opts.stroke)};`);
  }
  if (opts.shadow) {
    lines.push(
      `box-shadow: ${formatPx(opts.shadow.offsetX)}px ${formatPx(opts.shadow.offsetY)}px ${formatPx(opts.shadow.blur)}px ${toRgbaDisplay(opts.shadow.color)};`
    );
  }
  return lines.join('\n');
}

const INSPECT_DOCK_WIDTH_KEY = 'inspect-dock-width';
const INSPECT_DOCK_MIN_W = 260;
const INSPECT_DOCK_MAX_W = 560;
const INSPECT_DOCK_DEFAULT_W = 300;

function clampInspectDockWidth(width: number): number {
  const viewportCap =
    typeof window !== 'undefined'
      ? Math.max(INSPECT_DOCK_MIN_W, window.innerWidth - 360)
      : INSPECT_DOCK_MAX_W;
  return Math.min(
    INSPECT_DOCK_MAX_W,
    viewportCap,
    Math.max(INSPECT_DOCK_MIN_W, Math.round(width))
  );
}

function readStoredInspectDockWidth(): number {
  try {
    const raw = localStorage.getItem(INSPECT_DOCK_WIDTH_KEY);
    if (!raw) return INSPECT_DOCK_DEFAULT_W;
    const n = Number(raw);
    if (!Number.isFinite(n)) return INSPECT_DOCK_DEFAULT_W;
    return clampInspectDockWidth(n);
  } catch {
    return INSPECT_DOCK_DEFAULT_W;
  }
}

/** Dev-mode inspect panel: geometry, style, CSS, export (replaces chat). */
export default function DevPropertiesPanel({
  className,
  onClose,
}: {
  className?: string;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const document = useSelector((s: any) => s.editor.document);
  const selectedNodeIds = useSelector((s: any) => (s.editor.selectedNodeIds || []) as string[]);
  const hoverNodeId = useSelector((s: any) => s.editor.devHoverNodeId as string | null);
  const nodeId =
    hoverNodeId || (selectedNodeIds.length === 1 ? selectedNodeIds[0] : null);
  const node = nodeId ? document?.deltaSetLike?.[nodeId] : null;

  const [dockWidth, setDockWidth] = useState(INSPECT_DOCK_DEFAULT_W);
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    setDockWidth(readStoredInspectDockWidth());
  }, []);

  useEffect(
    () => () => {
      window.document.body.style.cursor = '';
      window.document.body.style.userSelect = '';
    },
    []
  );

  const persistDockWidth = (width: number) => {
    const next = clampInspectDockWidth(width);
    setDockWidth(next);
    try {
      localStorage.setItem(INSPECT_DOCK_WIDTH_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const onDockResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeDragRef.current = { startX: e.clientX, startW: dockWidth };
    window.document.body.style.cursor = 'col-resize';
    window.document.body.style.userSelect = 'none';
  };

  const onDockResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    setDockWidth(clampInspectDockWidth(drag.startW + (drag.startX - e.clientX)));
  };

  const endDockResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeDragRef.current) return;
    resizeDragRef.current = null;
    window.document.body.style.cursor = '';
    window.document.body.style.userSelect = '';
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDockWidth((w) => {
      try {
        localStorage.setItem(INSPECT_DOCK_WIDTH_KEY, String(w));
      } catch {
        /* ignore */
      }
      return w;
    });
  };

  const model = useMemo(() => {
    if (!document || !node || !nodeId) return null;
    const { left, top } = nodeLeftTop(document, node);
    const width = Math.max(0, Number(node.width) || 0);
    const height = Math.max(0, Number(node.height) || 0);
    const radii = radiiFromAttrs(node.attrs || {});
    const radius = Math.max(radii.tl, radii.tr, radii.br, radii.bl);
    const opacity = Math.min(1, Math.max(0, Number(node.attrs?.opacity ?? 1)));
    const fill = resolveFillColor(node, 'transparent');
    const stroke = resolveStroke(node, 'transparent');
    const shadow = resolveShadow(node);
    const css = buildCss({
      left,
      top,
      width,
      height,
      opacity,
      radius,
      fill,
      stroke: stroke.stroke,
      strokeWidth: stroke.strokeWidth,
      shadow,
    });
    return { left, top, width, height, radius, opacity, fill, stroke, shadow, css };
  }, [document, node, nodeId]);

  const copyCss = async () => {
    if (!model?.css) return;
    try {
      await navigator.clipboard.writeText(model.css);
      message.success(t('editor.devCopied'));
    } catch {
      message.error(t('editor.devCopyFailed'));
    }
  };

  return (
    <aside
      data-dev-props
      style={{ width: dockWidth }}
      className={cn(
        'relative flex shrink-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)]',
        className
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('editor.devInspect')}
        aria-valuemin={INSPECT_DOCK_MIN_W}
        aria-valuemax={INSPECT_DOCK_MAX_W}
        aria-valuenow={dockWidth}
        className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40"
        onPointerDown={onDockResizePointerDown}
        onPointerMove={onDockResizePointerMove}
        onPointerUp={endDockResize}
        onPointerCancel={endDockResize}
        onDoubleClick={() => persistDockWidth(INSPECT_DOCK_DEFAULT_W)}
      />
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 px-3">
        <h2 className="text-[13px] font-semibold text-[var(--ink)]">
          {t('editor.devInspect')}
        </h2>
        {onClose ? (
          <Tooltip title={t('editor.closePanel')} placement="bottom">
            <button
              type="button"
              aria-label={t('editor.closePanel')}
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            >
              <LuPanelRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!model || !nodeId ? (
          <div className="px-3 py-8 text-center text-[12px] leading-relaxed text-[var(--muted)]">
            {!hoverNodeId && selectedNodeIds.length > 1
              ? t('editor.devMultiHint')
              : t('editor.devNoSelection')}
          </div>
        ) : (
          <>
            <Section
              title={t('editor.devSelectedObject')}
              right={
                <button
                  type="button"
                  onClick={copyCss}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                  aria-label={t('editor.devCopyCss')}
                >
                  <HiOutlineClipboardDocument className="h-3.5 w-3.5" />
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-1.5">
                <Metric label="X" value={`${formatPx(model.left)}px`} />
                <Metric label="Y" value={`${formatPx(model.top)}px`} />
                <Metric label="W" value={`${formatPx(model.width)}px`} />
                <Metric label="H" value={`${formatPx(model.height)}px`} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink)]">
                <span className="text-[var(--muted)]">{t('editor.fillRadius')}</span>
                <span className="tabular-nums">{formatPx(model.radius)}px</span>
                <span className="text-[var(--muted)]">·</span>
                <span className="text-[var(--muted)]">{t('editor.fillOpacity')}</span>
                <span className="tabular-nums">{Math.round(model.opacity * 100)}%</span>
              </div>
            </Section>

            <Section
              title={t('editor.devStyle')}
              right={
                <span className="text-[11px] text-[var(--muted)]">RGBA</span>
              }
            >
              <div className="space-y-2.5 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[var(--muted)]">{t('editor.fill')}</span>
                  <ColorSwatch color={model.fill} />
                  <span className="min-w-0 truncate tabular-nums text-[var(--ink)]">
                    {toRgbaDisplay(model.fill)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[var(--muted)]">{t('editor.stroke')}</span>
                  <span className="tabular-nums text-[var(--ink)]">
                    {formatPx(model.stroke.strokeWidth)}px
                  </span>
                  <ColorSwatch color={model.stroke.stroke} />
                  <span className="min-w-0 truncate tabular-nums text-[var(--ink)]">
                    {toRgbaDisplay(model.stroke.stroke)}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-10 shrink-0 pt-0.5 text-[var(--muted)]">
                    {t('editor.devShadow')}
                  </span>
                  {model.shadow ? (
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 tabular-nums text-[var(--ink)]">
                        <span>X {formatPx(model.shadow.offsetX)}</span>
                        <span>Y {formatPx(model.shadow.offsetY)}</span>
                        <span>B {formatPx(model.shadow.blur)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ColorSwatch color={model.shadow.color} />
                        <span className="min-w-0 truncate tabular-nums">
                          {toRgbaDisplay(model.shadow.color)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )}
                </div>
              </div>
            </Section>

            <Section
              title={t('editor.devCode')}
              right={
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--ink)]">
                    CSS
                  </span>
                  <button
                    type="button"
                    onClick={copyCss}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                    aria-label={t('editor.devCopyCss')}
                  >
                    <HiOutlineClipboardDocument className="h-3.5 w-3.5" />
                  </button>
                </div>
              }
            >
              <pre className="overflow-x-auto rounded-md bg-[var(--canvas)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--ink)]">
                {model.css.split('\n').map((line, i) => {
                  const idx = line.indexOf(':');
                  if (idx < 0) return <div key={i}>{line}</div>;
                  return (
                    <div key={i}>
                      <span>{line.slice(0, idx + 1)}</span>
                      <span className="text-[var(--color-background-success-base-hover,#2f7d4a)]">
                        {line.slice(idx + 1)}
                      </span>
                    </div>
                  );
                })}
              </pre>
            </Section>

            <Section title={t('editor.export')}>
              <ExportSelectionPanel nodeIds={[nodeId]} variant="inline" />
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
