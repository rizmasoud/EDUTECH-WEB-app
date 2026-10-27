'use client';

import { Button } from '@/apps/web/components/ui/Button';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-600">The page could not be loaded. Please try again.</p>
      <Button variant="primary" className="mt-5" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
