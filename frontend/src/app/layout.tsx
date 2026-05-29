import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PreciseFlow | التدفق الدقيق',
  description: 'منصة إدارة مبيعات نون والتقارير المالية — PreciseFlow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="font-sans">{children}</body>
    </html>
  );
}
