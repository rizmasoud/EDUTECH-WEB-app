import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EduTech Web',
  description:
    'Education workflow management system for language institutes - Phase 5: Scheduling Workflow & Proposals',
  openGraph: {
    title: 'EduTech Web',
    description:
      'Education workflow management system for language institutes - Phase 5: Scheduling Workflow & Proposals',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EduTech Web',
    description:
      'Education workflow management system for language institutes - Phase 5: Scheduling Workflow & Proposals',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
