import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  type: ToastType;
  message: string;
  onDismiss?: () => void;
}

const STYLES: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
  info: 'border-slate-200 bg-white text-slate-900',
};

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />,
  error: <AlertCircle className="size-5 shrink-0 text-rose-600" aria-hidden="true" />,
  info: <Info className="size-5 shrink-0 text-indigo-600" aria-hidden="true" />,
};

/** Transient notification. Errors are announced assertively, everything else politely. */
export function Toast({ type, message, onDismiss }: ToastProps) {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={cn(
        'fixed bottom-4 start-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-md',
        STYLES[type],
      )}
    >
      {ICONS[type]}
      <p className="min-w-0 flex-1 break-words">{message}</p>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">
          Close
        </button>
      ) : null}
    </div>
  );
}
