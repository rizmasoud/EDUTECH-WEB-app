import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

export interface ErrorBannerProps {
  /** Short Persian headline. */
  title?: string;
  /** Technical detail from the server; shown as-is, so it may be in any language. */
  message?: string | null;
  onRetry?: () => void;
}

/**
 * Persistent (non-toast) error notice with a retry action. It stays until a later load succeeds, so a failed
 * request is never mistaken for an empty result.
 */
export function ErrorBanner({ title = 'بارگذاری اطلاعات انجام نشد', message, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
    >
      <AlertCircle className="size-5 shrink-0 text-rose-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {message ? (
          <p dir="auto" className="break-words text-rose-800">
            {message}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          تلاش دوباره
        </Button>
      ) : null}
    </div>
  );
}
