import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'نظام نون المالي',
  description: 'نظام إدارة المبيعات والتقارير المالية لسوق نون',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="font-sans">{children}</body>
    </html>
  );
}
