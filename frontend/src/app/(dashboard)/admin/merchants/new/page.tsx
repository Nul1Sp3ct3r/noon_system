'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { platformAdmin } from '@/lib/api';
import { PlatformAdminGuard } from '@/components/platform-admin-guard';
import type { MerchantStatus } from '@/lib/types';
import { AlertCircle, ChevronRight, Building2 } from 'lucide-react';

const STATUS_OPTIONS: { value: MerchantStatus; label: string }[] = [
  { value: 'trial',     label: 'تجريبي' },
  { value: 'active',   label: 'نشط' },
  { value: 'suspended', label: 'معلق' },
  { value: 'expired',  label: 'منتهي' },
  { value: 'cancelled', label: 'ملغي' },
];

export default function NewMerchantPage() {
  return (
    <PlatformAdminGuard>
      <NewMerchantForm />
    </PlatformAdminGuard>
  );
}

function NewMerchantForm() {
  const router = useRouter();

  const [form, setForm] = useState({
    businessName: '',
    ownerName:    '',
    email:        '',
    phone:        '',
    crNumber:     '',
    vatNumber:    '',
    status:       'trial' as MerchantStatus,
    notes:        '',
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.businessName.trim()) {
      setError('اسم المنشأة مطلوب');
      return;
    }

    setSaving(true);
    setError('');

    // Only send non-empty optional fields to avoid DTO validation rejecting empty strings
    const dto: Record<string, string> = { businessName: form.businessName.trim(), status: form.status };
    if (form.ownerName.trim()) dto.ownerName = form.ownerName.trim();
    if (form.email.trim())     dto.email     = form.email.trim();
    if (form.phone.trim())     dto.phone     = form.phone.trim();
    if (form.crNumber.trim())  dto.crNumber  = form.crNumber.trim();
    if (form.vatNumber.trim()) dto.vatNumber = form.vatNumber.trim();
    if (form.notes.trim())     dto.notes     = form.notes.trim();

    try {
      const created = await platformAdmin.createMerchant(dto);
      router.push(`/admin/merchants/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل إنشاء التاجر');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin/merchants" className="hover:text-brand-600 transition-colors">
          إدارة التجار
        </Link>
        <ChevronRight size={14} />
        <span className="text-slate-900 font-medium">تاجر جديد</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center">
          <Building2 size={22} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">إضافة تاجر جديد</h1>
          <p className="text-slate-500 text-sm mt-0.5">أدخل بيانات المنشأة</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="card p-6 space-y-5">

        {/* Business name — required */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            اسم المنشأة <span className="text-red-500">*</span>
          </label>
          <input
            className="input"
            placeholder="اسم الشركة أو المتجر"
            value={form.businessName}
            onChange={e => set('businessName', e.target.value)}
            required
            autoFocus
          />
        </div>

        {/* Owner name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">اسم المالك</label>
          <input
            className="input"
            placeholder="الاسم الكامل"
            value={form.ownerName}
            onChange={e => set('ownerName', e.target.value)}
          />
        </div>

        {/* Email + Phone — side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">البريد الإلكتروني</label>
            <input
              className="input"
              type="email"
              placeholder="email@example.com"
              value={form.email}
              onChange={e => set('email', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">رقم الجوال</label>
            <input
              className="input"
              type="tel"
              placeholder="05xxxxxxxx"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
            />
          </div>
        </div>

        {/* CR + VAT — side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">السجل التجاري</label>
            <input
              className="input"
              placeholder="رقم السجل التجاري"
              value={form.crNumber}
              onChange={e => set('crNumber', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">الرقم الضريبي</label>
            <input
              className="input"
              placeholder="الرقم الضريبي (VAT)"
              value={form.vatNumber}
              onChange={e => set('vatNumber', e.target.value)}
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">حالة الحساب</label>
          <select
            className="input"
            value={form.status}
            onChange={e => set('status', e.target.value)}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="أي ملاحظات إضافية…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'إنشاء التاجر'}
          </button>
          <Link href="/admin/merchants" className="btn-ghost text-sm">
            إلغاء
          </Link>
        </div>

      </form>
    </div>
  );
}
