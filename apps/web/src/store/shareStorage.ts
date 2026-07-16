import { nanoid } from '@reduxjs/toolkit';

const STORAGE_KEY = 'resume-scene-shares-v1';

export type SharePermission = 'preview' | 'edit';

export type ShareRecord = {
  id: string;
  /** Snapshot of the scene document at share time (edit shares may update). */
  document: unknown;
  name: string;
  permission: SharePermission;
  createdAt: number;
  updatedAt: number;
  /** Template / project id this was created from (optional). */
  sourceTemplateId?: string;
};

function loadAll(): ShareRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.id === 'string' && s.document);
  } catch {
    return [];
  }
}

function saveAll(list: ShareRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getShare(id: string): ShareRecord | null {
  return loadAll().find((s) => s.id === id) || null;
}

export function createShare(opts: {
  document: unknown;
  name: string;
  permission: SharePermission;
  sourceTemplateId?: string;
}): ShareRecord {
  const now = Date.now();
  const record: ShareRecord = {
    id: nanoid(12),
    document: JSON.parse(JSON.stringify(opts.document)),
    name: opts.name || '未命名作品',
    permission: opts.permission,
    createdAt: now,
    updatedAt: now,
    ...(opts.sourceTemplateId ? { sourceTemplateId: opts.sourceTemplateId } : {}),
  };
  const list = loadAll().filter((s) => s.id !== record.id);
  list.unshift(record);
  // Cap local storage growth
  saveAll(list.slice(0, 40));
  return record;
}

export function updateShareDocument(id: string, document: unknown): ShareRecord | null {
  const list = loadAll();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const next = {
    ...list[i],
    document: JSON.parse(JSON.stringify(document)),
    updatedAt: Date.now(),
  };
  list[i] = next;
  saveAll(list);
  return next;
}

export function shareUrl(id: string, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origin}/s/${id}`;
}

export function shareCopyText(record: ShareRecord, url: string) {
  const perm = record.permission === 'edit' ? '可编辑' : '仅预览';
  return [
    `我分享了作品「${record.name}」给你`,
    `权限：${perm}`,
    `链接：${url}`,
  ].join('\n');
}

export async function copyText(text: string) {
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
