'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { platformAdmin } from '@/lib/api';
import { PlatformAdminGuard } from '@/components/platform-admin-guard';
import type { PlatformPayment, PlatformPaymentStatus } from '@/lib/types';
import { AlertCircle, RefreshCw, CreditCard, BadgeDollarSign } from 'lucide-react';

const PAY_STATUS: Record<PlatformPaymentStatus, { label: string; color: string }> = {
  paid:     { label: 'مدفوع',    color: 'bg-emerald-100 text-emerald-700' },
  pending:  { label: 'معلق',     color: 'bg-amber-100 text-amber-700' },
  failed:   { label: 'فاشل',     color: 'bg-red-100 text-red-700' },
  refunded: { label: 'مسترجع',  color: 'bg-slate-100 text-slate-500' },
};

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-SA');
}

export default function PaymentsPage() {
  return (
    <PlatformAdminGuard>
      <PaymentsContent />
    </PlatformAdminGuard>
  );
}

function PaymentsContent() {
  const [payments, setPayments] = useState<PlatformPayment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [filter,   setFilter]   = useState<PlatformPaymentStatus | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPayments(await platformAdmin.listPayments());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = filter ? payments.filter(p => p.status === filter) : payments;

  const totalPaid = payments
    .filter(p => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">المدفوعات</h1>
          <p className="text-slate-500 text-sm mt-1">تتبع مدفوعات الاشتراكات</p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} /> تحديث
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.keys(PAY_STATUS) as PlatformPaymentStatus[]).map(s => {
          const count  = payments.filter(p => p.status === s).length;
          const amount = payments.filter(p => p.status === s).reduce((a, p) => a + Number(p.amount), 0);
          const ps     = PAY_STATUS[s];
          return (
            <div key={s} className="card p-4">
              <p className="text-xs text-slate-500 mb-1">{ps.label}</p>
              <p className="text-xl font-bold text-slate-900">{count}</p>
              <p className="text-xs text-slate-400">{amount.toLocaleString('ar-SA')} ر.س</p>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div className="card p-4 flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {(['', 'paid', 'pending', 'failed', 'refunded'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s as PlatformPaymentStatus | '')}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                filter === s
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-slate-200 text-slate-600 hover:border-brand-300'
              }`}
            >
              {s === '' ? 'الكل' : PAY_STATUS[s as PlatformPaymentStatus]?.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          إجمالي المحصل: <span className="font-bold text-emerald-700">{totalPaid.toLocaleString('ar-SA')} ر.س</span>
        </p>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['التاجر','الاشتراك','رقم الفاتورة','المبلغ','الحالة','طريقة الدفع','تاريخ الدفع','تاريخ الإنشاء'].map(h => (
                  <th key={h} className="table-th whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="table-td text-center text-slate-400 py-10">جارٍ التحميل…</td></tr>
              ) : !displayed.length ? (
                <tr>
                  <td colSpan={8} className="table-td text-center py-12">
                    <CreditCard size={32} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">لا توجد مدفوعات</p>
                  </td>
                </tr>
              ) : displayed.map(p => {
                const ps = PAY_STATUS[p.status];
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="table-td">
                      {p.merchant ? (
                        <Link href={`/admin/merchants/${p.merchant.id}`} className="text-brand-600 hover:underline text-sm font-medium">
                          {p.merchant.businessName}
                        </Link>
                      ) : `#${p.merchantId}`}
                    </td>
                    <td className="table-td text-xs text-slate-500">
                      {p.subscription ? p.subscription.plan?.name : '—'}
                    </td>
                    <td className="table-td font-mono text-xs">{p.invoiceNumber ?? '—'}</td>
                    <td className="table-td font-semibold">
                      {Number(p.amount).toLocaleString('ar-SA')} ر.س
                    </td>
                    <td className="table-td">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ps?.color}`}>
                        {ps?.label}
                      </span>
                    </td>
                    <td className="table-td text-xs text-slate-500">{p.paymentMethod ?? '—'}</td>
                    <td className="table-td text-xs">{fmtDate(p.paidAt)}</td>
                    <td className="table-td text-xs text-slate-400">{fmtDate(p.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
