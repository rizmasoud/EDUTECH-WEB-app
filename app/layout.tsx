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
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
