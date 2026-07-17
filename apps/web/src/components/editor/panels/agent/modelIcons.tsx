/**
 * Brand icons for LLM / image models — sourced from `src/assets/model`.
 */

import deepseek from '@/assets/model/deepseek.png';
import qwen from '@/assets/model/qwen.png';
import gemini from '@/assets/model/gemini.png';
import claude from '@/assets/model/claude.png';
import seedream from '@/assets/model/seedream.png';
import dreamina from '@/assets/model/dreamina.png';
import gptImage from '@/assets/model/gpt_image.png';
import flux from '@/assets/model/flux_kontext_pro.png';
import ideogram from '@/assets/model/ideogram.png';
import kling from '@/assets/model/kling.png';
import sora from '@/assets/model/sora.png';
import minimax from '@/assets/model/minimax_music.png';
import elevenlabs from '@/assets/model/elevenlabs_turbo.png';
import syncLipsync from '@/assets/model/sync_lipsync.png';
import { cn } from '@/utils/classnames';

export type ModelIconRef = {
  id?: string | null;
  provider?: string | null;
  kind?: string | null;
  label?: string | null;
};

const RULES: Array<{ test: (s: string) => boolean; src: string }> = [
  { test: (s) => s.includes('deepseek'), src: deepseek },
  { test: (s) => s.includes('seedream'), src: seedream },
  { test: (s) => s.includes('dreamina'), src: dreamina },
  { test: (s) => s.includes('qwen') || s.includes('dashscope'), src: qwen },
  { test: (s) => s.includes('gemini') || s.includes('google'), src: gemini },
  { test: (s) => s.includes('claude') || s.includes('anthropic'), src: claude },
  { test: (s) => s.includes('gpt') || s.includes('openai'), src: gptImage },
  { test: (s) => s.includes('flux'), src: flux },
  { test: (s) => s.includes('ideogram'), src: ideogram },
  { test: (s) => s.includes('kling'), src: kling },
  { test: (s) => s.includes('sora'), src: sora },
  { test: (s) => s.includes('minimax'), src: minimax },
  { test: (s) => s.includes('eleven'), src: elevenlabs },
  { test: (s) => s.includes('lipsync') || s.includes('sync'), src: syncLipsync },
  { test: (s) => s.includes('doubao') || s.includes('豆包'), src: dreamina },
  { test: (s) => s.includes('moonshot') || s.includes('kimi'), src: gptImage },
];

const BY_PROVIDER: Record<string, string> = {
  deepseek,
  doubao: dreamina,
  qwen,
  dashscope: qwen,
  gemini,
  google: gemini,
  anthropic: claude,
  openai: gptImage,
  moonshot: gptImage,
};

/** Resolve a PNG from `assets/model` for a catalog model. */
export function resolveModelIconSrc(model?: ModelIconRef | null): string {
  const id = String(model?.id || '').toLowerCase();
  const provider = String(model?.provider || '').toLowerCase();
  const label = String(model?.label || '').toLowerCase();
  const blob = `${id} ${provider} ${label}`;

  for (const rule of RULES) {
    if (rule.test(blob)) return rule.src;
  }
  if (provider && BY_PROVIDER[provider]) return BY_PROVIDER[provider];
  if (model?.kind === 'image') return seedream;
  return deepseek;
}

/** Inline brand mark for model pickers / composer trigger. */
export function ModelBrandIcon({
  model,
  className,
  size = 16,
}: {
  model?: ModelIconRef | null;
  className?: string;
  size?: number;
}) {
  const src = resolveModelIconSrc(model);
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
