'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { platformAdmin } from '@/lib/api';
import { PlatformAdminGuard } from '@/components/platform-admin-guard';
import type { MerchantSubscription, SubscriptionStatus } from '@/lib/types';
import { AlertCircle, RefreshCw, CreditCard, CheckCircle2, XCircle } from 'lucide-react';

const STATUS_MAP: Record<SubscriptionStatus, { label: string; color: string }> = {
  trial:     { label: 'تجريبي', color: 'bg-blue-100 text-blue-700' },
  active:    { label: 'نشط',    color: 'bg-emerald-100 text-emerald-700' },
  expired:   { label: 'منتهي',  color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'ملغي',   color: 'bg-slate-100 text-slate-500' },
  paused:    { label: 'موقوف',  color: 'bg-amber-100 text-amber-700' },
};

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-SA');
}

export default function SubscriptionsPage() {
  return (
    <PlatformAdminGuard>
      <SubscriptionsContent />
    </PlatformAdminGuard>
  );
}

function SubscriptionsContent() {
  const [subs,    setSubs]    = useState<MerchantSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState<SubscriptionStatus | ''>('');
  const [updating, setUpdating] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSubs(await platformAdmin.listSubscriptions());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(id: number, status: SubscriptionStatus) {
    setUpdating(id);
    try {
      const updated = await platformAdmin.updateSubscription(id, { status });
      setSubs(prev => prev.map(s => s.id === id ? { ...s, status: updated.status } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحديث');
    } finally {
      setUpdating(null);
    }
  }

  const displayed = filter ? subs.filter(s => s.status === filter) : subs;

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الاشتراكات</h1>
          <p className="text-slate-500 text-sm mt-1">{subs.length} اشتراك إجمالاً</p>
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

      {/* Filter */}
      <div className="card p-4 flex gap-2 flex-wrap">
        {(['', 'trial', 'active', 'expired', 'cancelled', 'paused'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s as SubscriptionStatus | '')}
            className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
              filter === s
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-slate-200 text-slate-600 hover:border-brand-300'
            }`}
          >
            {s === '' ? 'الكل' : STATUS_MAP[s as SubscriptionStatus]?.label}
            {s && (
              <span className="mr-1 opacity-70">
                ({subs.filter(x => x.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['التاجر','الباقة','نوع الفترة','البداية','الانتهاء','السعر','التجديد','الحالة','الإجراءات'].map(h => (
                  <th key={h} className="table-th whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="table-td text-center text-slate-400 py-10">جارٍ التحميل…</td></tr>
              ) : !displayed.length ? (
                <tr>
                  <td colSpan={9} className="table-td text-center py-10">
                    <CreditCard size={32} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">لا توجد اشتراكات</p>
                  </td>
                </tr>
              ) : displayed.map(s => {
                const ss = STATUS_MAP[s.status];
                const merchant = (s as any).merchant as { id: number; businessName: string } | undefined;
                return (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="table-td">
                      {merchant ? (
                        <Link href={`/admin/merchants/${merchant.id}`} className="text-brand-600 hover:underline text-sm font-medium">
                          {merchant.businessName}
                        </Link>
                      ) : `#${s.merchantId}`}
                    </td>
                    <td className="table-td font-medium">{s.plan?.name ?? '—'}</td>
                    <td className="table-td">{s.billingCycle === 'monthly' ? 'شهري' : 'سنوي'}</td>
                    <td className="table-td text-xs">{fmtDate(s.startDate)}</td>
                    <td className="table-td text-xs">{fmtDate(s.endDate)}</td>
                    <td className="table-td">{Number(s.price).toLocaleString('ar-SA')} ر.س</td>
                    <td className="table-td text-center">
                      {s.autoRenew
                        ? <CheckCircle2 size={15} className="text-emerald-500 mx-auto" />
                        : <XCircle size={15} className="text-slate-300 mx-auto" />
                      }
                    </td>
                    <td className="table-td">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ss?.color}`}>
                        {ss?.label}
                      </span>
                    </td>
                    <td className="table-td">
                      <select
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                        value={s.status}
                        disabled={updating === s.id}
                        onChange={e => changeStatus(s.id, e.target.value as SubscriptionStatus)}
                      >
                        {(Object.keys(STATUS_MAP) as SubscriptionStatus[]).map(k => (
                          <option key={k} value={k}>{STATUS_MAP[k].label}</option>
                        ))}
                      </select>
                    </td>
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
