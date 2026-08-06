import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  memo,
} from 'react';
import {
  useRcbCamera,
  useRcbDevicePixelRatio,
  rcbCameraCssZoom,
  rcbSceneToScreen,
  RcbOverlayPortal,
} from '@/components/rcb';
import {
  NODE_TITLE_LABEL_GAP_PX,
  NODE_TITLE_LABEL_LINE_PX,
} from './SelectionToolbarShell';
import { selectionChromeSurfaceProps } from '../SelectionChrome';

type NodeTitleLabelBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type NodeTitleIcon = 'frame' | 'image' | 'image-generator' | 'video' | 'video-generator';

type Props = {
  /** Scene-space AABB of the node / frame. */
  box: NodeTitleLabelBox;
  name: string;
  sizeWidth: number;
  sizeHeight: number;
  /** Hit-test marker: `data-frame-label` | `data-image-label`. */
  dataAttr: 'frame-label' | 'image-label';
  icon?: NodeTitleIcon;
  dataProps?: Record<string, string>;
  /** Degrees; title follows the rotated top edge. */
  angle?: number;
  hidden?: boolean;
  onSelect?: () => void;
  onRename?: (name: string) => void;
  onMove?: (x: number, y: number, opts?: { skipGrid?: boolean }) => void;
  onMoveStart?: () => void;
  onMoveEnd?: () => void;
  originX?: number;
  originY?: number;
  renameAriaLabel?: string;
};

const MUTED = 'var(--muted)';
/** Edit overlay font (matches idle SVG 11px after camera scale). */
const TITLE_EDIT_FONT_PX = 11;

function rotateLocalToScene(
  lx: number,
  ly: number,
  box: NodeTitleLabelBox,
  angleDeg: number
): { x: number; y: number } {
  if (Math.abs(angleDeg) < 0.001) {
    return { x: box.left + lx, y: box.top + ly };
  }
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = box.width / 2;
  const cy = box.height / 2;
  const dx = lx - cx;
  const dy = ly - cy;
  return {
    x: box.left + cx + dx * cos - dy * sin,
    y: box.top + cy + dx * sin + dy * cos,
  };
}

/**
 * Scene-space title layout: `scene = screenPx / zoom` under camera scale.
 */
export function nodeTitleLabelWorldPlacement(
  box: NodeTitleLabelBox,
  zoom: number,
  opts?: { sizeText?: string }
): {
  inv: number;
  gapScene: number;
  lineScene: number;
  fontSize: number;
  iconSize: number;
  labelBottomScene: number;
  labelTopScene: number;
  textY: number;
  iconX: number;
  iconY: number;
  nameX: number;
  sizeX: number;
  /** Name column width before the size text (overflow clip). */
  nameMaxWidth: number;
  sizeReserve: number;
  hitLeft: number;
  hitTop: number;
  hitWidth: number;
  hitHeight: number;
} {
  const z = Math.max(0.05, zoom || 1);
  const inv = 1 / z;
  const gapScene = NODE_TITLE_LABEL_GAP_PX * inv;
  const lineScene = NODE_TITLE_LABEL_LINE_PX * inv;
  const fontSize = 11 * inv;
  const iconSize = 12 * inv;
  const labelBottomScene = box.top - gapScene;
  const labelTopScene = labelBottomScene - lineScene;
  const textY = labelTopScene + lineScene * 0.5;
  const gapIcon = 4 * inv;
  const gapNameSize = 8 * inv;
  const sizeText = opts?.sizeText ?? '000 × 000';
  const sizeReserve = Math.max(fontSize * 3, sizeText.length * fontSize * 0.62);
  const nameX = box.left + iconSize + gapIcon;
  const sizeX = box.left + Math.max(1, box.width);
  const nameMaxWidth = Math.max(0, sizeX - gapNameSize - sizeReserve - nameX);
  return {
    inv,
    gapScene,
    lineScene,
    fontSize,
    iconSize,
    labelBottomScene,
    labelTopScene,
    textY,
    iconX: box.left,
    iconY: textY - iconSize * 0.5,
    nameX,
    sizeX,
    nameMaxWidth,
    sizeReserve,
    hitLeft: box.left,
    hitTop: labelTopScene,
    hitWidth: Math.max(1, box.width),
    hitHeight: lineScene,
  };
}

/** Stage layout px from plate top → title bottom. */
export function nodeTitleScreenGapPx(
  place: { labelBottomScene: number },
  boxTop: number,
  cameraZoom: number,
  viewportScale = 1
): number {
  const z = Math.max(0.05, cameraZoom || 1);
  const sx = viewportScale > 0 ? viewportScale : 1;
  return (boxTop - place.labelBottomScene) * z * sx;
}

/** 24×24 stroke icons, scaled into scene via `size`. */
function TitleIconSvg({
  kind,
  x,
  y,
  size,
}: {
  kind: NodeTitleIcon;
  x: number;
  y: number;
  size: number;
}) {
  const s = size / 24;
  const common = {
    fill: 'none' as const,
    stroke: MUTED,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  let path: ReactNode = null;
  if (kind === 'frame') {
    path = (
      <>
        <rect x={3} y={3} width={18} height={18} rx={2} {...common} />
        <path d="M3 9h18" {...common} />
        <path d="M9 21V9" {...common} />
      </>
    );
  } else if (kind === 'image-generator') {
    path = (
      <>
        <rect x={3} y={3} width={18} height={18} rx={2} {...common} />
        <circle cx={9} cy={9} r={2} {...common} />
        <path d="M21 15l-5-5L5 21" {...common} />
        <path d="M16 5h5v5" {...common} />
        <path d="M21 5l-6 6" {...common} />
      </>
    );
  } else if (kind === 'video-generator') {
    path = (
      <>
        <rect x={2} y={6} width={14} height={12} rx={2} {...common} />
        <path d="M16 10l6-3v10l-6-3z" {...common} />
        <path d="M8 3v3M12 3v3" {...common} />
      </>
    );
  } else if (kind === 'video') {
    path = (
      <>
        <rect x={2} y={5} width={20} height={14} rx={2} {...common} />
        <path d="M10 9l5 3-5 3z" {...common} fill={MUTED} />
      </>
    );
  } else {
    path = (
      <>
        <rect x={3} y={3} width={18} height={18} rx={2} {...common} />
        <circle cx={9} cy={9} r={2} {...common} />
        <path d="M21 15l-5-5L5 21" {...common} />
      </>
    );
  }
  return <g transform={`translate(${x} ${y}) scale(${s})`}>{path}</g>;
}

/**
 * Title row above frames / images / generators (world SVG, `px/zoom`).
 */
function NodeTitleLabel({
  box,
  name,
  sizeWidth,
  sizeHeight,
  dataAttr,
  icon,
  dataProps,
  angle = 0,
  hidden = false,
  onSelect,
  onRename,
  onMove,
  onMoveStart,
  onMoveEnd,
  originX = 0,
  originY = 0,
  renameAriaLabel,
}: Props): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [labelDragging, setLabelDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const labelDragRef = useRef<{
    originX: number;
    originY: number;
    clientX0: number;
    clientY0: number;
    started: boolean;
  } | null>(null);
  const camera = useRcbCamera();
  const dpr = useRcbDevicePixelRatio();
  const z = rcbCameraCssZoom(camera);
  const rotated = Math.abs(angle) > 0.001;
  const clipUid = useId().replace(/:/g, '');
  const sizeText = `${Math.round(sizeWidth)} × ${Math.round(sizeHeight)}`;

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, [editing]);

  useEffect(() => {
    if (!editing) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('[data-rcb-title-edit="1"]')) return;
      window.requestAnimationFrame(() => {
        const el = inputRef.current;
        const value = (el?.value ?? '').trim() || name;
        setEditing(false);
        setDraft(value);
        if (value !== name) onRename?.(value);
      });
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [editing, name, onRename]);

  const place = useMemo(
    () => nodeTitleLabelWorldPlacement(box, z, { sizeText }),
    [box.left, box.top, box.width, box.height, z, sizeText]
  );

  // Prefer shared world lattice; pad includes title strip so glyphs are not clipped.
  const surf = useMemo(
    () =>
      selectionChromeSurfaceProps(
        box,
        angle,
        place.gapScene + place.lineScene,
        camera,
        dpr
      ),
    [
      box.left,
      box.top,
      box.width,
      box.height,
      angle,
      place.gapScene,
      place.lineScene,
      camera,
      dpr,
    ]
  );

  const iconKind: NodeTitleIcon =
    icon || (dataAttr === 'frame-label' ? 'frame' : 'image');

  const bodyTransform = rotated
    ? `translate(${box.left} ${box.top}) rotate(${angle} ${box.width / 2} ${box.height / 2})`
    : null;

  /** Local coords when rotated; else absolute scene. */
  const local = rotated
    ? {
        iconX: 0,
        iconY: -(place.gapScene + place.lineScene) + (place.lineScene - place.iconSize) * 0.5,
        nameX: place.iconSize + 4 * place.inv,
        sizeX: Math.max(1, box.width),
        textY: -(place.gapScene + place.lineScene * 0.5),
        hitX: 0,
        hitY: -(place.gapScene + place.lineScene),
        hitW: Math.max(1, box.width),
        hitH: place.lineScene,
        nameMaxWidth: Math.max(
          0,
          Math.max(1, box.width) -
            (place.iconSize + 4 * place.inv) -
            8 * place.inv -
            place.sizeReserve
        ),
      }
    : {
        iconX: place.iconX,
        iconY: place.iconY,
        nameX: place.nameX,
        sizeX: place.sizeX,
        textY: place.textY,
        hitX: place.hitLeft,
        hitY: place.hitTop,
        hitW: place.hitWidth,
        hitH: place.hitHeight,
        nameMaxWidth: place.nameMaxWidth,
      };

  const nameClipId = `rcb-title-name-${clipUid}`;

  const commit = () => {
    const next = draft.trim() || name;
    setEditing(false);
    setDraft(next);
    if (next !== name) onRename?.(next);
  };

  if (hidden || labelDragging) return null;

  const attrProps =
    dataAttr === 'frame-label'
      ? { 'data-frame-label': true as const }
      : { 'data-image-label': true as const };

  const onLabelPointerDown = (e: ReactPointerEvent<SVGRectElement>) => {
    e.stopPropagation();
    if (editing) return;
    onSelect?.();
    if (!onMove || e.button !== 0) return;
    labelDragRef.current = {
      originX,
      originY,
      clientX0: e.clientX,
      clientY0: e.clientY,
      started: false,
    };
    const onMoveWin = (ev: PointerEvent) => {
      const drag = labelDragRef.current;
      if (!drag) return;
      const dx = (ev.clientX - drag.clientX0) / z;
      const dy = (ev.clientY - drag.clientY0) / z;
      if (!drag.started) {
        if (Math.hypot(dx, dy) < 3) return;
        drag.started = true;
        setLabelDragging(true);
        onMoveStart?.();
      }
      onMove(Math.round(drag.originX + dx), Math.round(drag.originY + dy), {
        skipGrid: ev.ctrlKey || ev.metaKey,
      });
    };
    const onUpWin = () => {
      const wasDragging = labelDragRef.current?.started;
      labelDragRef.current = null;
      setLabelDragging(false);
      window.removeEventListener('pointermove', onMoveWin);
      window.removeEventListener('pointerup', onUpWin);
      if (wasDragging) onMoveEnd?.();
    };
    window.addEventListener('pointermove', onMoveWin);
    window.addEventListener('pointerup', onUpWin);
  };

  const labelBody = (
    <>
      <defs>
        <clipPath id={nameClipId}>
          <rect
            x={local.nameX}
            y={local.hitY}
            width={Math.max(0, local.nameMaxWidth)}
            height={local.hitH}
          />
        </clipPath>
      </defs>
      <rect
        {...attrProps}
        {...dataProps}
        x={local.hitX}
        y={local.hitY}
        width={local.hitW}
        height={local.hitH}
        fill="transparent"
        style={{ pointerEvents: 'all', cursor: onMove ? 'grab' : 'default' }}
        onPointerDown={onLabelPointerDown}
        onDoubleClick={(e) => {
          if (!onRename) return;
          e.preventDefault();
          e.stopPropagation();
          onSelect?.();
          setDraft(name);
          setEditing(true);
        }}
      />
      <TitleIconSvg kind={iconKind} x={local.iconX} y={local.iconY} size={place.iconSize} />
      {!editing ? (
        <text
          x={local.nameX}
          y={local.textY}
          fill={MUTED}
          fontSize={place.fontSize}
          fontWeight={500}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          textAnchor="start"
          dominantBaseline="central"
          clipPath={`url(#${nameClipId})`}
          style={{ pointerEvents: 'none' }}
        >
          {name}
        </text>
      ) : null}
      <text
        x={local.sizeX}
        y={local.textY}
        fill={MUTED}
        fontSize={place.fontSize}
        fontWeight={500}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        textAnchor="end"
        dominantBaseline="central"
        opacity={0.8}
        style={{ pointerEvents: 'none' }}
      >
        {sizeText}
      </text>
    </>
  );

  // Unscaled overlay + scene→screen; anchor at text center then translateY(-50%).
  const editLocalX = rotated ? local.nameX : place.nameX - box.left;
  const editLocalY = rotated ? local.textY : place.textY - box.top;
  const editScene = rotateLocalToScene(editLocalX, editLocalY, box, angle);
  const editScreen = rcbSceneToScreen(camera, editScene.x, editScene.y, dpr);
  const editScreenW = Math.max(44, local.nameMaxWidth * z);

  const editInput =
    editing && onRename ? (
      <RcbOverlayPortal>
        <div
          data-rcb-title-edit="1"
          data-text-inline-editor
          className="pointer-events-auto absolute z-[40] overflow-hidden"
          style={{
            left: editScreen.x,
            top: editScreen.y,
            width: editScreenW,
            height: NODE_TITLE_LABEL_LINE_PX,
            transform: 'translateY(-50%)',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            value={draft}
            aria-label={renameAriaLabel || name}
            className="block w-full appearance-none border-0 bg-transparent p-0 font-medium leading-none text-[var(--ink)] shadow-none outline-none ring-0"
            style={{
              fontSize: TITLE_EDIT_FONT_PX,
              lineHeight: `${NODE_TITLE_LABEL_LINE_PX}px`,
              height: NODE_TITLE_LABEL_LINE_PX,
              margin: 0,
              padding: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(name);
                setEditing(false);
              }
              e.stopPropagation();
            }}
          />
        </div>
      </RcbOverlayPortal>
    ) : null;

  return (
    <>
      <svg
        data-rcb-infinite="1"
        data-rcb-node-title="1"
        className="absolute z-[1000002] overflow-visible"
        width={surf.width}
        height={surf.height}
        viewBox={surf.viewBox}
        preserveAspectRatio="none"
        style={{
          ...surf.style,
          pointerEvents: 'none',
        }}
        aria-hidden={false}
      >
        {bodyTransform ? <g transform={bodyTransform}>{labelBody}</g> : labelBody}
      </svg>
      {editInput}
    </>
  );
}

export default memo(NodeTitleLabel);
