'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { invoices as api } from '@/lib/api';
import type { Invoice } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export default function InvoicesPage() {
  const [items, setItems]     = useState<Invoice[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [inputQ, setInputQ]   = useState('');
  const [q, setQ]             = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setQ(inputQ); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [inputQ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.list({ page, limit: 50, q: q || undefined });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل الفواتير');
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الفواتير</h1>
          <p className="text-slate-500 text-sm mt-1">{total.toLocaleString('ar-SA')} فاتورة</p>
        </div>
        <Link href="/invoices/new" className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={15} />
          فاتورة جديدة
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute top-2.5 right-3 text-slate-400" />
            <input
              className="input pr-9 text-sm"
              placeholder="بحث بالمورد أو رقم الفاتورة…"
              value={inputQ}
              onChange={e => setInputQ(e.target.value)}
            />
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr>
              {['المورد', 'رقم الفاتورة', 'التاريخ', 'المجموع', 'ض.ق.م', 'الإجمالي', 'الحالة'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">
                {q ? `لا توجد نتائج لـ "${q}"` : 'لا توجد فواتير'}
              </td></tr>
            ) : items.map(inv => (
              <tr key={inv.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/invoices/${inv.id}`}>
                <td className="table-td font-medium">{inv.supplierName ?? '—'}</td>
                <td className="table-td font-mono text-xs">{inv.invoiceNumber ?? '—'}</td>
                <td className="table-td text-slate-400">
                  {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('ar-SA') : '—'}
                </td>
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
            <span>صفحة {page} من {totalPages}</span>
            <button className="btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>التالي</button>
          </div>
        )}
      </div>
    </div>
  );
}
