import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export interface InlineErrorProps {
  message: string | null | undefined;
  /** When given, the alert has a labelled dismiss button. Without it the alert stays until the form is retried or closed. */
  onDismiss?: () => void;
}

/**
 * An error that belongs to a dialog or form, rendered INSIDE it. The full-screen dialog overlay (`z-50`) would
 * cover anything rendered on the page behind it. Persistent (no timer) and announced assertively via role="alert".
 * Server messages may be in any language, hence dir="auto".
 */
export function InlineError({ message, onDismiss }: InlineErrorProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
        <span dir="auto" className="min-w-0 break-words">
          {message}
        </span>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss error" className="shrink-0 text-rose-400 hover:text-rose-200">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
