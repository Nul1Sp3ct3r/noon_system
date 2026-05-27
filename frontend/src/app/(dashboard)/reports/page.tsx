'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { reports as api } from '@/lib/api';
import type { PlRow } from '@/lib/types';

const YEAR = new Date().getFullYear();

export default function ReportsPage() {
  const [rows, setRows]       = useState<PlRow[]>([]);
  const [year, setYear]       = useState(YEAR);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.pl(year)
      .then(setRows)
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل التقرير'))
      .finally(() => setLoading(false));
  }, [year]);

  const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totals = rows.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, totalFees: a.totalFees + r.totalFees, cogs: a.cogs + r.cogs, netProfit: a.netProfit + r.netProfit }),
    { revenue: 0, totalFees: 0, cogs: 0, netProfit: 0 },
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">تقرير الأرباح والخسائر</h1>
        <select className="input w-28 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[YEAR, YEAR - 1, YEAR - 2].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'الإيرادات',    value: totals.revenue,    color: 'text-emerald-600' },
          { label: 'الرسوم',       value: totals.totalFees,  color: 'text-amber-600' },
          { label: 'تكلفة البضاعة', value: totals.cogs,      color: 'text-orange-600' },
          { label: 'صافي الربح',   value: totals.netProfit,  color: totals.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600' },
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
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center py-10 text-slate-400">لا توجد بيانات لهذه السنة</td></tr>
            ) : rows.map(r => (
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
    </div>
  );
}
