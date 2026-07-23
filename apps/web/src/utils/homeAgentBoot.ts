import type { ComposerContext } from '@/components/editor/panels/AgentComposerInput';

const KEY = 'recombyn-home-agent-boot';

export type HomeAgentBoot = {
  prompt: string;
  autoSubmit: boolean;
  modelId?: string | null;
  imageAspectRatio?: string | null;
  imageQuality?: string | null;
  imageResolution?: string | null;
  scene?: 'website' | 'mobile' | 'image' | 'poster' | null;
  stylePackId?: number | null;
  templateId?: number | null;
  promptPatternId?: number | null;
  attachments?: Array<{
    key: string;
    label: string;
    kind: 'attachment';
    /** Vision / create_image ref (https upload URL or data URL). */
    dataUrl?: string;
    /** Local preview for thumbnails when dataUrl is a remote URL. */
    thumbUrl?: string;
    /** Object key from POST /api/v1/uploads. */
    uploadKey?: string;
  }>;
};

export function saveHomeAgentBoot(boot: HomeAgentBoot) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(boot));
  } catch {
    /* quota / private mode */
  }
}

/** Read without removing — survives /editor → /editor/:id remount races. */
export function peekHomeAgentBoot(): HomeAgentBoot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeAgentBoot;
    if (!parsed?.prompt || typeof parsed.prompt !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearHomeAgentBoot() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function takeHomeAgentBoot(): HomeAgentBoot | null {
  const boot = peekHomeAgentBoot();
  if (boot) clearHomeAgentBoot();
  return boot;
}

export function attachmentsFromBoot(boot: HomeAgentBoot | null): ComposerContext[] {
  if (!boot?.attachments?.length) return [];
  return boot.attachments
    .filter((a) => a?.dataUrl || a?.thumbUrl)
    .map((a) => ({
      key: a.key,
      label: a.label,
      kind: 'attachment',
      payload: a.label,
      dataUrl: a.dataUrl || a.thumbUrl,
      thumbUrl: a.thumbUrl,
      uploadKey: a.uploadKey,
    }));
}
