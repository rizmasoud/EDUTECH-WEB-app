import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-bold text-slate-900">صفحه پیدا نشد</h1>
      <p className="mt-1 text-sm text-slate-600">آدرس واردشده وجود ندارد.</p>
      <Link
        href="/"
        className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
      >
        بازگشت به صفحه اصلی
      </Link>
    </div>
  );
}
