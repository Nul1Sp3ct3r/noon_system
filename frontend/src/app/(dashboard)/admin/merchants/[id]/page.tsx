'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { platformAdmin } from '@/lib/api';
import { PlatformAdminGuard } from '@/components/platform-admin-guard';
import type { MerchantDetail, MerchantStatus, SubscriptionStatus, PlatformPaymentStatus } from '@/lib/types';
import {
  AlertCircle, RefreshCw, ChevronRight, Building2,
  User, Mail, Phone, FileText, Shield, CheckCircle2,
  XCircle, AlertTriangle, Package, ShoppingCart,
  Upload, Users, Clock, CreditCard, Calendar,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MERCHANT_STATUS: Record<MerchantStatus, { label: string; color: string }> = {
  trial:     { label: 'تجريبي',  color: 'bg-blue-100 text-blue-700' },
  active:    { label: 'نشط',     color: 'bg-emerald-100 text-emerald-700' },
  expired:   { label: 'منتهي',   color: 'bg-amber-100 text-amber-700' },
  suspended: { label: 'معلق',    color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'ملغي',    color: 'bg-slate-100 text-slate-500' },
};

const SUB_STATUS: Record<SubscriptionStatus, { label: string; color: string }> = {
  trial:     { label: 'تجريبي', color: 'bg-blue-100 text-blue-700' },
  active:    { label: 'نشط',    color: 'bg-emerald-100 text-emerald-700' },
  expired:   { label: 'منتهي',  color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'ملغي',   color: 'bg-slate-100 text-slate-500' },
  paused:    { label: 'موقوف',  color: 'bg-amber-100 text-amber-700' },
};

const PAY_STATUS: Record<PlatformPaymentStatus, { label: string; color: string }> = {
  paid:     { label: 'مدفوع',   color: 'bg-emerald-100 text-emerald-700' },
  pending:  { label: 'معلق',    color: 'bg-amber-100 text-amber-700' },
  failed:   { label: 'فشل',     color: 'bg-red-100 text-red-700' },
  refunded: { label: 'مسترجع', color: 'bg-slate-100 text-slate-500' },
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-SA');
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-left mr-4">{value ?? '—'}</span>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MerchantDetailPage() {
  return (
    <PlatformAdminGuard>
      <MerchantDetailContent />
    </PlatformAdminGuard>
  );
}

function MerchantDetailContent() {
  const { id }             = useParams<{ id: string }>();
  const router             = useRouter();
  const [data, setData]    = useState<MerchantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]  = useState('');
  const [saving, setSaving] = useState(false);
  const [editStatus, setEditStatus] = useState<MerchantStatus | ''>('');

  // Guard: id must be a positive integer. Non-numeric ids (e.g. "new") must
  // never reach the backend — ParseIntPipe would throw a 422 validation error.
  const numericId = Number(id);
  const idIsValid = Number.isInteger(numericId) && numericId > 0;

  async function load() {
    if (!idIsValid) return;
    setLoading(true);
    setError('');
    try {
      const m = await platformAdmin.getMerchant(numericId);
      setData(m);
      setEditStatus(m.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل بيانات التاجر');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!idIsValid) {
      router.replace('/admin/merchants');
      return;
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(newStatus: MerchantStatus) {
    if (!data) return;
    setSaving(true);
    try {
      await platformAdmin.updateMerchant(data.id, { status: newStatus });
      setData(prev => prev ? { ...prev, status: newStatus } : prev);
      setEditStatus(newStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحديث الحالة');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        جارٍ التحميل…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  if (!data) return null;

  const ms        = MERCHANT_STATUS[data.status];
  const currentSub = data.currentSubscription;

  return (
    <div className="space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin/merchants" className="hover:text-brand-600 transition-colors">
          إدارة التجار
        </Link>
        <ChevronRight size={14} />
        <span className="text-slate-900 font-medium">{data.businessName}</span>
      </div>

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center">
            <Building2 size={22} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{data.businessName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${ms.color}`}>
                {ms.label}
              </span>
              <span className="text-xs text-slate-400">#{data.id}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="input text-sm py-1.5 w-36"
            value={editStatus}
            onChange={e => handleStatusChange(e.target.value as MerchantStatus)}
            disabled={saving}
          >
            {Object.entries(MERCHANT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} /> تحديث
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Column 1: Business info + subscription */}
        <div className="space-y-6">

          {/* Business info */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Building2 size={16} className="text-brand-600" /> بيانات التاجر
            </h2>
            <div className="space-y-0">
              <InfoRow label="اسم المنشأة" value={data.businessName} />
              <InfoRow label="المالك"       value={data.ownerName} />
              <InfoRow label="البريد الإلكتروني" value={data.email} />
              <InfoRow label="الجوال"       value={data.phone} />
              <InfoRow label="السجل التجاري" value={data.crNumber} />
              <InfoRow label="الرقم الضريبي" value={data.vatNumber} />
              <InfoRow label="تاريخ الانضمام" value={fmtDate(data.createdAt)} />
              <InfoRow label="آخر نشاط"     value={fmtDate(data.lastActivityAt)} />
            </div>
          </div>

          {/* Subscription */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <CreditCard size={16} className="text-brand-600" /> الاشتراك الحالي
            </h2>
            {currentSub ? (
              <div className="space-y-0">
                <InfoRow label="الباقة" value={currentSub.plan?.name ?? '—'} />
                <InfoRow label="نوع الفترة" value={currentSub.billingCycle === 'monthly' ? 'شهري' : 'سنوي'} />
                <InfoRow label="تاريخ البداية" value={fmtDate(currentSub.startDate)} />
                <InfoRow label="تاريخ الانتهاء" value={fmtDate(currentSub.endDate)} />
                <InfoRow label="السعر" value={`${Number(currentSub.price).toLocaleString('ar-SA')} ر.س`} />
                <InfoRow label="التجديد التلقائي" value={currentSub.autoRenew ? 'مفعّل' : 'غير مفعّل'} />
                <InfoRow
                  label="الحالة"
                  value={
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SUB_STATUS[currentSub.status]?.color}`}>
                      {SUB_STATUS[currentSub.status]?.label}
                    </span>
                  }
                />
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">لا يوجد اشتراك حالي</p>
            )}
          </div>

        </div>

        {/* Column 2: Usage + Health */}
        <div className="space-y-6">

          {/* Usage */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-brand-600" /> الاستخدام
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="المنتجات"   value={data.usage.products} icon={Package}     color="bg-blue-50 text-blue-600" />
              <StatCard label="الطلبات"    value={data.usage.orders}   icon={ShoppingCart} color="bg-emerald-50 text-emerald-600" />
              <StatCard label="الاستيراد"  value={data.usage.imports}  icon={Upload}       color="bg-amber-50 text-amber-600" />
              <StatCard label="المستخدمون" value={data.usage.users}    icon={Users}        color="bg-indigo-50 text-indigo-600" />
            </div>
            {data.usage.lastLogin && (
              <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
                <Clock size={12} /> آخر دخول: {fmtDate(data.usage.lastLogin)}
              </p>
            )}
            {!data.organizationId && (
              <p className="text-xs text-slate-400 mt-3 text-center">
                لم يُربط بمنظمة بعد
              </p>
            )}
          </div>

          {/* Health */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Shield size={16} className="text-brand-600" /> صحة الحساب
            </h2>
            <div className="space-y-3">
              {[
                {
                  label: 'استيرادات فاشلة',
                  value: data.health.failedImports,
                  good:  data.health.failedImports === 0,
                },
                {
                  label: 'منتجات بدون تكلفة',
                  value: data.health.missingCostProducts,
                  good:  data.health.missingCostProducts === 0,
                },
                {
                  label: 'منتجات منخفضة المخزون',
                  value: data.health.lowStock,
                  good:  data.health.lowStock === 0,
                },
              ].map(({ label, value, good }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 flex items-center gap-2">
                    {good
                      ? <CheckCircle2 size={14} className="text-emerald-500" />
                      : <AlertTriangle size={14} className="text-amber-500" />
                    }
                    {label}
                  </span>
                  <span className={`text-sm font-semibold ${good ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Column 3: Payments */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <CreditCard size={16} className="text-brand-600" /> المدفوعات
          </h2>
          {!data.payments.length ? (
            <p className="text-sm text-slate-400 text-center py-6">لا توجد مدفوعات مسجلة</p>
          ) : (
            <div className="space-y-2">
              {data.payments.map(p => {
                const ps = PAY_STATUS[p.status as PlatformPaymentStatus];
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {Number(p.amount).toLocaleString('ar-SA')} ر.س
                      </p>
                      <p className="text-xs text-slate-400">{fmtDate(p.paidAt ?? p.createdAt)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ps?.color ?? 'bg-slate-100 text-slate-500'}`}>
                      {ps?.label ?? p.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* All subscriptions history */}
      {data.subscriptions.length > 1 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">تاريخ الاشتراكات</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['الباقة','الفترة','البداية','الانتهاء','السعر','الحالة'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map(s => {
                  const ss = SUB_STATUS[s.status];
                  return (
                    <tr key={s.id}>
                      <td className="table-td font-medium">{s.plan?.name ?? '—'}</td>
                      <td className="table-td">{s.billingCycle === 'monthly' ? 'شهري' : 'سنوي'}</td>
                      <td className="table-td text-xs">{fmtDate(s.startDate)}</td>
                      <td className="table-td text-xs">{fmtDate(s.endDate)}</td>
                      <td className="table-td">{Number(s.price).toLocaleString('ar-SA')} ر.س</td>
                      <td className="table-td">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ss?.color}`}>
                          {ss?.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

// small icon shim
function BarChart3({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
