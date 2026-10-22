import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduTech | مدیریت آموزشگاه",
  description: "سامانه مدیریت آموزشگاه زبان: کلاس‌ها، دانش‌آموزان، معلم‌ها و زمان‌بندی.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
