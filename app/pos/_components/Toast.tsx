'use client';

import { useEffect } from 'react';
import type { Toast } from './_types';

type Props = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

const ICONS = {
  success: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0">
      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 010 1.06l-5.5 5.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 011.06-1.06l1.97 1.97 4.97-4.97a.75.75 0 011.06 0z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0">
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0">
      <path d="M8 1.5a6.5 6.5 0 100 13A6.5 6.5 0 008 1.5zM7.25 7a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V7zm.75-2.25a.75.75 0 100 1.5.75.75 0 000-1.5z" />
    </svg>
  ),
};

const COLOR = {
  success: 'bg-ok-bg text-ok-fg border-ok-fg/20',
  error: 'bg-danger-bg text-danger-fg border-danger-fg/20',
  info: 'bg-surface text-text border-border',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 3000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={[
        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-[13px] font-medium',
        'shadow-lg min-w-[220px] max-w-[320px]',
        COLOR[toast.type],
      ].join(' ')}
    >
      {ICONS[toast.type]}
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="opacity-60 hover:opacity-100 transition-opacity ml-1 shrink-0"
        aria-label="Dismiss"
      >
        <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3">
          <path d="M2.22 2.22a.75.75 0 011.06 0L6 4.94l2.72-2.72a.75.75 0 111.06 1.06L7.06 6l2.72 2.72a.75.75 0 11-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 01-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 010-1.06z" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
