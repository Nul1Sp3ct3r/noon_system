'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { platformAdmin } from '@/lib/api';
import { PlatformAdminGuard } from '@/components/platform-admin-guard';
import type {
  MerchantDetail, MerchantUser, MerchantStatus,
  SubscriptionStatus, PlatformPaymentStatus, UserRole,
} from '@/lib/types';
import {
  AlertCircle, RefreshCw, ChevronRight, Building2,
  Shield, CheckCircle2, XCircle, AlertTriangle,
  Package, ShoppingCart, Upload, Users, Clock,
  CreditCard, UserPlus, Copy, Eye, EyeOff,
  UserCheck, UserX, Key, X,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

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

const MERCHANT_ROLES: { value: UserRole; label: string }[] = [
  { value: 'merchant_owner',      label: 'مالك' },
  { value: 'merchant_accountant', label: 'محاسب' },
  { value: 'merchant_inventory',  label: 'مدير مخزون' },
  { value: 'merchant_data_entry', label: 'مدخل بيانات' },
  { value: 'merchant_viewer',     label: 'مشاهد فقط' },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  MERCHANT_ROLES.map(r => [r.value, r.label]),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-SA');
}

function generatePassword(): string {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '!@#$%';
  const all     = upper + lower + digits + special;
  const pwd: string[] = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 4; i < 12; i++) {
    pwd.push(all[Math.floor(Math.random() * all.length)]);
  }
  return pwd.sort(() => Math.random() - 0.5).join('');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Create-user modal ────────────────────────────────────────────────────────

interface CreateUserModalProps {
  merchantId: number;
  onClose: () => void;
  onCreated: (u: MerchantUser) => void;
}

function CreateUserModal({ merchantId, onClose, onCreated }: CreateUserModalProps) {
  const [form, setForm] = useState({
    username: '', password: '', fullName: '', email: '',
    phone: '', role: 'merchant_owner' as UserRole,
  });
  const [showPwd,  setShowPwd]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  function handleGenerate() {
    const pwd = generatePassword();
    setForm(p => ({ ...p, password: pwd }));
    setShowPwd(true);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(form.password).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.username.trim() || !form.password || !form.role) {
      setError('اسم المستخدم وكلمة المرور والدور مطلوبة');
      return;
    }

    // Build DTO with only non-empty optional fields
    const dto: Record<string, string> = {
      username: form.username.trim(),
      password: form.password,
      role:     form.role,
    };
    if (form.fullName.trim()) dto.fullName = form.fullName.trim();
    if (form.email.trim())    dto.email    = form.email.trim();
    if (form.phone.trim())    dto.phone    = form.phone.trim();

    setSaving(true);
    setError('');
    try {
      const created = await platformAdmin.createMerchantUser(merchantId, dto);
      onCreated(created);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل إنشاء المستخدم');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <UserPlus size={18} className="text-brand-600" /> إنشاء مستخدم للتاجر
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              اسم المستخدم <span className="text-red-500">*</span>
            </label>
            <input className="input" placeholder="username" value={form.username} onChange={e => set('username', e.target.value)} required />
          </div>

          {/* Full name + email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الاسم الكامل</label>
              <input className="input" placeholder="الاسم" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">البريد الإلكتروني</label>
              <input className="input" type="email" placeholder="email@" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          {/* Phone + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">رقم الجوال</label>
              <input className="input" type="tel" placeholder="05xxxxxxxx" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                الدور <span className="text-red-500">*</span>
              </label>
              <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
                {MERCHANT_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Temporary password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              كلمة المرور المؤقتة <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input pl-10"
                  placeholder="8 أحرف على الأقل"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {form.password && (
                <button
                  type="button"
                  onClick={handleCopy}
                  title="نسخ كلمة المرور"
                  className="btn-ghost px-3 flex items-center gap-1 text-xs shrink-0"
                >
                  <Copy size={13} />
                  {copied ? 'تم' : 'نسخ'}
                </button>
              )}
              <button
                type="button"
                onClick={handleGenerate}
                className="btn-ghost px-3 flex items-center gap-1 text-xs shrink-0"
              >
                <Key size={13} /> توليد
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              سيُطلب من المستخدم تغيير كلمة المرور عند أول دخول
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'جارٍ الإنشاء…' : 'إنشاء المستخدم'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost text-sm">إلغاء</button>
          </div>

        </form>
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
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [data,       setData]       = useState<MerchantDetail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [editStatus, setEditStatus] = useState<MerchantStatus | ''>('');

  const [users,           setUsers]           = useState<MerchantUser[]>([]);
  const [usersLoading,    setUsersLoading]    = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Reset-password inline state: userId → new password
  const [resetState, setResetState] = useState<Record<number, { pwd: string; show: boolean; saving: boolean }>>({});
  const [actionError, setActionError] = useState('');

  // Guard: id must be a positive integer
  const numericId = Number(id);
  const idIsValid = Number.isInteger(numericId) && numericId > 0;

  const loadUsers = useCallback(async (mid: number) => {
    setUsersLoading(true);
    try {
      setUsers(await platformAdmin.listMerchantUsers(mid));
    } catch {
      // Silent — users section shows empty state
    } finally {
      setUsersLoading(false);
    }
  }, []);

  async function load() {
    if (!idIsValid) return;
    setLoading(true);
    setError('');
    try {
      const m = await platformAdmin.getMerchant(numericId);
      setData(m);
      setEditStatus(m.status);
      await loadUsers(numericId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل بيانات التاجر');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!idIsValid) { router.replace('/admin/merchants'); return; }
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

  async function handleToggleActive(user: MerchantUser) {
    setActionError('');
    try {
      const updated = await platformAdmin.updateMerchantUser(numericId, user.id, { isActive: !user.isActive });
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'فشل تحديث المستخدم');
    }
  }

  async function handleRoleChange(user: MerchantUser, role: UserRole) {
    setActionError('');
    try {
      const updated = await platformAdmin.updateMerchantUser(numericId, user.id, { role });
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'فشل تحديث الدور');
    }
  }

  function initReset(userId: number) {
    setResetState(p => ({ ...p, [userId]: { pwd: '', show: false, saving: false } }));
  }

  function cancelReset(userId: number) {
    setResetState(p => { const n = { ...p }; delete n[userId]; return n; });
  }

  async function handleResetPassword(user: MerchantUser) {
    const rs = resetState[user.id];
    if (!rs?.pwd || rs.pwd.length < 8) {
      setActionError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    setResetState(p => ({ ...p, [user.id]: { ...p[user.id], saving: true } }));
    setActionError('');
    try {
      const updated = await platformAdmin.updateMerchantUser(numericId, user.id, { newPassword: rs.pwd });
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
      cancelReset(user.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'فشل إعادة تعيين كلمة المرور');
      setResetState(p => ({ ...p, [user.id]: { ...p[user.id], saving: false } }));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">جارٍ التحميل…</div>;
  }

  if (error && !data) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  if (!data) return null;

  const ms         = MERCHANT_STATUS[data.status];
  const currentSub = data.currentSubscription;

  return (
    <div className="space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin/merchants" className="hover:text-brand-600 transition-colors">إدارة التجار</Link>
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
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${ms.color}`}>{ms.label}</span>
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

      {/* 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Col 1: Business info + Subscription */}
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Building2 size={16} className="text-brand-600" /> بيانات التاجر
            </h2>
            <InfoRow label="اسم المنشأة"       value={data.businessName} />
            <InfoRow label="المالك"             value={data.ownerName} />
            <InfoRow label="البريد الإلكتروني" value={data.email} />
            <InfoRow label="الجوال"             value={data.phone} />
            <InfoRow label="السجل التجاري"     value={data.crNumber} />
            <InfoRow label="الرقم الضريبي"     value={data.vatNumber} />
            <InfoRow label="تاريخ الانضمام"    value={fmtDate(data.createdAt)} />
            <InfoRow label="آخر نشاط"          value={fmtDate(data.lastActivityAt)} />
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <CreditCard size={16} className="text-brand-600" /> الاشتراك الحالي
            </h2>
            {currentSub ? (
              <>
                <InfoRow label="الباقة"            value={currentSub.plan?.name ?? '—'} />
                <InfoRow label="نوع الفترة"        value={currentSub.billingCycle === 'monthly' ? 'شهري' : 'سنوي'} />
                <InfoRow label="تاريخ البداية"     value={fmtDate(currentSub.startDate)} />
                <InfoRow label="تاريخ الانتهاء"   value={fmtDate(currentSub.endDate)} />
                <InfoRow label="السعر"             value={`${Number(currentSub.price).toLocaleString('ar-SA')} ر.س`} />
                <InfoRow label="التجديد التلقائي" value={currentSub.autoRenew ? 'مفعّل' : 'غير مفعّل'} />
                <InfoRow
                  label="الحالة"
                  value={
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SUB_STATUS[currentSub.status]?.color}`}>
                      {SUB_STATUS[currentSub.status]?.label}
                    </span>
                  }
                />
              </>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">لا يوجد اشتراك حالي</p>
            )}
          </div>
        </div>

        {/* Col 2: Usage + Health */}
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-brand-600" /> الاستخدام
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="المنتجات"   value={data.usage.products} icon={Package}      color="bg-blue-50 text-blue-600" />
              <StatCard label="الطلبات"    value={data.usage.orders}   icon={ShoppingCart}  color="bg-emerald-50 text-emerald-600" />
              <StatCard label="الاستيراد"  value={data.usage.imports}  icon={Upload}        color="bg-amber-50 text-amber-600" />
              <StatCard label="المستخدمون" value={data.usage.users}    icon={Users}         color="bg-indigo-50 text-indigo-600" />
            </div>
            {data.usage.lastLogin && (
              <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
                <Clock size={12} /> آخر دخول: {fmtDate(data.usage.lastLogin)}
              </p>
            )}
            {!data.organizationId && (
              <p className="text-xs text-slate-400 mt-3 text-center">لم يُربط بمنظمة بعد</p>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Shield size={16} className="text-brand-600" /> صحة الحساب
            </h2>
            <div className="space-y-3">
              {[
                { label: 'استيرادات فاشلة',       value: data.health.failedImports,       good: data.health.failedImports === 0 },
                { label: 'منتجات بدون تكلفة',      value: data.health.missingCostProducts, good: data.health.missingCostProducts === 0 },
                { label: 'منخفضة المخزون',         value: data.health.lowStock,            good: data.health.lowStock === 0 },
              ].map(({ label, value, good }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 flex items-center gap-2">
                    {good
                      ? <CheckCircle2 size={14} className="text-emerald-500" />
                      : <AlertTriangle size={14} className="text-amber-500" />
                    }
                    {label}
                  </span>
                  <span className={`text-sm font-semibold ${good ? 'text-emerald-600' : 'text-amber-600'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Col 3: Payments */}
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
                      <p className="text-sm font-medium text-slate-800">{Number(p.amount).toLocaleString('ar-SA')} ر.س</p>
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

      {/* Subscriptions history */}
      {data.subscriptions.length > 1 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">تاريخ الاشتراكات</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>{['الباقة','الفترة','البداية','الانتهاء','السعر','الحالة'].map(h => <th key={h} className="table-th">{h}</th>)}</tr></thead>
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
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ss?.color}`}>{ss?.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Merchant Users ─────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Users size={16} className="text-brand-600" />
            مستخدمو التاجر
            {users.length > 0 && (
              <span className="text-xs text-slate-400 font-normal">({users.length})</span>
            )}
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary text-sm flex items-center gap-1.5 py-1.5"
          >
            <UserPlus size={14} /> إنشاء مستخدم للتاجر
          </button>
        </div>

        {actionError && (
          <div className="mx-5 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" /> {actionError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['الاسم', 'البريد الإلكتروني', 'الدور', 'الحالة', 'آخر دخول', 'الإجراءات'].map(h => (
                  <th key={h} className="table-th whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr><td colSpan={6} className="table-td text-center text-slate-400 py-8">جارٍ التحميل…</td></tr>
              ) : !users.length ? (
                <tr>
                  <td colSpan={6} className="table-td text-center py-10">
                    <Users size={32} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">لا يوجد مستخدمون بعد</p>
                    <p className="text-slate-300 text-xs mt-1">اضغط على "إنشاء مستخدم للتاجر" لإضافة أول مستخدم</p>
                  </td>
                </tr>
              ) : users.map(u => {
                const rs = resetState[u.id];
                return (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="table-td">
                      <p className="font-medium text-slate-900">{u.fullName ?? u.username}</p>
                      <p className="text-xs text-slate-400 font-mono">{u.username}</p>
                      {u.mustChangePassword && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                          يجب تغيير كلمة المرور
                        </span>
                      )}
                    </td>
                    <td className="table-td text-xs text-slate-500">{u.email ?? '—'}</td>
                    <td className="table-td">
                      <select
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                        value={u.role}
                        onChange={e => handleRoleChange(u, e.target.value as UserRole)}
                      >
                        {MERCHANT_ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="table-td">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {u.isActive ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td className="table-td text-xs text-slate-500">{fmtDate(u.lastLogin)}</td>
                    <td className="table-td">
                      <div className="flex flex-col gap-1.5">
                        {/* Toggle active */}
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                            u.isActive
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {u.isActive ? <UserX size={12} /> : <UserCheck size={12} />}
                          {u.isActive ? 'تعطيل' : 'تفعيل'}
                        </button>

                        {/* Reset password toggle */}
                        {!rs ? (
                          <button
                            onClick={() => initReset(u.id)}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
                          >
                            <Key size={12} /> إعادة تعيين كلمة المرور
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <div className="relative">
                              <input
                                type={rs.show ? 'text' : 'password'}
                                className="text-xs border border-slate-300 rounded-lg px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-brand-400 pl-7"
                                placeholder="كلمة مرور جديدة"
                                value={rs.pwd}
                                onChange={e => setResetState(p => ({ ...p, [u.id]: { ...p[u.id], pwd: e.target.value } }))}
                              />
                              <button
                                type="button"
                                className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400"
                                onClick={() => setResetState(p => ({ ...p, [u.id]: { ...p[u.id], show: !p[u.id].show } }))}
                              >
                                {rs.show ? <EyeOff size={11} /> : <Eye size={11} />}
                              </button>
                            </div>
                            <button
                              onClick={() => handleResetPassword(u)}
                              disabled={rs.saving}
                              className="text-xs px-2 py-1 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
                            >
                              {rs.saving ? '…' : 'حفظ'}
                            </button>
                            <button
                              onClick={() => cancelReset(u.id)}
                              className="text-xs text-slate-400 hover:text-slate-600"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create user modal */}
      {showCreateModal && (
        <CreateUserModal
          merchantId={numericId}
          onClose={() => setShowCreateModal(false)}
          onCreated={u => setUsers(prev => [...prev, u])}
        />
      )}

    </div>
  );
}

// Inline SVG bar-chart icon (avoids lucide import collision)
function BarChart3({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
