'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Package, ShoppingCart, FileText,
  Warehouse, BarChart2, Calculator, TrendingUp,
  CreditCard, ShieldCheck, LogOut, Upload,
} from 'lucide-react';
import { clsx } from 'clsx';
import { auth } from '@/lib/api';
import { clearTokens } from '@/lib/auth';

const NAV = [
  { href: '/',               label: 'لوحة التحكم',  icon: LayoutDashboard },
  { href: '/import',         label: 'الاستيراد',    icon: Upload },
  { href: '/products',       label: 'المنتجات',      icon: Package },
  { href: '/orders',         label: 'الطلبات',       icon: ShoppingCart },
  { href: '/invoices',       label: 'الفواتير',      icon: FileText },
  { href: '/inventory',      label: 'المخزون',       icon: Warehouse },
  { href: '/reports',        label: 'التقارير',      icon: BarChart2 },
  { href: '/vat-center',     label: 'مركز ضريبة القيمة المضافة', icon: Calculator },
  { href: '/profitability',  label: 'الربحية',       icon: TrendingUp },
  { href: '/settlements',    label: 'التسويات',      icon: CreditCard },
  { href: '/admin',          label: 'الإدارة',       icon: ShieldCheck },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    await auth.logout();
    clearTokens();
    router.push('/login');
  }

  return (
    <aside className="fixed inset-y-0 right-0 w-60 bg-sidebar flex flex-col z-30">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-lg">ن</span>
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">نظام نون</p>
          <p className="text-slate-400 text-xs">المالي</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}
