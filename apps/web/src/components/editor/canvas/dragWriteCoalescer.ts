import type { VideoGeomOverride } from '@/components/editor/nodes/VideoNode/VideoNodeOverlay';

export type FrameGeomLive = { id: string; x: number; y: number; width: number; height: number };

/**
 * Coalesce high-frequency drag writes (frame Redux + video live geom) to one rAF.
 * Keeps pointer-move SVG preview immediate; only Redux/React state is throttled.
 */
export function createDragWriteCoalescer(
  apply: (batch: {
    frames: FrameGeomLive[];
    videoGeom?: Record<string, VideoGeomOverride> | null;
  }) => void
) {
  let raf = 0;
  const pendingFrames = new Map<string, FrameGeomLive>();
  /** Latest intended video overrides (kept after flush for merge-on-move). */
  let pendingVideo: Record<string, VideoGeomOverride> | null = null;
  let videoDirty = false;

  const runFlush = () => {
    raf = 0;
    const frames = [...pendingFrames.values()];
    pendingFrames.clear();
    const flushVideo = videoDirty;
    videoDirty = false;
    if (!frames.length && !flushVideo) return;
    apply({
      frames,
      videoGeom: flushVideo ? pendingVideo : undefined,
    });
  };

  return {
    queueFrames(frames: FrameGeomLive[]) {
      for (const f of frames) pendingFrames.set(f.id, f);
      if (!raf) raf = requestAnimationFrame(runFlush);
    },
    queueVideoGeom(next: Record<string, VideoGeomOverride> | null) {
      pendingVideo = next;
      videoDirty = true;
      if (!raf) raf = requestAnimationFrame(runFlush);
    },
    getPendingVideoGeom() {
      return pendingVideo;
    },
    /** Drop pending work without applying (commit owns the final document). */
    cancel() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      pendingFrames.clear();
      pendingVideo = null;
      videoDirty = false;
    },
  };
}
