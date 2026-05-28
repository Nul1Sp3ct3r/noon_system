'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { orders as api } from '@/lib/api';
import type { Order } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT: Record<string, 'green' | 'amber' | 'red' | 'slate'> = {
  delivered: 'green',
  cancelled: 'red',
  returned:  'amber',
};

export default function OrdersPage() {
  const [items, setItems]     = useState<Order[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [inputQ, setInputQ]   = useState('');
  const [q, setQ]             = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setQ(inputQ); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [inputQ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.list({ q, page, limit: 50 });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">الطلبات</h1>
        <p className="text-slate-500 text-sm mt-1">{total.toLocaleString('ar-SA')} طلب</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute top-2.5 right-3 text-slate-400" />
            <input
              className="input pr-9 text-sm"
              placeholder="رقم الطلب أو SKU…"
              value={inputQ}
              onChange={e => setInputQ(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['رقم الطلب', 'SKU', 'المنتج', 'الماركة', 'الحالة', 'الإيراد', 'التاريخ'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">
                  {q ? `لا توجد نتائج لـ "${q}"` : 'لا توجد طلبات'}
                </td></tr>
              ) : items.map(o => {
                const status = (o.itemStatus ?? '').toLowerCase();
                const displayDate = o.deliveredDate || o.returnedDate || o.orderedDate;
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="table-td font-mono text-xs">{o.orderNr}</td>
                    <td className="table-td font-mono text-xs">{o.sku ?? '—'}</td>
                    <td className="table-td max-w-[200px] truncate">
                      {o.productTitleAr || o.productTitleEn || '—'}
                    </td>
                    <td className="table-td">{o.brandAr || o.brandEn || '—'}</td>
                    <td className="table-td">
                      {status
                        ? <Badge label={status} variant={STATUS_VARIANT[status] ?? 'slate'} />
                        : '—'}
                    </td>
                    <td className="table-td">{o.netProceeds ? `${o.netProceeds} ر.س` : '—'}</td>
                    <td className="table-td text-slate-400">
                      {displayDate ? displayDate.slice(0, 10) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

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
