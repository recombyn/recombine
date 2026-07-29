import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { HiCheck } from 'react-icons/hi2';
import { LuMousePointer2, LuPenTool } from 'react-icons/lu';
import Tooltip from '@/components/base/tooltip';
import { cn } from '@/utils/classnames';

type FloatingToolbarProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Transparent / unstyled chrome (e.g. icon-only host). */
  bare?: boolean;
};

/**
 * Floating editor toolbar chrome — full pill ends (tool strips / HUD).
 */
export const FloatingToolbar = forwardRef<HTMLDivElement, FloatingToolbarProps>(
  function FloatingToolbar({ bare = false, className, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex shrink-0 items-center gap-0.5 whitespace-nowrap',
          bare
            ? 'rounded-full bg-transparent p-0 shadow-none ring-0'
            : 'rounded-full bg-[var(--surface)] px-1.5 py-1 shadow-[0_8px_28px_rgba(15,23,42,0.16)] ring-1 ring-[var(--line)]',
          className
        )}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

export type PathEditSubtool = 'select' | 'pen';

const PATH_EDIT_BTN =
  'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors text-[var(--ink)] hover:bg-[var(--accent-soft)]';
const PATH_EDIT_BTN_ACTIVE = 'bg-[var(--ink)] text-[var(--on-brand)] hover:bg-[var(--ink)]';
/** Done / confirm — solid ink square with check. */
const PATH_EDIT_BTN_DONE =
  'inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--ink)] text-[var(--on-brand)] transition-opacity hover:opacity-90';

export function PathEditToolbar({
  subtool,
  onSubtoolChange,
  onExit,
}: {
  subtool: PathEditSubtool;
  onSubtoolChange: (tool: PathEditSubtool) => void;
  onExit: () => void;
}): ReactNode {
  return (
    <FloatingToolbar className="pointer-events-auto gap-2.5 px-3 py-1.5">
      <Tooltip tip="Select" placement="bottom">
        <button
          type="button"
          aria-label="Select"
          aria-pressed={subtool === 'select'}
          className={cn(PATH_EDIT_BTN, subtool === 'select' && PATH_EDIT_BTN_ACTIVE)}
          onClick={() => onSubtoolChange('select')}
        >
          <LuMousePointer2 className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </Tooltip>
      <Tooltip tip="Pen" placement="bottom">
        <button
          type="button"
          aria-label="Pen"
          aria-pressed={subtool === 'pen'}
          className={cn(PATH_EDIT_BTN, subtool === 'pen' && PATH_EDIT_BTN_ACTIVE)}
          onClick={() => onSubtoolChange('pen')}
        >
          <LuPenTool className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </Tooltip>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden />
      <Tooltip tip="Done (Esc)" placement="bottom">
        <button
          type="button"
          aria-label="Done"
          className={PATH_EDIT_BTN_DONE}
          onClick={onExit}
        >
          <HiCheck className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </Tooltip>
    </FloatingToolbar>
  );
}
