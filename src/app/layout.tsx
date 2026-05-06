import type { Metadata } from 'next';
import './globals.css';
import { DBProvider } from '@/store/DBContext';
import { ToastProvider } from '@/store/ToastContext';

export const metadata: Metadata = {
  title: 'Crusher ERP — Punjab GST System',
  description: 'Vehicle slips, M-Form invoices, ledger and analytics for stone-crusher plants.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ToastProvider>
          <DBProvider>{children}</DBProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
