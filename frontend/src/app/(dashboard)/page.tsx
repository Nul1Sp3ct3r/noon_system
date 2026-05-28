'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, Package, TrendingUp, TrendingDown, AlertCircle, RefreshCw } from 'lucide-react';
import { dashboard } from '@/lib/api';

const fmt = (n: number) =>
  n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DashData = Awaited<ReturnType<typeof dashboard.getData>>;

export default function DashboardPage() {
  const [data, setData]     = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  function load() {
    setLoading(true);
    setError('');
    dashboard.getData()
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل البيانات'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const s = data?.summary;
  const profitable = s && s.netProfit >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">لوحة التحكم</h1>
          <p className="text-slate-500 text-sm mt-1">ملخص الأداء المالي</p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} />
          تحديث
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'إجمالي الإيرادات',
            value: loading ? '—' : `${fmt(s?.revenue ?? 0)} ر.س`,
            sub: 'صافي العائد للطلبات المسلّمة',
            color: 'blue',
          },
          {
            label: 'صافي الربح',
            value: loading ? '—' : `${fmt(s?.netProfit ?? 0)} ر.س`,
            sub: s?.marginPct != null ? `هامش ${s.marginPct.toFixed(2)}%` : '—',
            color: profitable ? 'green' : 'red',
          },
          {
            label: 'طلبات مسلّمة',
            value: loading ? '—' : (s?.deliveredCount ?? 0).toLocaleString('ar-SA'),
            sub: `مرتجعات: ${(s?.returnedCount ?? 0).toLocaleString('ar-SA')}`,
            color: 'amber',
          },
          {
            label: 'إجمالي الرسوم',
            value: loading ? '—' : `${fmt(s?.fees ?? 0)} ر.س`,
            sub: `صافي الدفعة: ${fmt(s?.payout ?? 0)} ر.س`,
            color: 'rose',
          },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="card p-5">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-xl font-bold mb-1 ${
              color === 'blue' ? 'text-blue-700' :
              color === 'green' ? 'text-emerald-700' :
              color === 'red' ? 'text-red-700' :
              color === 'amber' ? 'text-amber-700' : 'text-rose-700'
            }`}>{value}</p>
            <p className="text-xs text-slate-400">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">أعلى المنتجات إيراداً</h2>
          </div>
          <div className="p-4 space-y-2">
            {loading ? (
              <p className="text-center text-slate-400 py-6 text-sm">جارٍ التحميل…</p>
            ) : !data?.topProducts?.length ? (
              <p className="text-center text-slate-400 py-6 text-sm">لا توجد بيانات</p>
            ) : data.topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800 truncate max-w-[160px]">{p.name ?? p.sku}</p>
                    <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-blue-700">{fmt(p.revenue)} ر.س</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">روابط سريعة</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/import',       label: 'استيراد CSV' },
              { href: '/orders',       label: 'الطلبات' },
              { href: '/products',     label: 'المنتجات' },
              { href: '/costs',        label: 'إدارة التكاليف' },
              { href: '/invoices',     label: 'الفواتير' },
              { href: '/reports',      label: 'التقارير' },
              { href: '/vat-center',   label: 'ضريبة القيمة المضافة' },
              { href: '/settlements',  label: 'التسويات' },
              { href: '/calculator',   label: 'حاسبة التسعير' },
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
      </div>
    </div>
  );
}
