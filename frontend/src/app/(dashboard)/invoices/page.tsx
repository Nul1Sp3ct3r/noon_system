'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { invoices as api } from '@/lib/api';
import type { Invoice } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

// [ADD #6] استخراج تاريخ الاستحقاق من حقل الملاحظات
function parseDueDateFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/الاستحقاق:\s*(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

// [ADD #7] تحديد الحالة الغنية للفاتورة بناءً على status + notes
const INV_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  void:    { label: 'ملغى',              bg: 'bg-red-100',    text: 'text-red-700'    },
  review:  { label: 'بانتظار الاعتماد', bg: 'bg-amber-100',  text: 'text-amber-700'  },
  draft:   { label: 'مسودة',             bg: 'bg-slate-100',  text: 'text-slate-600'  },
  active:  { label: 'نشط',              bg: 'bg-green-100',  text: 'text-green-700'  },
  paid:    { label: 'مدفوعة',            bg: 'bg-teal-100',   text: 'text-teal-700'   },
};

function deriveInvoiceStatus(inv: Invoice) {
  if (inv.status === 'void') return INV_STATUS.void;
  const notes = inv.notes ?? '';
  if (notes.includes('مرسل للاعتماد')) return INV_STATUS.review;
  if (notes.includes('الحالة: مسودة'))  return INV_STATUS.draft;
  return INV_STATUS.active;
}

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
              {['المورد', 'رقم الفاتورة', 'التاريخ', 'الاستحقاق', 'المجموع', 'ض.ق.م', 'الإجمالي', 'الحالة'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">
                {q ? `لا توجد نتائج لـ "${q}"` : 'لا توجد فواتير'}
              </td></tr>
            ) : items.map(inv => {
              // [ADD #6] تاريخ الاستحقاق من الملاحظات
              const dueDateRaw = parseDueDateFromNotes(inv.notes);
              const dueDisplay = dueDateRaw
                ? new Date(dueDateRaw).toLocaleDateString('ar-SA')
                : '—';
              const isOverdue = dueDateRaw && new Date(dueDateRaw) < new Date() && inv.status !== 'void';

              // [ADD #7] حالة الفاتورة الغنية
              const statusInfo = deriveInvoiceStatus(inv);

              return (
                <tr key={inv.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/invoices/${inv.id}`}>
                  <td className="table-td font-medium">{inv.supplierName ?? '—'}</td>
                  <td className="table-td font-mono text-xs">{inv.invoiceNumber ?? '—'}</td>
                  <td className="table-td text-slate-400">
                    {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('ar-SA') : '—'}
                  </td>
                  {/* [ADD #6] عمود تاريخ الاستحقاق */}
                  <td className={`table-td text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                    {dueDisplay}
                    {isOverdue && <span className="block text-[10px] text-red-500">متأخرة</span>}
                  </td>
                  <td className="table-td">{inv.subtotal ? `${Number(inv.subtotal).toFixed(2)} ر.س` : '—'}</td>
                  <td className="table-td">{inv.vatAmount ? `${Number(inv.vatAmount).toFixed(2)} ر.س` : '—'}</td>
                  <td className="table-td font-medium">{inv.totalAmount ? `${Number(inv.totalAmount).toFixed(2)} ر.س` : '—'}</td>
                  {/* [ADD #7] عمود الحالة بـ pill ملون */}
                  <td className="table-td">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                </tr>
              );
            })}
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
