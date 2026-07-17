import type { ComposerContext } from '@/components/editor/panels/AgentComposerInput';

const KEY = 'recombyn-home-agent-boot';

export type HomeAgentBoot = {
  prompt: string;
  autoSubmit: boolean;
  modelId?: string | null;
  imageAspectRatio?: string | null;
  imageQuality?: string | null;
  imageResolution?: string | null;
  attachments?: Array<{
    key: string;
    label: string;
    kind: 'attachment';
    dataUrl?: string;
  }>;
};

export function saveHomeAgentBoot(boot: HomeAgentBoot) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(boot));
  } catch {
    /* quota / private mode */
  }
}

export function takeHomeAgentBoot(): HomeAgentBoot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as HomeAgentBoot;
    if (!parsed?.prompt || typeof parsed.prompt !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function attachmentsFromBoot(boot: HomeAgentBoot | null): ComposerContext[] {
  if (!boot?.attachments?.length) return [];
  return boot.attachments
    .filter((a) => a?.dataUrl)
    .map((a) => ({
      key: a.key,
      label: a.label,
      kind: 'attachment' as const,
      dataUrl: a.dataUrl,
    }));
}
