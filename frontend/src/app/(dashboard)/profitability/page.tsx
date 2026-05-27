'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { profitability as api } from '@/lib/api';
import type { ProfitabilityRow } from '@/lib/types';
import { Badge, profitBadge } from '@/components/ui/badge';

export default function ProfitabilityPage() {
  const [rows, setRows]       = useState<ProfitabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.list()
      .then(setRows)
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل بيانات الربحية'))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toFixed(2);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">تحليل الربحية</h1>
        <p className="text-slate-500 text-sm mt-1">ربحية لكل SKU · مرتبة تنازلياً حسب الربح للوحدة</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['SKU', 'الاسم', 'الوحدات', 'الإيرادات', 'الرسوم', 'تكلفة البضاعة', 'الربح', 'الربح / وحدة', 'التصنيف'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">لا توجد بيانات</td></tr>
            ) : rows.map(r => {
              const { label, variant } = profitBadge(r.badge);
              return (
                <tr key={r.sku} className="hover:bg-slate-50">
                  <td className="table-td font-mono text-xs">{r.sku}</td>
                  <td className="table-td">{r.nameEn ?? '—'}</td>
                  <td className="table-td">{r.units}</td>
                  <td className="table-td">{fmt(r.revenue)}</td>
                  <td className="table-td text-amber-600">{fmt(r.fees)}</td>
                  <td className="table-td text-orange-600">{fmt(r.cogs)}</td>
                  <td className={`table-td font-medium ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(r.profit)}</td>
                  <td className={`table-td font-semibold ${r.profitPerUnit >= 2 ? 'text-emerald-600' : r.profitPerUnit >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                    {fmt(r.profitPerUnit)} ر.س
                  </td>
                  <td className="table-td"><Badge label={label} variant={variant} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
