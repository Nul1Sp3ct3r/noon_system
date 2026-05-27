'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { products as api } from '@/lib/api';
import type { Product } from '@/lib/types';

export default function ProductsPage() {
  const [items, setItems]   = useState<Product[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [q, setQ]           = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.list({ q, page, limit: 50 });
      setItems(res.items);
      setTotal(res.total);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">المنتجات</h1>
          <p className="text-slate-500 text-sm mt-1">{total.toLocaleString('ar-SA')} منتج</p>
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute top-2.5 right-3 text-slate-400" />
            <input
              className="input pr-9 text-sm"
              placeholder="بحث بـ SKU أو الاسم أو الماركة…"
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
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
                <tr><td colSpan={5} className="table-td text-center py-10 text-slate-400">لا توجد نتائج</td></tr>
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
            <span>صفحة {page}</span>
            <button className="btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total}>التالي</button>
          </div>
        )}
      </div>
    </div>
  );
}
