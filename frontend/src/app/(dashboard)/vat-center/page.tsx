'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { vatCenter as api } from '@/lib/api';
import type { VatRow } from '@/lib/types';

const YEAR = new Date().getFullYear();

export default function VatCenterPage() {
  const [rows, setRows]       = useState<VatRow[]>([]);
  const [year, setYear]       = useState(YEAR);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.breakdown(year)
      .then(d => setRows(d.months))
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل بيانات الضريبة'))
      .finally(() => setLoading(false));
  }, [year]);

  const fmt = (n: number) => n.toFixed(2);

  const totals = rows.reduce(
    (a, r) => ({ outputVat: a.outputVat + r.outputVat, inputVatNoon: a.inputVatNoon + r.inputVatNoon, inputVatSupplier: a.inputVatSupplier + r.inputVatSupplier, netVat: a.netVat + r.netVat }),
    { outputVat: 0, inputVatNoon: 0, inputVatSupplier: 0, netVat: 0 },
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">مركز ضريبة القيمة المضافة</h1>
          <p className="text-sm text-slate-500 mt-1">صافي المستحق = ضريبة المخرجات − ضريبة مدخلات نون − ضريبة مدخلات الموردين</p>
        </div>
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
          { label: 'ضريبة المخرجات',         value: totals.outputVat,       color: 'text-red-600' },
          { label: 'ضريبة مدخلات نون',        value: totals.inputVatNoon,    color: 'text-emerald-600' },
          { label: 'ضريبة مدخلات الموردين',   value: totals.inputVatSupplier, color: 'text-emerald-600' },
          { label: 'صافي الضريبة المستحقة',   value: totals.netVat,          color: totals.netVat >= 0 ? 'text-orange-600' : 'text-emerald-600' },
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
              {['الشهر', 'المبيعات شاملة الضريبة', 'ضريبة المخرجات', 'رسوم نون (ق ض)', 'ضريبة مدخلات نون', 'فواتير الموردين (ق ض)', 'صافي الضريبة'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">لا توجد بيانات لهذه السنة</td></tr>
            ) : rows.map(r => (
              <tr key={r.month} className="hover:bg-slate-50">
                <td className="table-td font-medium">{r.month}</td>
                <td className="table-td">{fmt(r.salesInclVat)}</td>
                <td className="table-td text-red-600">{fmt(r.outputVat)}</td>
                <td className="table-td">{fmt(r.noonFeesExcl)}</td>
                <td className="table-td text-emerald-600">{fmt(r.inputVatNoon)}</td>
                <td className="table-td text-emerald-600">{fmt(r.inputVatSupplier)}</td>
                <td className={`table-td font-semibold ${r.netVat >= 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {fmt(r.netVat)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
