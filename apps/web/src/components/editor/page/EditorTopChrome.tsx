import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineHome, HiOutlineShare } from 'react-icons/hi2';
import { TbMessage2Filled } from 'react-icons/tb';
import { Tooltip } from '@/components/base';
import { CollabPresenceBar } from '@/components/editor/collab/CollabRoomProvider';
import { EditorTopExportButton } from '@/components/editor/panels/ExportSelectionPanel';
import { getInspectDockWidth } from '@/components/editor/panels/DevPropertiesPanel';
import WalletAccountChip from '@/components/layout/WalletAccountChip';
import { flushCurrentProjectNow } from '@/components/editor/useProjectCloudSync';

type Props = {
  projectName: string;
  workspaceMode: 'design' | 'dev';
  inspectOpen: boolean;
  agentOpen: boolean;
  onGoHome: () => void;
  onRename: (name: string) => void;
  onShare: () => void;
  onOpenAgent: () => void;
};

/** Top-left home/title + top-right export/share/account/chat. */
function EditorTopChrome({
  projectName,
  workspaceMode,
  inspectOpen,
  agentOpen,
  onGoHome,
  onRename,
  onShare,
  onOpenAgent,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-3 z-20 hidden md:block">
        <div className="pointer-events-auto flex items-center gap-2">
          <Tooltip tip={t('editor.home', { defaultValue: '首页' })} placement="bottom">
            <button
              type="button"
              aria-label={t('editor.home', { defaultValue: '首页' })}
              onClick={onGoHome}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--line)]"
            >
              <HiOutlineHome className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
          <span className="inline-grid min-w-0 max-w-[min(16rem,calc(100vw-18rem))] items-center overflow-hidden">
            <span
              className="invisible col-start-1 row-start-1 max-w-full truncate whitespace-pre px-1 text-[14px] font-medium"
              aria-hidden
            >
              {projectName || ' '}
            </span>
            <input
              value={projectName}
              onChange={(e) => onRename(e.target.value)}
              aria-label={t('home.untitled')}
              title={projectName}
              className="col-start-1 row-start-1 h-8 w-full min-w-0 truncate border-0 bg-transparent px-1 text-[14px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
            />
          </span>
        </div>
      </div>

      <div
        className="pointer-events-none absolute top-3 z-40 hidden md:block"
        style={{
          right: workspaceMode === 'dev' && inspectOpen ? getInspectDockWidth() + 16 : 16,
        }}
      >
        <div className="pointer-events-auto flex items-center gap-2">
          <EditorTopExportButton />
          <Tooltip tip={t('editor.share')} placement="bottom">
            <button
              type="button"
              aria-label={t('editor.share')}
              onClick={onShare}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
            >
              <HiOutlineShare className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {t('editor.share')}
            </button>
          </Tooltip>
          <div className="inline-flex items-center gap-1">
            <CollabPresenceBar />
            <WalletAccountChip />
          </div>
          {!agentOpen ? (
            <button
              type="button"
              onClick={onOpenAgent}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
            >
              <TbMessage2Filled className="h-4 w-4 shrink-0 text-[var(--ink)]" />
              {t('editor.chat')}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

export async function flushAndGoHome(navigate: (path: string) => void) {
  try {
    await flushCurrentProjectNow({ force: true });
  } catch {
    /* still navigate — local draft already holds bytes */
  }
  navigate('/home');
}

export default memo(EditorTopChrome);
