import React from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** The single next step, usually a Button. */
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center">
      {icon ? (
        <div className="mx-auto mb-3 flex size-10 items-center justify-center text-slate-400" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
