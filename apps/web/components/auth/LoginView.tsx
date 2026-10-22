'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

export interface LoginViewProps {
  personnelCode: string;
  password: string;
  onPersonnelCodeChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  /** Already-localized message to show above the form. */
  error?: string | null;
}

const FIELD =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400';

/**
 * Sign-in screen. It never pre-fills a code or password and sends nothing by itself:
 * a login request is made only when the user submits the form.
 */
export function LoginView({
  personnelCode,
  password,
  onPersonnelCodeChange,
  onPasswordChange,
  onSubmit,
  submitting = false,
  error,
}: LoginViewProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-slate-900">EduTech</p>
          <h1 className="mt-1 text-sm text-slate-600">ورود به سامانه مدیریت آموزشگاه</h1>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
        >
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-1">
            <label htmlFor="login-personnel-code" className="block text-sm font-medium text-slate-800">
              کد پرسنلی
            </label>
            <input
              id="login-personnel-code"
              name="personnelCode"
              type="text"
              dir="ltr"
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              required
              value={personnelCode}
              onChange={(e) => onPersonnelCodeChange(e.target.value)}
              className={`${FIELD} text-start`}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-800">
              رمز عبور
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className={`${FIELD} text-start`}
            />
          </div>

          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            ورود
          </Button>
        </form>
      </div>
    </div>
  );
}
