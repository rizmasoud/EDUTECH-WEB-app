import React from 'react';

export interface PageHeaderProps {
  title: string;
  /** One short line of context under the title. */
  description?: React.ReactNode;
  /** Page-level actions (at most one primary button). */
  actions?: React.ReactNode;
}

/** The only place a page title is rendered. Pages must not repeat their title in a second heading. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description ? <div className="mt-1 text-sm text-slate-600">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
