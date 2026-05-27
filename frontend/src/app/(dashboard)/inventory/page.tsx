'use client';

import { useEffect, useState } from 'react';
import { inventory as api } from '@/lib/api';
import type { InventoryStock } from '@/lib/types';

export default function InventoryPage() {
  const [items, setItems]     = useState<InventoryStock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stock()
      .then(setItems)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const totalValue = items.reduce((s, i) => s + (i.totalCost ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">المخزون</h1>
          <p className="text-slate-500 text-sm mt-1">
            {items.length} SKU · إجمالي التكلفة {totalValue.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س
          </p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['SKU', 'الاسم', 'الماركة', 'المستودع', 'الكمية', 'تكلفة الوحدة', 'إجمالي التكلفة'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">لا توجد بيانات مخزون</td></tr>
            ) : items.map((s, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="table-td font-mono text-xs">{s.sku}</td>
                <td className="table-td">{s.nameEn ?? '—'}</td>
                <td className="table-td">{s.brand ?? '—'}</td>
                <td className="table-td">{s.warehouse?.name ?? '—'}</td>
                <td className={`table-td font-medium ${s.qty < 0 ? 'text-red-600' : s.qty === 0 ? 'text-slate-400' : 'text-emerald-600'}`}>
                  {s.qty}
                </td>
                <td className="table-td">{s.unitCost ? `${s.unitCost} ر.س` : '—'}</td>
                <td className="table-td">{s.totalCost != null ? `${s.totalCost.toFixed(2)} ر.س` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
