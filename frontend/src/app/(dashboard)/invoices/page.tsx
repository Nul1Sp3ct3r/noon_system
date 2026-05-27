'use client';

import { useEffect, useState, useCallback } from 'react';
import { invoices as api } from '@/lib/api';
import type { Invoice } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export default function InvoicesPage() {
  const [items, setItems]     = useState<Invoice[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.list({ page, limit: 50 });
      setItems(res.items);
      setTotal(res.total);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">الفواتير</h1>
        <p className="text-slate-500 text-sm mt-1">{total.toLocaleString('ar-SA')} فاتورة</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['المورد', 'رقم الفاتورة', 'التاريخ', 'المجموع', 'ضريبة القيمة المضافة', 'الإجمالي', 'الحالة'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">لا توجد فواتير</td></tr>
            ) : items.map(inv => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="table-td">{inv.supplierName ?? '—'}</td>
                <td className="table-td font-mono text-xs">{inv.invoiceNumber ?? '—'}</td>
                <td className="table-td text-slate-400">{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('ar-SA') : '—'}</td>
                <td className="table-td">{inv.subtotal ? `${inv.subtotal} ر.س` : '—'}</td>
                <td className="table-td">{inv.vatAmount ? `${inv.vatAmount} ر.س` : '—'}</td>
                <td className="table-td font-medium">{inv.totalAmount ? `${inv.totalAmount} ر.س` : '—'}</td>
                <td className="table-td">
                  <Badge label={inv.status === 'active' ? 'نشط' : 'ملغى'} variant={inv.status === 'active' ? 'green' : 'red'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <button className="btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</button>
            <span>صفحة {page}</span>
            <button className="btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total}>التالي</button>
          </div>
        )}
      </div>
    </div>
  );
}
