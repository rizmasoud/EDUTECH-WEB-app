import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-6xl font-bold text-indigo-400">404</h1>
        <h2 className="text-2xl font-semibold">Page Not Found</h2>
        <p className="text-slate-400">
          The requested resource could not be found.
        </p>
        <div className="pt-4">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
