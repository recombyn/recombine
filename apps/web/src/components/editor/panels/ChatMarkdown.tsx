import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HiOutlineChevronDown, HiOutlineSparkles } from 'react-icons/hi2';
import { cn } from '@/utils/classnames';

const mdClass =
  'chat-md min-w-0 max-w-full overflow-x-hidden break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-[var(--ink)] [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_code]:break-all [&_code]:rounded [&_code]:bg-[var(--accent-soft)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[var(--accent-soft)] [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:break-all [&_a]:text-[var(--accent)] [&_a]:underline [&_h1]:mb-1.5 [&_h1]:mt-2 [&_h1]:text-[15px] [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-1.5 [&_h3]:text-[13px] [&_h3]:font-semibold [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--line)] [&_blockquote]:pl-2.5 [&_blockquote]:text-[var(--muted)] [&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_th]:border [&_th]:border-[var(--line)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-[var(--line)] [&_td]:px-2 [&_td]:py-1';

/** Assistant / user markdown bubble body (GFM via remark-gfm). */
export function ChatMarkdown({ content, className }: { content: string; className?: string }) {
  if (!content) return null;
  return (
    <div className={cn(mdClass, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/** Collapsible DeepSeek thinking / chain-of-thought block. */
export function ChatThinkingBlock({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(Boolean(streaming));
  if (!content && !streaming) return null;

  return (
    <div className="mb-1.5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-[var(--muted)] hover:bg-[var(--accent-soft)]"
        onClick={() => setOpen((v) => !v)}
      >
        <HiOutlineSparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 font-medium">
          {streaming && !content ? '思考中…' : streaming ? '正在思考' : '深度思考'}
        </span>
        <HiOutlineChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div className="max-h-48 overflow-x-hidden overflow-y-auto border-t border-[var(--line)] px-2.5 py-2 text-[12px] leading-relaxed text-[var(--muted)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {content || (streaming ? '…' : '')}
          {streaming && content ? (
            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle opacity-50" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
