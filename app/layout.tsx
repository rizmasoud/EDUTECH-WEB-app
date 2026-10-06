import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduTech Academic Suite",
  description: "Comprehensive school management, automated timetable generation, syllabus tracking, attendance, and administrative dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
