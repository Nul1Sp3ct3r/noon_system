'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { settlements as api, downloadExport } from '@/lib/api';
import type { SettlementRow } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export default function SettlementsPage() {
  const [items, setItems]     = useState<SettlementRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.list({ page, limit: 50 });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل التسويات');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => n.toFixed(2);
  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">التسويات</h1>
          <p className="text-slate-500 text-sm mt-1">مطابقة كل دفعة استيراد مع المدفوعات الفعلية</p>
        </div>
        <button
          onClick={async () => { try { await downloadExport('settlements'); } catch(e) { setError(String(e)); } }}
          disabled={loading}
          className="btn-ghost flex items-center gap-1.5 text-sm border border-slate-200"
        >
          <Download size={14} />
          تصدير Excel
        </button>
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
              {['رقم الكشف', 'التاريخ', 'عدد المبيعات', 'إجمالي المبيعات', 'الرسوم', 'صافينا', 'الدفع الفعلي', 'الفارق', 'الحالة'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">لا توجد تسويات</td></tr>
            ) : items.map(s => (
              <tr key={s.batchId} className="hover:bg-slate-50">
                <td className="table-td font-mono text-xs">{s.statementNr ?? s.batchId.slice(0, 8)}</td>
                <td className="table-td text-slate-400">{s.statementDate ?? '—'}</td>
                <td className="table-td">{s.salesCount}</td>
                <td className="table-td">{fmt(s.grossSales)}</td>
                <td className="table-td text-amber-600">{fmt(s.totalFees)}</td>
                <td className="table-td font-medium">{fmt(s.ourNet)}</td>
                <td className="table-td">{fmt(s.actualPayout)}</td>
                <td className={`table-td font-medium ${s.mismatchFlag ? 'text-red-600' : 'text-slate-400'}`}>
                  {fmt(s.mismatch)}
                </td>
                <td className="table-td">
                  <Badge
                    label={s.mismatchFlag ? 'فارق' : 'مطابق'}
                    variant={s.mismatchFlag ? 'red' : 'green'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <button className="btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</button>
            <span>صفحة {page} من {totalPages}</span>
            <button className="btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>التالي</button>
          </div>
        )}
      </div>
    </div>
  );
}
