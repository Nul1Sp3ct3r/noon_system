'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { reports as api, downloadExport } from '@/lib/api';
import type { PlRow, SalesRow, FeesRow } from '@/lib/types';

const YEAR = new Date().getFullYear();
type Tab = 'pl' | 'sales' | 'fees';

export default function ReportsPage() {
  const [tab, setTab]   = useState<Tab>('pl');
  const [year, setYear] = useState(YEAR);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [plRows, setPlRows]       = useState<PlRow[]>([]);
  const [salesRows, setSalesRows] = useState<SalesRow[]>([]);
  const [feesRows, setFeesRows]   = useState<FeesRow[]>([]);
  const [sortBy, setSortBy]       = useState('revenue');
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const type = tab === 'pl' ? 'pl' : tab === 'sales' ? 'sales' : 'fees';
      await downloadExport(type, { year });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التصدير');
    } finally {
      setExporting(false);
    }
  }

  const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt0 = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  useEffect(() => {
    setLoading(true);
    setError('');
    const load =
      tab === 'pl'    ? () => api.pl(year).then(r => setPlRows(r)) :
      tab === 'sales' ? () => api.sales({ year, sortBy }).then(r => setSalesRows(r)) :
                        () => api.fees({ year }).then(r => setFeesRows(r));

    load()
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل التقرير'))
      .finally(() => setLoading(false));
  }, [tab, year, sortBy]);

  const plTotals = plRows.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, totalFees: a.totalFees + r.totalFees, cogs: a.cogs + r.cogs, netProfit: a.netProfit + r.netProfit }),
    { revenue: 0, totalFees: 0, cogs: 0, netProfit: 0 },
  );

  const salesTotals = salesRows.reduce(
    (a, r) => ({ units: a.units + r.units, revenue: a.revenue + r.revenue, fees: a.fees + r.fees, cogs: a.cogs + r.cogs, profit: a.profit + r.profit }),
    { units: 0, revenue: 0, fees: 0, cogs: 0, profit: 0 },
  );

  const feesTotals = feesRows.reduce(
    (a, r) => ({ units: a.units + r.units, referralFees: a.referralFees + r.referralFees, fbnFees: a.fbnFees + r.fbnFees, totalFees: a.totalFees + r.totalFees }),
    { units: 0, referralFees: 0, fbnFees: 0, totalFees: 0 },
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">التقارير</h1>
        <div className="flex items-center gap-2">
          <select className="input w-28 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[YEAR, YEAR - 1, YEAR - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="btn-ghost flex items-center gap-1.5 text-sm border border-slate-200"
          >
            <Download size={14} />
            {exporting ? 'جارٍ…' : 'تصدير Excel'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          { id: 'pl',    label: 'الأرباح والخسائر' },
          { id: 'sales', label: 'المبيعات بالمنتج' },
          { id: 'fees',  label: 'الرسوم بالمنتج' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* P&L Tab */}
      {tab === 'pl' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'الإيرادات',    value: plTotals.revenue,    color: 'text-emerald-600' },
              { label: 'الرسوم',       value: plTotals.totalFees,  color: 'text-amber-600' },
              { label: 'تكلفة البضاعة', value: plTotals.cogs,      color: 'text-orange-600' },
              { label: 'صافي الربح',   value: plTotals.netProfit,  color: plTotals.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-4">
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{fmt(value)} ر.س</p>
              </div>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['الشهر', 'الإيرادات', 'الرسوم', 'تكلفة البضاعة', 'مجمل الربح', 'صافي الربح'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
                ) : plRows.length === 0 ? (
                  <tr><td colSpan={6} className="table-td text-center py-10 text-slate-400">لا توجد بيانات لهذه السنة</td></tr>
                ) : plRows.map(r => (
                  <tr key={r.month} className="hover:bg-slate-50">
                    <td className="table-td font-medium">{r.month}</td>
                    <td className="table-td text-emerald-600">{fmt(r.revenue)}</td>
                    <td className="table-td text-amber-600">{fmt(r.totalFees)}</td>
                    <td className="table-td text-orange-600">{fmt(r.cogs)}</td>
                    <td className="table-td">{fmt(r.grossProfit)}</td>
                    <td className={`table-td font-semibold ${r.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmt(r.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Sales Tab */}
      {tab === 'sales' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 flex-1 ml-4">
              {[
                { label: 'وحدات', value: salesTotals.units.toLocaleString('ar-SA'), color: 'text-slate-700' },
                { label: 'إيرادات', value: `${fmt(salesTotals.revenue)} ر.س`, color: 'text-emerald-600' },
                { label: 'رسوم', value: `${fmt(salesTotals.fees)} ر.س`, color: 'text-amber-600' },
                { label: 'تكلفة', value: `${fmt(salesTotals.cogs)} ر.س`, color: 'text-orange-600' },
                { label: 'ربح', value: `${fmt(salesTotals.profit)} ر.س`, color: salesTotals.profit >= 0 ? 'text-emerald-600' : 'text-red-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="card p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`font-bold text-sm mt-0.5 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <select className="input w-36 text-sm flex-shrink-0" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="revenue">ترتيب: الإيرادات</option>
              <option value="profit">ترتيب: الربح</option>
              <option value="units">ترتيب: الوحدات</option>
            </select>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['SKU', 'الاسم', 'الماركة', 'الوحدات', 'الإيرادات', 'الرسوم', 'التكلفة', 'الربح'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
                ) : salesRows.length === 0 ? (
                  <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">لا توجد بيانات</td></tr>
                ) : salesRows.map(r => (
                  <tr key={r.sku} className="hover:bg-slate-50">
                    <td className="table-td font-mono text-xs">{r.sku}</td>
                    <td className="table-td">{r.name || '—'}</td>
                    <td className="table-td">{r.brand || '—'}</td>
                    <td className="table-td">{r.units.toLocaleString('ar-SA')}</td>
                    <td className="table-td text-emerald-600">{fmt0(r.revenue)}</td>
                    <td className="table-td text-amber-600">{fmt0(r.fees)}</td>
                    <td className="table-td text-orange-600">{fmt0(r.cogs)}</td>
                    <td className={`table-td font-semibold ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmt0(r.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Fees Tab */}
      {tab === 'fees' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'وحدات',          value: feesTotals.units.toLocaleString('ar-SA'),   color: 'text-slate-700' },
              { label: 'عمولة نون',      value: `${fmt(feesTotals.referralFees)} ر.س`,       color: 'text-amber-600' },
              { label: 'رسوم FBN',       value: `${fmt(feesTotals.fbnFees)} ر.س`,            color: 'text-amber-600' },
              { label: 'إجمالي الرسوم',  value: `${fmt(feesTotals.totalFees)} ر.س`,          color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-4">
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['SKU', 'الماركة', 'الوحدات', 'الإيرادات', 'عمولة نون', 'رسوم FBN', 'إجمالي الرسوم', 'نسبة الرسوم'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
                ) : feesRows.length === 0 ? (
                  <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">لا توجد بيانات</td></tr>
                ) : feesRows.map(r => (
                  <tr key={r.sku} className="hover:bg-slate-50">
                    <td className="table-td font-mono text-xs">{r.sku}</td>
                    <td className="table-td">{r.brand || '—'}</td>
                    <td className="table-td">{r.units.toLocaleString('ar-SA')}</td>
                    <td className="table-td text-emerald-600">{fmt0(r.revenue)}</td>
                    <td className="table-td text-amber-600">{fmt0(r.referralFees)}</td>
                    <td className="table-td text-amber-600">{fmt0(r.fbnFees)}</td>
                    <td className="table-td text-red-600 font-medium">{fmt0(r.totalFees)}</td>
                    <td className="table-td">
                      <span className={`font-semibold ${r.feeRate > 30 ? 'text-red-600' : r.feeRate > 20 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {r.feeRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
