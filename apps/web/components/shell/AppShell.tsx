'use client';

import React, { useEffect, useState } from 'react';
import { LogOut, Menu, RefreshCw, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AcademicTerm, UserAccount } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { roleLabel } from '../../lib/labels';
import { Button } from '../ui/Button';

export interface NavItem {
  id: string;
  /** Always visible text. Navigation is never icon-only. */
  label: string;
  icon: LucideIcon;
}

export interface AppShellProps {
  items: NavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  user: UserAccount;
  terms: AcademicTerm[];
  activeTerm: AcademicTerm | null;
  onSelectTerm: (term: AcademicTerm) => void;
  onRefresh: () => void;
  onLogout: () => void;
  loading?: boolean;
  children: React.ReactNode;
}

function NavList({
  items,
  activeId,
  onNavigate,
}: Pick<AppShellProps, 'items' | 'activeId' | 'onNavigate'>) {
  return (
    <nav aria-label="ناوبری اصلی" className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
              active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100',
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 px-5">
      <span className="text-lg font-bold text-slate-900">EduTech</span>
      <span className="text-sm text-slate-500">مدیریت آموزشگاه</span>
    </div>
  );
}

/**
 * Application shell: one labeled sidebar (right edge in RTL) and one header.
 * RTL is native: the sidebar is the first flex child, spacing uses logical utilities (ms-/me-/start-/end-).
 */
export function AppShell({
  items,
  activeId,
  onNavigate,
  user,
  terms,
  activeTerm,
  onSelectTerm,
  onRefresh,
  onLogout,
  loading = false,
  children,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const navigate = (id: string) => {
    setMenuOpen(false);
    onNavigate(id);
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200">
          <Brand />
        </div>
        <NavList items={items} activeId={activeId} onNavigate={navigate} />
      </aside>

      {/* Sidebar (mobile drawer) */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="منوی اصلی">
          <button
            type="button"
            aria-label="بستن منو"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 start-0 flex w-64 flex-col bg-white shadow-md">
            <div className="flex items-center justify-between border-b border-slate-200 pe-3">
              <Brand />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                <X className="size-4" aria-hidden="true" />
                <span>بستن</span>
              </button>
            </div>
            <NavList items={items} activeId={activeId} onNavigate={navigate} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The single app header */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 lg:px-8">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            icon={<Menu className="size-4" aria-hidden="true" />}
            onClick={() => setMenuOpen(true)}
          >
            منو
          </Button>

          {terms.length > 0 ? (
            <div className="flex items-center gap-2">
              <label htmlFor="app-term-select" className="text-sm text-slate-600">
                ترم
              </label>
              <select
                id="app-term-select"
                value={activeTerm?.id ?? ''}
                onChange={(e) => {
                  const found = terms.find((t) => t.id === e.target.value);
                  if (found) onSelectTerm(found);
                }}
                className="h-8 max-w-48 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              >
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              icon={<RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />}
            >
              به‌روزرسانی
            </Button>
            <div className="flex items-center gap-2 px-2 text-sm text-slate-700">
              <span dir="ltr" className="font-medium">
                {user.personnelCode}
              </span>
              <span className="text-slate-500">({roleLabel(user.roles)})</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={onLogout}
              icon={<LogOut className="size-4 rtl:-scale-x-100" aria-hidden="true" />}
            >
              خروج
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
