'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { dashboard } from '@/lib/api';

const fmt = (n: number) =>
  n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt0 = (n: number) =>
  n.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type DashData = Awaited<ReturnType<typeof dashboard.getData>>;

const PIE_COLORS = ['#10b981', '#f59e0b'];

export default function DashboardPage() {
  const [data, setData]       = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

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
  const vatRegistered  = s?.vatRegistered  ?? false;
  const profitMode     = s?.profitMode     ?? 'expense';
  const mainProfit     = vatRegistered && profitMode === 'recoverable'
    ? (s?.operationalProfit ?? 0)
    : (s?.netProfit ?? 0);
  const profitable = mainProfit >= 0;

  const pieData = data ? [
    { name: 'مسلّم', value: data.orderStatus?.delivered ?? s?.deliveredCount ?? 0 },
    { name: 'مرتجع', value: data.orderStatus?.returned ?? s?.returnedCount ?? 0 },
  ] : [];

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
        <div className="card p-5">
          <p className="text-xs text-slate-500 mb-1">إجمالي الإيرادات</p>
          <p className="text-xl font-bold mb-1 text-blue-700">{loading ? '—' : `${fmt(s?.revenue ?? 0)} ر.س`}</p>
          <p className="text-xs text-slate-400">صافي العائد للطلبات المسلّمة</p>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between mb-1">
            <p className="text-xs text-slate-500">
              {vatRegistered && profitMode === 'recoverable' ? 'الربح التشغيلي' : 'صافي الربح'}
            </p>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              vatRegistered
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {vatRegistered ? 'مسجل VAT ✓' : 'غير مسجل VAT'}
            </span>
          </div>
          <p className={`text-xl font-bold mb-1 ${profitable ? 'text-emerald-700' : 'text-red-700'}`}>
            {loading ? '—' : `${fmt(mainProfit)} ر.س`}
          </p>
          <p className="text-xs text-slate-400">
            {s?.marginPct != null ? `هامش ${s.marginPct.toFixed(2)}%` : '—'}
          </p>
          {vatRegistered && profitMode === 'recoverable' && !loading && (
            <p className="text-[10px] text-emerald-600 mt-1">
              ضريبة مستردة: {fmt(s?.vatOnFees ?? 0)} ر.س
            </p>
          )}
        </div>

        <div className="card p-5">
          <p className="text-xs text-slate-500 mb-1">طلبات مسلّمة</p>
          <p className="text-xl font-bold mb-1 text-amber-700">
            {loading ? '—' : (s?.deliveredCount ?? 0).toLocaleString('ar-SA')}
          </p>
          <p className="text-xs text-slate-400">مرتجعات: {(s?.returnedCount ?? 0).toLocaleString('ar-SA')}</p>
        </div>

        <div className="card p-5">
          <p className="text-xs text-slate-500 mb-1">إجمالي الرسوم</p>
          <p className="text-xl font-bold mb-1 text-rose-700">
            {loading ? '—' : `${fmt(s?.fees ?? 0)} ر.س`}
          </p>
          <p className="text-xs text-slate-400">صافي الدفعة: {fmt(s?.payout ?? 0)} ر.س</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Line Chart */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-4">الإيرادات اليومية</h2>
          {loading || !data?.dailyRevenue?.length ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              {loading ? 'جارٍ التحميل…' : 'لا توجد بيانات'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.dailyRevenue} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={d => d.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={v => fmt0(v)}
                  width={60}
                />
                <Tooltip
                  formatter={(v) => [`${fmt(Number(v ?? 0))} ر.س`, 'الإيرادات']}
                  labelFormatter={l => `تاريخ: ${l}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Delivered / Returned Doughnut */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">توزيع الطلبات</h2>
          {loading || (pieData[0].value === 0 && pieData[1].value === 0) ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              {loading ? 'جارٍ التحميل…' : 'لا توجد بيانات'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>}
                />
                <Tooltip
                  formatter={(v) => [Number(v ?? 0).toLocaleString('ar-SA'), '']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
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
              { href: '/profitability', label: 'الربحية' },
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
