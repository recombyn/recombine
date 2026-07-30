import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/classnames';

/** Toast API and portal container — style aligned message. */

export type ToastType = 'success' | 'error' | 'warning' | 'loading' | 'destructive';

interface ToastItem {
  key: string;
  content: React.ReactNode;
  type: ToastType;
  duration?: number;
  onClose?: () => void;
}

type ToastListener = (messages: ToastItem[]) => void;

class ToastManager {
  private messages: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener([...this.messages]));
  }

  add(item: ToastItem): void {
    // Same type+text already visible → skip (StrictMode remount / double effect).
    if (typeof item.content === 'string') {
      const dup = this.messages.some(
        (m) => m.type === item.type && m.content === item.content
      );
      if (dup) return;
    }
    this.messages.push(item);
    this.notify();
  }

  remove(key: string): void {
    const i = this.messages.findIndex((m) => m.key === key);
    if (i > -1) {
      this.messages.splice(i, 1);
      this.notify();
    }
  }

  getMessages(): ToastItem[] {
    return [...this.messages];
  }
}

const toastManager = new ToastManager();
const genKey = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;

/** Imperative toast helpers. Default 3s auto-dismiss for all types. */
export const message = {
  success: (content: React.ReactNode, duration = 3) =>
    toastManager.add({ key: genKey(), content, type: 'success', duration }),
  error: (content: React.ReactNode, duration = 3) =>
    toastManager.add({ key: genKey(), content, type: 'error', duration }),
  warning: (content: React.ReactNode, duration = 3) =>
    toastManager.add({ key: genKey(), content, type: 'warning', duration }),
  /** Completed delete / irreversible action — red like warning is orange. */
  destructive: (content: React.ReactNode, duration = 3) =>
    toastManager.add({ key: genKey(), content, type: 'destructive', duration }),
  loading: (content: React.ReactNode, duration = 3) => {
    const key = genKey();
    toastManager.add({ key, content, type: 'loading', duration });
    return () => toastManager.remove(key);
  },
};

const SUCCESS_MARK = '#16a34a';

const TOAST_BG: Record<ToastType, string> = {
  success:
    'bg-[var(--surface)] text-[var(--ink)] ring-1 ring-[var(--line)]',
  loading:
    'bg-[var(--surface)] text-[var(--ink)] ring-1 ring-[var(--line)]',
  error: 'bg-[#c00f0c] text-white',
  // Toast pill background (not menu/button) — red, parallel to warning orange.
  destructive: 'bg-[#c00f0c] text-white',
  warning: 'bg-[#e5a000] text-white',
};

const TOAST_MARK: Record<Exclude<ToastType, 'loading'>, string> = {
  success: '#ffffff',
  error: '#c00f0c',
  destructive: '#c00f0c',
  warning: '#e5a000',
};

function ToastMark({
  type,
  color,
}: {
  type: Exclude<ToastType, 'loading'>;
  color: string;
}) {
  if (type === 'success' || type === 'destructive') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="block">
        <path
          d="M2.5 6.1 4.85 8.45 9.5 3.55"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="block">
        <path
          d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="block">
      <path d="M6 2.6v4.4" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="6" cy="9.2" r="1.15" fill={color} />
    </svg>
  );
}

function ToastLoadingMark() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className="block animate-spin"
      style={{ transformOrigin: 'center' }}
    >
      {/* White arc on the green disk — green-on-green looked like a solid dot. */}
      <circle
        cx="6"
        cy="6"
        r="4.25"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="18 40"
      />
    </svg>
  );
}

const ToastItemRow: React.FC<{ item: ToastItem }> = ({ item }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      toastManager.remove(item.key);
      item.onClose?.();
    }, 200);
  }, [item]);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
    if (item.duration != null && item.duration > 0) {
      const t = setTimeout(handleClose, item.duration * 1000);
      return () => clearTimeout(t);
    }
  }, [item.duration, handleClose]);

  const diskColor =
    item.type === 'success' || item.type === 'loading'
      ? SUCCESS_MARK
      : item.type === 'error' || item.type === 'warning' || item.type === 'destructive'
        ? '#ffffff'
        : 'var(--color-text-on-button-base)';

  return (
    <div
      className={cn(
        'rcb-message inline-flex items-center gap-2.5 rounded-full text-sm leading-none shadow-lg shadow-black/15 transition-all duration-200',
        TOAST_BG[item.type],
        isVisible && !isExiting
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-2 pointer-events-none'
      )}
      style={{ padding: '8px 18px 8px 12px' }}
    >
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full bg-current leading-none [&>svg]:block"
        style={{ color: diskColor }}
        aria-hidden
      >
        {item.type === 'loading' ? (
          <ToastLoadingMark />
        ) : (
          <ToastMark type={item.type} color={TOAST_MARK[item.type]} />
        )}
      </span>
      <span className="flex-1 self-center leading-none">{item.content}</span>
    </div>
  );
};

/** Mount once near app root */
export const MessageContainer: React.FC = () => {
  const [messages, setMessages] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsub = toastManager.subscribe(setMessages);
    setMessages(toastManager.getMessages());
    return unsub;
  }, []);

  if (messages.length === 0) return null;

  return createPortal(
    <div className="rcb-message-host fixed top-4 left-1/2 z-[11000] flex -translate-x-1/2 flex-col items-center gap-3 pointer-events-none">
      {messages.map((m) => (
        <div key={m.key} className="pointer-events-auto">
          <ToastItemRow item={m} />
        </div>
      ))}
    </div>,
    document.body
  );
};
