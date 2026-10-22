import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'در حال بارگذاری…' }: LoadingStateProps) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-600">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
