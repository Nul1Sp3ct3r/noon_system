'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Plus, Search, ShoppingCart, Receipt, TrendingDown, Hash } from 'lucide-react';
import Link from 'next/link';
import { invoices as api } from '@/lib/api';
import type { Invoice, PurchaseKpis } from '@/lib/types';

const EXPENSE_LABELS: Record<string, string> = {
  goods_purchase:        'شراء بضاعة',
  shipping:              'شحن وتوصيل',
  advertising:           'إعلانات',
  operational_services:  'خدمات تشغيلية',
  software_subscriptions:'برامج واشتراكات',
  external_supplier:     'مورد خارجي',
  other:                 'أخرى',
};

interface KpiCardProps { label: string; value: string; icon: React.ElementType; color: string; }
function KpiCard({ label, value, icon: Icon, color }: KpiCardProps) {
  const colors: Record<string, string> = {
    blue:    'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber:   'bg-amber-50 text-amber-600 border-amber-100',
    violet:  'bg-violet-50 text-violet-600 border-violet-100',
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colors[color]}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

export default function PurchasesPage() {
  const [items, setItems]     = useState<Invoice[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [inputQ, setInputQ]   = useState('');
  const [q, setQ]             = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [kpis, setKpis]       = useState<PurchaseKpis>({ totalPurchases: 0, recoverableVat: 0, monthExpenses: 0, purchasesCount: 0 });

  useEffect(() => {
    const t = setTimeout(() => { setQ(inputQ); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [inputQ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, kpisData] = await Promise.all([
        api.list({ page, limit: 50, q: q || undefined }),
        api.kpis(),
      ]);
      setItems(res.items);
      setTotal(res.total);
      setKpis(kpisData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل المشتريات');
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalPages = Math.ceil(total / 50);

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">المشتريات</h1>
          <p className="text-slate-500 text-sm mt-1">{total.toLocaleString('ar-SA')} عملية شراء</p>
        </div>
        <Link href="/invoices/new" className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={15} />
          إضافة عملية شراء
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="إجمالي المشتريات"     value={`${fmt(kpis.totalPurchases)} ر.س`}  icon={ShoppingCart}  color="blue"    />
        <KpiCard label="ضريبة قابلة للاسترداد" value={`${fmt(kpis.recoverableVat)} ر.س`}  icon={Receipt}       color="emerald" />
        <KpiCard label="مصروفات الشهر"         value={`${fmt(kpis.monthExpenses)} ر.س`}   icon={TrendingDown}  color="amber"   />
        <KpiCard label="عدد عمليات الشراء"     value={kpis.purchasesCount.toLocaleString('ar-SA')} icon={Hash} color="violet"  />
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
              {['المورد', 'رقم الفاتورة', 'التاريخ', 'القيمة قبل الضريبة', 'ضريبة القيمة المضافة', 'الإجمالي', 'نوع المصروف'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">
                {q ? `لا توجد نتائج لـ "${q}"` : 'لا توجد مشتريات بعد'}
              </td></tr>
            ) : items.map(inv => (
              <tr
                key={inv.id}
                className="hover:bg-slate-50 cursor-pointer"
                onClick={() => { window.location.href = `/invoices/${inv.id}`; }}
              >
                <td className="table-td font-medium">{inv.supplierName ?? '—'}</td>
                <td className="table-td font-mono text-xs">{inv.invoiceNumber ?? '—'}</td>
                <td className="table-td text-slate-400">
                  {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('ar-SA') : '—'}
                </td>
                <td className="table-td tabular-nums">
                  {inv.subtotal ? `${Number(inv.subtotal).toFixed(2)} ر.س` : '—'}
                </td>
                <td className="table-td tabular-nums text-amber-600">
                  {inv.vatAmount && Number(inv.vatAmount) > 0 ? `${Number(inv.vatAmount).toFixed(2)} ر.س` : '—'}
                </td>
                <td className="table-td font-medium tabular-nums">
                  {inv.totalAmount ? `${Number(inv.totalAmount).toFixed(2)} ر.س` : '—'}
                </td>
                <td className="table-td">
                  {inv.expenseType ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                      {EXPENSE_LABELS[inv.expenseType] ?? inv.expenseType}
                    </span>
                  ) : '—'}
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
