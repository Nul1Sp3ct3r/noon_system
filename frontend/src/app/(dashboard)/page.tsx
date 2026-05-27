'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, Package, FileText, Warehouse } from 'lucide-react';
import StatCard from '@/components/ui/stat-card';
import { admin } from '@/lib/api';

interface Counts { orders: number; products: number; invoices: number; inventoryMovements: number }

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    admin.performance()
      .then(d => setCounts(d.counts as unknown as Counts))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const v = (key: keyof Counts) =>
    loading ? '—' : (counts?.[key] ?? 0).toLocaleString('ar-SA');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">لوحة التحكم</h1>
        <p className="text-slate-500 text-sm mt-1">مرحباً بك في نظام نون المالي</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="إجمالي الطلبات"   value={v('orders')}            icon={ShoppingCart} color="blue" />
        <StatCard label="المنتجات"          value={v('products')}          icon={Package}      color="green" />
        <StatCard label="الفواتير"          value={v('invoices')}          icon={FileText}     color="amber" />
        <StatCard label="حركات المخزون"     value={v('inventoryMovements')} icon={Warehouse}    color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">روابط سريعة</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/orders',        label: 'الطلبات' },
              { href: '/products',      label: 'المنتجات' },
              { href: '/invoices',      label: 'الفواتير' },
              { href: '/reports',       label: 'التقارير' },
              { href: '/vat-center',    label: 'ضريبة القيمة المضافة' },
              { href: '/settlements',   label: 'التسويات' },
            ].map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="flex items-center justify-center p-3 rounded-lg border border-slate-200 hover:border-brand-400 hover:bg-brand-50 text-sm text-slate-700 hover:text-brand-700 transition-colors text-center"
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">حالة النظام</h2>
          <div className="space-y-3">
            {[
              { label: 'قاعدة البيانات',  status: 'متصل',    ok: true },
              { label: 'واجهة برمجة التطبيقات', status: 'نشط',  ok: true },
              { label: 'الاستيراد',       status: 'جاهز',    ok: true },
            ].map(({ label, status, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{label}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
