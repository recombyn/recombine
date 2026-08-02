import { useEffect, useRef, useState, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiChevronDown, HiOutlineInformationCircle } from 'react-icons/hi2';
import {
  createShareApi,
  lookupUsersApi,
  searchUsersApi,
  updateShareDocumentApi,
  updateShareMetaApi,
  type DirectoryUser,
  type ShareDto,
  type SharePermission,
} from '@/apis/shares';
import { Dialog, Dropdown, Switch, message } from '@/components/base';
import { UserAvatar } from '@/components/layout/UserAccountPanel';
import { PlazaPublishForm } from '@/components/templates/PlazaPublishDialog';
import { submitToPlaza } from '@/apis/plaza';
import { fetchProject } from '@/apis/projects';
import { coverDocumentHasContent } from '@/utils/plazaCover';
import { normalizeProjectThumbnailUrls } from '@/utils/projectThumb';
import { cn } from '@/utils/classnames';
import { isOwnedTemplate } from '@/utils/templatesStorage';
import { getToken } from '@/utils/token';
import { buildLoginUrl } from '@/utils/authReturnTo';
import { useNavigate } from 'react-router-dom';
import { setTemplateThumbnail } from '@/store/modules/editor';

type Props = {
  open: boolean;
  onClose: () => void;
};

type LinkAccess = 'edit' | 'download' | 'view';
type DialogTab = 'share' | 'publish';

function shareUrl(id: string, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origin}/s/${id}`;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function permissionFromLinkAccess(access: LinkAccess): SharePermission {
  if (access === 'edit') return 'edit';
  if (access === 'download') return 'download';
  return 'preview';
}

function linkAccessFromPermission(permission: string | undefined): LinkAccess {
  if (permission === 'edit') return 'edit';
  if (permission === 'download') return 'download';
  return 'view';
}

function accessLabelKey(access: LinkAccess): 'editor.shareCanEdit' | 'editor.shareCanDownload' | 'editor.shareCanView' {
  if (access === 'edit') return 'editor.shareCanEdit';
  if (access === 'download') return 'editor.shareCanDownload';
  return 'editor.shareCanView';
}

function resolveProjectDisplayName(opts: {
  templateName?: string;
  documentName?: string;
  fallback: string;
}): string {
  return opts.templateName || String(opts.documentName || '') || opts.fallback;
}

function inviteMetaPayload(opts: {
  userId: string;
  asEditor: boolean;
  linkAccess: LinkAccess;
  editorIds: string[];
  viewerIds: string[];
}): {
  permission: SharePermission;
  linkPublic?: boolean;
  editorUserIds: string[];
  viewerUserIds: string[];
} {
  if (opts.asEditor) {
    return {
      permission: 'edit',
      linkPublic: false,
      editorUserIds: [...opts.editorIds, opts.userId],
      viewerUserIds: opts.viewerIds.filter((id) => id !== opts.userId),
    };
  }
  return {
    permission: permissionFromLinkAccess(opts.linkAccess),
    editorUserIds: opts.editorIds,
    viewerUserIds: [...opts.viewerIds, opts.userId],
  };
}

function collaboratorRolePayload(opts: {
  userId: string;
  role: 'edit' | 'view';
  editorIds: string[];
  viewerIds: string[];
  linkAccess: LinkAccess;
}): {
  permission: SharePermission;
  linkPublic: boolean;
  editorUserIds: string[];
  viewerUserIds: string[];
} {
  let nextEditors = opts.editorIds.filter((id) => id !== opts.userId);
  let nextViewers = opts.viewerIds.filter((id) => id !== opts.userId);
  if (opts.role === 'edit') nextEditors = [...nextEditors, opts.userId];
  else nextViewers = [...nextViewers, opts.userId];
  return {
    permission: nextEditors.length ? 'edit' : 'preview',
    linkPublic: opts.linkAccess === 'view' || opts.linkAccess === 'download',
    editorUserIds: nextEditors,
    viewerUserIds: nextViewers,
  };
}

function assertCanPublishToPlaza(opts: {
  hasToken: boolean;
  document: unknown;
  projectId: string;
  currentTpl: { source?: string } | undefined;
  isOwned: (tpl: { source?: string }) => boolean;
}): 'ok' | 'login_required' | 'no_document' | 'empty_canvas' | 'need_owned_project' {
  if (!opts.hasToken) return 'login_required';
  if (!opts.document) return 'no_document';
  if (!coverDocumentHasContent(opts.document as any)) return 'empty_canvas';
  if (!opts.projectId || (opts.currentTpl && !opts.isOwned(opts.currentTpl))) {
    return 'need_owned_project';
  }
  return 'ok';
}

function ShareDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const document = useSelector((s: any) => s.editor.document);
  const currentId = useSelector((s: any) => s.editor.currentId as string | null);
  const templates = useSelector(
    (s: any) =>
      s.editor.templates as Array<{
        id: string;
        name?: string;
        source?: string;
        thumbnail?: string | string[] | null;
        updatedAt?: number;
      }>
  );
  const me = useSelector((s: any) => s.auth?.user as { id?: string; name?: string; email?: string; avatar?: string } | null);
  const currentTpl = templates.find((tItem) => tItem.id === currentId);
  const projectName = resolveProjectDisplayName({
    templateName: currentTpl?.name,
    documentName: document?.name,
    fallback: t('home.untitled', { defaultValue: '未命名作品' }),
  });
  const coverUrls = normalizeProjectThumbnailUrls(
    currentTpl?.thumbnail,
    currentTpl?.updatedAt
  );

  const [tab, setTab] = useState<DialogTab>('share');
  const [publishPhase, setPublishPhase] = useState<'confirm' | 'success'>('confirm');
  const [publishing, setPublishing] = useState(false);
  const [record, setRecord] = useState<ShareDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkEnabled, setLinkEnabled] = useState(true);
  const [linkAccess, setLinkAccess] = useState<LinkAccess>('view');
  const [editorIds, setEditorIds] = useState<string[]>([]);
  const [viewerIds, setViewerIds] = useState<string[]>([]);
  const [collaborators, setCollaborators] = useState<
    Array<DirectoryUser & { role: 'edit' | 'view' }>
  >([]);
  const [inviteQuery, setInviteQuery] = useState('');
  const [searchHits, setSearchHits] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<DirectoryUser | null>(null);
  const [inviting, setInviting] = useState(false);
  const searchTimer = useRef<number | null>(null);
  /** StrictMode remounts effects once in dev — avoid duplicate toasts per open. */
  const noDocWarnedRef = useRef(false);
  /** Shared create promise — StrictMode remount must not fire /shares twice. */
  const createShareInflightRef = useRef<Promise<{ share: ShareDto }> | null>(null);
  /** Only the latest open-session applies results / clears busy. */
  const createGenRef = useRef(0);

  const url = record && linkEnabled ? shareUrl(record.id) : '';
  const linkReady = Boolean(record) && !busy;
  const linkOn = linkReady && linkEnabled;

  const accessLabel = (access: LinkAccess) => t(accessLabelKey(access));

  // Enter Share/Publish: refresh stored collage URLs and pin them to current origin.
  useEffect(() => {
    if (!open || !currentId || !getToken()) return;
    let cancelled = false;
    void fetchProject(currentId)
      .then((res) => {
        if (cancelled) return;
        const thumbs = normalizeProjectThumbnailUrls(
          res.project?.thumbnailUrl,
          res.project?.updatedAt
        );
        if (!thumbs.length) return;
        dispatch(
          setTemplateThumbnail({
            id: currentId,
            thumbnail: thumbs.length === 1 ? thumbs[0] : thumbs,
            custom: Boolean(res.project?.thumbnailCustom),
          })
        );
      })
      .catch(() => {
        /* keep in-memory collage if list fetch fails */
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentId, dispatch]);

  useEffect(() => {
    if (!open) {
      createGenRef.current += 1;
      createShareInflightRef.current = null;
      setRecord(null);
      setBusy(false);
      setLinkEnabled(true);
      setTab('share');
      setPublishPhase('confirm');
      setPublishing(false);
      setInviteQuery('');
      setSearchHits([]);
      setSelectedInvite(null);
      noDocWarnedRef.current = false;
      return;
    }
    if (!document) {
      createGenRef.current += 1;
      createShareInflightRef.current = null;
      setRecord(null);
      setBusy(false);
      if (!noDocWarnedRef.current) {
        noDocWarnedRef.current = true;
        message.warning(t('editor.shareNoDocument'));
      }
      return;
    }
    const gen = ++createGenRef.current;
    setBusy(true);
    if (!createShareInflightRef.current) {
      createShareInflightRef.current = createShareApi({
        document,
        name: projectName,
        permission: 'preview',
        sourceProjectId: currentId || undefined,
        editorUserIds: [],
        viewerUserIds: [],
        // Match default "Can view" / anyone-with-link UI.
        linkPublic: true,
      });
    }
    void createShareInflightRef.current
      .then((res) => {
        if (createGenRef.current !== gen) return;
        const s = res.share;
        setRecord(s);
        const enabled = s.linkEnabled !== false;
        setLinkEnabled(enabled);
        const access = linkAccessFromPermission(s.permission);
        setLinkAccess(access);
        setEditorIds(Array.isArray(s.editorUserIds) ? s.editorUserIds : []);
        setViewerIds(Array.isArray(s.viewerUserIds) ? s.viewerUserIds : []);
        // Older rows were created with linkPublic:false while the UI still showed
        // "anyone with the link". Promote so Copy link actually works for viewers.
        if (enabled && access !== 'edit' && s.linkPublic === false) {
          void updateShareMetaApi(s.id, { linkPublic: true })
            .then((patched) => {
              if (createGenRef.current !== gen) return;
              setRecord(patched.share);
            })
            .catch(() => {
              /* keep local UI; copy still works for owner */
            });
        }
      })
      .catch(() => {
        if (createGenRef.current !== gen) return;
        createShareInflightRef.current = null;
        setRecord(null);
        setLinkEnabled(false);
        message.error(t('editor.shareCopyFailed'));
      })
      .finally(() => {
        if (createGenRef.current === gen) setBusy(false);
      });
    // No cleanup bump — StrictMode remount reuses the same in-flight create.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCollaborators([]);
      return;
    }
    const ids = [...new Set([...editorIds, ...viewerIds])];
    if (!ids.length) {
      setCollaborators([]);
      return;
    }
    let cancelled = false;
    void lookupUsersApi({ ids: ids.filter(Boolean).join(',') })
      .then((res) => {
        if (cancelled) return;
        const editorSet = new Set(editorIds);
        setCollaborators(
          (res.items || []).map((u) => ({
            ...u,
            role: editorSet.has(u.id) ? ('edit' as const) : ('view' as const),
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setCollaborators([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editorIds, viewerIds]);

  useEffect(() => {
    if (!open) return;
    const q = inviteQuery.trim();
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (q.length < 1) {
      setSearchHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = window.setTimeout(() => {
      void searchUsersApi({ q, limit: 12 })
        .then((res) => setSearchHits(res.items || []))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [inviteQuery, open]);

  const patchMeta = async (next: {
    permission?: SharePermission;
    editorUserIds?: string[];
    viewerUserIds?: string[];
    linkEnabled?: boolean;
    linkPublic?: boolean;
  }) => {
    if (!record?.id) return null;
    try {
      const res = await updateShareMetaApi(record.id, next);
      setRecord(res.share);
      if (typeof next.linkEnabled === 'boolean') setLinkEnabled(res.share.linkEnabled !== false);
      if (next.permission) setLinkAccess(linkAccessFromPermission(res.share.permission));
      if (next.editorUserIds) setEditorIds(res.share.editorUserIds || []);
      if (next.viewerUserIds) setViewerIds(res.share.viewerUserIds || []);
      return res.share;
    } catch {
      message.error(t('editor.shareUpdateFailed'));
      return null;
    }
  };

  const onToggleLink = (on: boolean) => {
    setLinkEnabled(on);
    void patchMeta({
      linkEnabled: on,
      linkPublic: on && (linkAccess === 'view' || linkAccess === 'download'),
    });
  };

  const onPickAccess = (access: LinkAccess) => {
    setLinkAccess(access);
    const permission = permissionFromLinkAccess(access);
    void patchMeta({
      permission,
      linkPublic: access === 'view' || access === 'download',
      editorUserIds: permission === 'edit' ? editorIds : [],
      viewerUserIds: viewerIds,
    });
  };

  const onInvite = async () => {
    const user = selectedInvite;
    if (!user?.id || !record?.id) return;
    if (user.id === me?.id) {
      message.warning(t('editor.shareInviteSelf'));
      return;
    }
    if (editorIds.includes(user.id) || viewerIds.includes(user.id)) {
      message.warning(t('editor.shareAlreadyCollaborator'));
      return;
    }
    setInviting(true);
    const saved = await patchMeta(
      inviteMetaPayload({
        userId: user.id,
        asEditor: linkAccess === 'edit',
        linkAccess,
        editorIds,
        viewerIds,
      })
    );
    setInviting(false);
    if (!saved) return;
    setInviteQuery('');
    setSelectedInvite(null);
    setSearchHits([]);
    message.success(t('editor.shareInviteOk'));
  };

  const onRemoveCollaborator = (userId: string) => {
    const nextEditors = editorIds.filter((id) => id !== userId);
    const nextViewers = viewerIds.filter((id) => id !== userId);
    setEditorIds(nextEditors);
    setViewerIds(nextViewers);
    void patchMeta({
      permission: nextEditors.length || linkAccess === 'edit' ? 'edit' : 'preview',
      editorUserIds: nextEditors,
      viewerUserIds: nextViewers,
    });
  };

  const onSetCollaboratorRole = (userId: string, role: 'edit' | 'view') => {
    const payload = collaboratorRolePayload({
      userId,
      role,
      editorIds,
      viewerIds,
      linkAccess,
    });
    setEditorIds(payload.editorUserIds);
    setViewerIds(payload.viewerUserIds);
    void patchMeta(payload);
  };

  const onCopyLink = async () => {
    if (!record || !linkEnabled) return;
    if (document) {
      try {
        await updateShareDocumentApi(record.id, document);
      } catch {
        /* still copy current link */
      }
    }
    try {
      await copyText(shareUrl(record.id));
      message.success(t('editor.shareLinkCopied'));
    } catch {
      message.error(t('editor.shareCopyFailed'));
    }
  };

  const commitPublish = async () => {
    const gate = assertCanPublishToPlaza({
      hasToken: Boolean(getToken()),
      document,
      projectId: String(currentId || '').trim(),
      currentTpl,
      isOwned: isOwnedTemplate,
    });
    switch (gate) {
      case 'login_required':
        navigate(buildLoginUrl(window.location.pathname + window.location.search));
        throw new Error('login_required');
      case 'no_document':
        message.warning(t('editor.shareNoDocument'));
        throw new Error('no_document');
      case 'empty_canvas':
        message.warning(t('plaza.emptyCanvas'));
        throw new Error('empty_canvas');
      case 'need_owned_project':
        message.warning(t('plaza.needOwnedProject', { defaultValue: '请先保存为项目后再发布' }));
        throw new Error('need_owned_project');
      default:
        break;
    }
    const projectId = String(currentId || '').trim();
    setPublishing(true);
    try {
      await submitToPlaza({
        projectId,
        title: projectName,
        category: 'website',
        document,
        thumbnailUrl: String(coverUrls[0] || '').trim() || null,
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message;
      message.error(typeof detail === 'string' ? detail : t('plaza.submitFailed'));
      throw err;
    } finally {
      setPublishing(false);
    }
  };

  const ownerName = me?.name || me?.email || 'User';
  const inviteDisabled = !selectedInvite || inviting || busy;
  const showPublishThanks = tab === 'publish' && publishPhase === 'success';

  return (
    <Dialog
      show={open}
      onClose={() => {
        if (!publishing) onClose();
      }}
      width={showPublishThanks ? 440 : 520}
      className="!rounded-2xl !bg-[var(--surface)]"
      title={
        showPublishThanks ? undefined : (
          <div className="flex items-end gap-5 pr-8">
            {(
              [
                { id: 'share' as const, label: t('editor.shareTabShare') },
                { id: 'publish' as const, label: t('editor.shareTabPublish') },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (publishing) return;
                  setTab(item.id);
                  if (item.id === 'publish') setPublishPhase('confirm');
                }}
                className={cn(
                  'relative pb-2 text-[15px] font-medium transition-colors',
                  tab === item.id ? 'text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'
                )}
              >
                {item.label}
                {tab === item.id ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--ink)]" />
                ) : null}
              </button>
            ))}
          </div>
        )
      }
    >
      {tab === 'publish' ? (
        <PlazaPublishForm
          publishing={publishing}
          projectId={currentId || undefined}
          projectName={projectName}
          document={document}
          coverUrls={coverUrls}
          coverVersion={Number(currentTpl?.updatedAt) || undefined}
          onCancel={onClose}
          onSubmit={commitPublish}
          onSuccessDone={onClose}
          onPhaseChange={setPublishPhase}
        />
      ) : (
        <div className="space-y-6 pt-1">
          <section className="space-y-3">
            <h3 className="text-[15px] font-semibold leading-none text-[var(--ink)]">
              {t('editor.shareLinkSection')}
            </h3>
            <div className="flex items-center gap-3">
              <Switch checked={linkOn} onChange={onToggleLink} disabled={!linkReady} />
              <span className="min-w-0 text-[13px] leading-snug text-[var(--muted)]">
                {linkOn ? t('editor.shareLinkOn') : t('editor.shareLinkOff')}
              </span>
            </div>

            {linkOn ? (
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5">
                  <span className="min-w-0 flex-1 truncate py-2 text-[13px] text-[var(--ink)]">
                    {t('editor.shareAnyoneWithLink')}
                  </span>
                  <Dropdown
                    trigger="click"
                    placement="bottom-end"
                    selectedKeys={[linkAccess]}
                    floatingClassName="z-[9100]"
                    popupClassName="min-w-[140px] !rounded-xl"
                    itemClassName="aria-selected:!bg-transparent hover:!bg-transparent"
                    items={[
                      { key: 'edit', label: t('editor.shareCanEdit') },
                      { key: 'download', label: t('editor.shareCanDownload') },
                      { key: 'view', label: t('editor.shareCanView') },
                    ]}
                    onClick={(key) => onPickAccess(key as LinkAccess)}
                  >
                    <button
                      type="button"
                      disabled={!linkReady}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[13px] text-[var(--ink)] disabled:opacity-50"
                    >
                      {accessLabel(linkAccess)}
                      <HiChevronDown
                        className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]"
                        aria-hidden
                      />
                    </button>
                  </Dropdown>
                </div>
                <button
                  type="button"
                  disabled={!url || busy}
                  onClick={() => void onCopyLink()}
                  className="inline-flex h-9 w-[108px] shrink-0 items-center justify-center rounded-lg bg-[var(--ink)] px-3 text-[13px] font-medium text-[var(--on-brand)] disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
                >
                  {t('editor.shareCopyLink')}
                </button>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-[15px] font-semibold leading-none text-[var(--ink)]">
              {t('editor.shareInviteTitle')}
              <span
                className="inline-flex text-[var(--muted)]"
                title={t('editor.shareInviteHint')}
              >
                <HiOutlineInformationCircle className="h-4 w-4" aria-hidden />
                <span className="sr-only">{t('editor.shareInviteHint')}</span>
              </span>
            </h3>
            <div className="flex items-start gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  value={inviteQuery}
                  onChange={(e) => {
                    setInviteQuery(e.target.value);
                    setSelectedInvite(null);
                  }}
                  placeholder={t('editor.shareInvitePlaceholder')}
                  className="h-9 w-full truncate rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--ink)]/30"
                />
                {(searching || searchHits.length > 0) && inviteQuery.trim() && !selectedInvite ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-48 overflow-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] py-1 shadow-lg">
                    {searching && !searchHits.length ? (
                      <div className="px-3 py-2 text-[12px] text-[var(--muted)]">Loading...</div>
                    ) : null}
                    {searchHits.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--accent-soft)]"
                        onClick={() => {
                          setSelectedInvite(u);
                          setInviteQuery(u.email || u.name || u.id);
                          setSearchHits([]);
                        }}
                      >
                        <UserAvatar name={u.name} email={u.email} avatar={u.avatar} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-[var(--ink)]">
                            {u.name}
                          </span>
                          <span className="block truncate text-[12px] text-[var(--muted)]">
                            {u.email || u.id}
                          </span>
                        </span>
                      </button>
                    ))}
                    {!searching && !searchHits.length ? (
                      <div className="px-3 py-2 text-[12px] text-[var(--muted)]">
                        {t('editor.shareInviteEmpty')}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                disabled={inviteDisabled}
                onClick={() => void onInvite()}
                className={cn(
                  'inline-flex h-9 w-[108px] shrink-0 items-center justify-center rounded-lg px-3 text-[13px] font-medium',
                  inviteDisabled
                    ? 'cursor-not-allowed bg-[var(--accent-soft)] text-[var(--muted)]'
                    : 'bg-[var(--ink)] text-[var(--on-brand)] hover:opacity-90'
                )}
              >
                {t('editor.shareInviteAction')}
              </button>
            </div>

            <div className="space-y-1 pt-1">
              <div className="text-[13px] text-[var(--muted)]">{t('editor.shareCollaborators')}</div>
              <ul className="max-h-[220px] space-y-0.5 overflow-y-auto">
                <li className="flex items-center gap-2.5 py-2">
                  <UserAvatar name={me?.name} email={me?.email} avatar={me?.avatar} size={32} />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--ink)]">
                    {ownerName}
                    <span className="text-[var(--muted)]"> [{t('editor.shareMe')}]</span>
                  </span>
                  <span className="shrink-0 text-[13px] text-[var(--muted)]">
                    {t('editor.shareOwner')}
                  </span>
                </li>
                {collaborators.map((u) => (
                  <li key={u.id} className="flex items-center gap-2.5 py-2">
                    <UserAvatar name={u.name} email={u.email} avatar={u.avatar} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--ink)]">
                      {u.name || u.email || u.id}
                    </span>
                    <Dropdown
                      trigger="click"
                      placement="bottom-end"
                      floatingClassName="z-[9100]"
                      popupClassName="min-w-[140px] !rounded-xl"
                      itemClassName="aria-selected:!bg-transparent hover:!bg-transparent"
                      selectedKeys={[u.role]}
                      items={[
                        { key: 'edit', label: t('editor.shareCanEdit') },
                        { key: 'view', label: t('editor.shareCanView') },
                        { key: 'remove', label: t('editor.shareRemoveCollaborator') },
                      ]}
                      onClick={(key) => {
                        if (key === 'remove') onRemoveCollaborator(u.id);
                        else if (key === 'edit' || key === 'view') onSetCollaboratorRole(u.id, key);
                      }}
                    >
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-0.5 text-[13px] text-[var(--muted)] hover:text-[var(--ink)]"
                      >
                        {u.role === 'edit' ? t('editor.shareCanEdit') : t('editor.shareCanView')}
                        <HiChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </button>
                    </Dropdown>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}

export default memo(ShareDialog);
