/** Editor artboard frame (document.frames). Canvas domain — not Redux-specific. */
export type ArtboardFrame = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  layoutMode?: 'auto' | 'manual';
  /** When true, frame cannot be moved or resized. */
  locked?: boolean;
  /** When true, content outside the frame bounds is clipped (hidden). */
  clipContent?: boolean;
  /** Size before first ratio preset — restored by 「原始」. */
  aspectOriginalWidth?: number;
  aspectOriginalHeight?: number;
  /** Agent / import loading chrome on the artboard itself (not a separate node). */
  processStatus?: 'running' | null;
  processLabel?: string;
  processKind?: 'design' | 'import' | string;
};
