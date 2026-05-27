'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { products as api } from '@/lib/api';
import type { Product } from '@/lib/types';

export default function ProductsPage() {
  const [items, setItems]     = useState<Product[]>([]);
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
      setError(err instanceof Error ? err.message : 'فشل تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">المنتجات</h1>
          <p className="text-slate-500 text-sm mt-1">{total.toLocaleString('ar-SA')} منتج</p>
        </div>
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
              placeholder="بحث بـ SKU أو الاسم أو الماركة…"
              value={inputQ}
              onChange={e => setInputQ(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['SKU', 'الاسم', 'الماركة', 'التكلفة', 'تاريخ الإضافة'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="table-td text-center py-10 text-slate-400">
                  {q ? `لا توجد نتائج لـ "${q}"` : 'لا توجد منتجات'}
                </td></tr>
              ) : items.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="table-td font-mono text-xs">{p.sku}</td>
                  <td className="table-td">{p.nameAr ?? p.nameEn ?? '—'}</td>
                  <td className="table-td">{p.brand ?? '—'}</td>
                  <td className="table-td">{p.unitCost ? `${p.unitCost} ر.س` : '—'}</td>
                  <td className="table-td text-slate-400">{new Date(p.createdAt).toLocaleDateString('ar-SA')}</td>
                </tr>
              ))}
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
