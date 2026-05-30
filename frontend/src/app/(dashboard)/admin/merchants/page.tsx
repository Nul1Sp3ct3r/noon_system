'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { platformAdmin } from '@/lib/api';
import { PlatformAdminGuard } from '@/components/platform-admin-guard';
import type { Merchant, PlatformKpis, MerchantStatus } from '@/lib/types';
import type { PaginatedResponse } from '@/lib/types';
import {
  Users, TrendingUp, Clock, XCircle, PauseCircle,
  BarChart3, AlertCircle, Search, RefreshCw, Eye,
  ChevronRight, ChevronLeft, Building2,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<MerchantStatus, string> = {
  trial:     'تجريبي',
  active:    'نشط',
  expired:   'منتهي',
  suspended: 'معلق',
  cancelled: 'ملغي',
};

const STATUS_COLORS: Record<MerchantStatus, string> = {
  trial:     'bg-blue-100 text-blue-700',
  active:    'bg-emerald-100 text-emerald-700',
  expired:   'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const SUB_STATUS_COLORS: Record<string, string> = {
  trial:     'bg-blue-50 text-blue-600',
  active:    'bg-emerald-50 text-emerald-700',
  expired:   'bg-red-50 text-red-600',
  cancelled: 'bg-slate-50 text-slate-500',
  paused:    'bg-amber-50 text-amber-700',
};

function fmt(n: number) {
  return n.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtSAR(n: number) {
  return `${n.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ر.س`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MerchantsPage() {
  return (
    <PlatformAdminGuard>
      <MerchantsContent />
    </PlatformAdminGuard>
  );
}

function MerchantsContent() {
  const [kpis,    setKpis]    = useState<PlatformKpis | null>(null);
  const [data,    setData]    = useState<PaginatedResponse<Merchant> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [q,       setQ]       = useState('');
  const [status,  setStatus]  = useState<MerchantStatus | ''>('');
  const [page,    setPage]    = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [kpisRes, merchantsRes] = await Promise.all([
        platformAdmin.kpis(),
        platformAdmin.listMerchants({ q: q || undefined, status: status || undefined, page, limit: 20 }),
      ]);
      setKpis(kpisRes);
      setData(merchantsRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [q, status, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">إدارة التجار</h1>
          <p className="text-slate-500 text-sm mt-1">منصة PreciseFlow — إدارة المشتركين</p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} /> تحديث
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {/* KPI Grid */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="إجمالي التجار"    value={fmt(kpis.totalMerchants)}   icon={Users}        color="bg-blue-100 text-blue-600" />
          <KpiCard label="التجار النشطين"   value={fmt(kpis.activeMerchants)}  icon={TrendingUp}   color="bg-emerald-100 text-emerald-600" />
          <KpiCard label="التجارب المجانية" value={fmt(kpis.trialMerchants)}   icon={Clock}        color="bg-amber-100 text-amber-600" />
          <KpiCard label="الاشتراكات المنتهية" value={fmt(kpis.expiredSubscriptions)} icon={XCircle} color="bg-red-100 text-red-600" />
          <KpiCard
            label="MRR" value={fmtSAR(kpis.mrr)}
            sub={`ARR: ${fmtSAR(kpis.arr)}`}
            icon={BarChart3} color="bg-indigo-100 text-indigo-600"
          />
          <KpiCard
            label="إيرادات الشهر"
            value={fmtSAR(kpis.monthlyRevenue)}
            icon={TrendingUp} color="bg-emerald-100 text-emerald-700"
          />
          <KpiCard
            label="مدفوعات معلقة"
            value={fmtSAR(kpis.pendingPayments)}
            icon={PauseCircle} color="bg-amber-100 text-amber-700"
          />
          <KpiCard
            label="اشتراكات معلقة"
            value={fmt(kpis.suspendedSubscriptions)}
            icon={PauseCircle} color="bg-slate-100 text-slate-600"
          />
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pr-9 text-sm"
            placeholder="البحث بالاسم أو البريد…"
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="input w-40 text-sm"
          value={status}
          onChange={e => { setStatus(e.target.value as MerchantStatus | ''); setPage(1); }}
        >
          <option value="">كل الحالات</option>
          {(Object.keys(STATUS_LABELS) as MerchantStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <Link
          href="/admin/merchants/new"
          className="btn-primary text-sm px-4 py-2"
        >
          + تاجر جديد
        </Link>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['التاجر','المالك','البريد','الجوال','الباقة','حالة الاشتراك','ينتهي في','حالة الحساب','الإجراءات'].map(h => (
                  <th key={h} className="table-th whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="table-td text-center text-slate-400 py-10">جارٍ التحميل…</td></tr>
              ) : !data?.items.length ? (
                <tr>
                  <td colSpan={9} className="table-td text-center py-12">
                    <Building2 size={36} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-400">لا يوجد تجار بعد</p>
                  </td>
                </tr>
              ) : data.items.map(m => {
                const sub = m.currentSubscription;
                const endDate = sub?.endDate ? new Date(sub.endDate).toLocaleDateString('ar-SA') : '—';
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="table-td">
                      <p className="font-medium text-slate-900">{m.businessName}</p>
                      <p className="text-xs text-slate-400">#{m.id}</p>
                    </td>
                    <td className="table-td text-slate-700">{m.ownerName ?? '—'}</td>
                    <td className="table-td text-slate-600 text-xs">{m.email ?? '—'}</td>
                    <td className="table-td text-slate-600 text-xs">{m.phone ?? '—'}</td>
                    <td className="table-td">
                      {sub?.plan ? (
                        <span className="text-xs font-medium text-slate-700">{sub.plan.name}</span>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="table-td">
                      {sub ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SUB_STATUS_COLORS[sub.status] ?? 'bg-slate-50 text-slate-500'}`}>
                          {sub.status === 'trial' ? 'تجريبي' : sub.status === 'active' ? 'نشط' : sub.status === 'expired' ? 'منتهي' : sub.status === 'paused' ? 'معلق' : 'ملغي'}
                        </span>
                      ) : <span className="text-slate-400 text-xs">لا يوجد</span>}
                    </td>
                    <td className="table-td text-xs text-slate-600">{endDate}</td>
                    <td className="table-td">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[m.status]}`}>
                        {STATUS_LABELS[m.status]}
                      </span>
                    </td>
                    <td className="table-td">
                      <Link
                        href={`/admin/merchants/${m.id}`}
                        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                      >
                        <Eye size={13} /> عرض
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm">
            <span className="text-slate-500 text-xs">
              {data.total} تاجر — صفحة {page} من {data.pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost px-2 py-1 text-xs disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="btn-ghost px-2 py-1 text-xs disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
