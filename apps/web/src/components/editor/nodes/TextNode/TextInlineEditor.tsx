import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CameraOverlayPortal,
  useCamera,
  worldToStage,
} from '@/components/editor/Canvas/stage/CameraContext';
import { toFabricFontFamily } from '@/store/scene/sceneText';
import {
  buildMarkdownTextAttrs,
  DEFAULT_TEXT_STYLE,
  measureWrappedTextSize,
  parseNodeMarkdown,
  parseNodeTextStyle,
  resolveTextBoxWidth,
} from '@/store/scene/sceneText';
import { nodeLeftTop } from '@/store/scene/sceneToSvg';

type Props = {
  document: any;
  nodeId: string;
  onCommit: (next: {
    attrs: Record<string, unknown>;
    width: number;
    height: number;
  }) => void;
  /** Empty cancel / Escape — caller may delete the node. */
  onCancel: () => void;
};

/**
 * Inline text caret editor (screen-space).
 * Fixed box width + soft wrap (height grows); does not stretch sideways with content.
 */
export default function TextInlineEditor({ document, nodeId, onCommit, onCancel }: Props) {
  const camera = useCamera();
  const node = document?.deltaSetLike?.[nodeId];
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const style = parseNodeTextStyle(node?.attrs || {});
  const initial = parseNodeMarkdown(node?.attrs || {}) || '';
  const [value, setValue] = useState(initial);
  const committedRef = useRef(false);

  const { left, top } = node ? nodeLeftTop(document, node) : { left: 0, top: 0 };
  const fontSize = style.fontSize || DEFAULT_TEXT_STYLE.fontSize;
  const z = Math.max(0.05, camera.zoom || 1);
  const hasContent = Boolean(value.trim());
  const widthWorld = resolveTextBoxWidth(node?.width, hasContent);
  const wrapped = measureWrappedTextSize(value || 'M', style, widthWorld);
  const heightWorld = Math.max(fontSize * (style.lineHeight || 1.4), wrapped.height);
  const stage = worldToStage(camera, left, top);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [initial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        committedRef.current = true;
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const finish = (nextValue: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = nextValue.replace(/\s+$/g, '');
    if (!trimmed.length) {
      onCancel();
      return;
    }
    const boxW = resolveTextBoxWidth(node?.width, true);
    const measuredBox = measureWrappedTextSize(trimmed, style, boxW);
    const lineH = Math.max(0.8, Number(style.lineHeight) || 1.4);
    onCommit({
      attrs: buildMarkdownTextAttrs(trimmed, style),
      width: measuredBox.width,
      height: Math.max(measuredBox.height, Math.ceil(fontSize * lineH)),
    });
  };

  if (!node || node.key !== 'text') return null;

  const fontFamily = toFabricFontFamily(style.fontFamily);
  const screenW = Math.max(8, widthWorld * z);
  const screenH = Math.max(fontSize * z, heightWorld * z);
  const lineH = Math.max(0.8, Number(style.lineHeight) || 1.4);

  return (
    <CameraOverlayPortal>
      <div
        data-text-inline-editor
        className="pointer-events-auto absolute z-[40]"
        style={{ left: stage.x, top: stage.y, width: screenW, height: screenH }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-[1] h-1.5 w-1.5 -translate-x-[1px] -translate-y-[2px] bg-[#3388ff]"
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => finish(value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              finish(value);
            }
            e.stopPropagation();
          }}
          spellCheck={false}
          className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 shadow-none outline-none ring-0"
          style={{
            fontSize: fontSize * z,
            lineHeight: String(lineH),
            fontFamily: `"${fontFamily}", sans-serif`,
            fontWeight: style.fontWeight as any,
            fontStyle: style.fontStyle as any,
            textDecoration: style.textDecoration || 'none',
            color: style.fill || '#333333',
            caretColor: '#111111',
            textAlign: (style.textAlign as CanvasTextAlign) || 'left',
            letterSpacing: style.letterSpacing ? `${style.letterSpacing * z}px` : undefined,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </CameraOverlayPortal>
  );
}
