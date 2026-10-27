import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduTech | School Management",
  description: "Language school management: classes, students, teachers and scheduling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
