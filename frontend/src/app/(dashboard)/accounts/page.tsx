'use client';

import { useEffect, useState, useCallback } from 'react';
import { accounts } from '@/lib/api';
import type { Account } from '@/lib/types';

const TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  asset:     { label: 'أصول',          cls: 'bg-blue-100 text-blue-800'  },
  liability: { label: 'خصوم',          cls: 'bg-red-100 text-red-800'    },
  equity:    { label: 'حقوق الملكية',  cls: 'bg-purple-100 text-purple-800' },
  revenue:   { label: 'إيرادات',       cls: 'bg-green-100 text-green-800' },
  expense:   { label: 'مصاريف',        cls: 'bg-orange-100 text-orange-800' },
};

export default function AccountsPage() {
  const [items, setItems]       = useState<Account[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [seeding, setSeeding]   = useState(false);
  const [filterQ, setFilterQ]   = useState('');
  const [filterType, setFilterType] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState({
    code: '', nameAr: '', nameEn: '', accountType: 'asset' as Account['accountType'],
    normalBalance: 'debit' as Account['normalBalance'],
    parentId: '', description: '',
  });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await accounts.list({
        q:          filterQ    || undefined,
        type:       filterType || undefined,
        activeOnly: false,
      });
      setItems(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  }, [filterQ, filterType]);

  useEffect(() => { load(); }, [load]);

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await accounts.seedDefaults();
      if (res.seeded) { alert(`تم إنشاء ${res.count} حساب افتراضي`); load(); }
      else alert(res.message ?? 'الحسابات موجودة بالفعل');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'خطأ');
    } finally {
      setSeeding(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setFormError('');
    if (!form.code || !form.nameAr) { setFormError('كود الحساب والاسم مطلوبان'); return; }
    setSaving(true);
    try {
      await accounts.create({
        code:          form.code,
        nameAr:        form.nameAr,
        nameEn:        form.nameEn || undefined,
        accountType:   form.accountType,
        normalBalance: form.normalBalance,
        parentId:      form.parentId ? parseInt(form.parentId) : undefined,
        description:   form.description || undefined,
      });
      setShowForm(false);
      setForm({ code: '', nameAr: '', nameEn: '', accountType: 'asset', normalBalance: 'debit', parentId: '', description: '' });
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(acc: Account) {
    try {
      await accounts.update(acc.id, { isActive: !acc.isActive });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'خطأ');
    }
  }

  // Group top-level accounts
  const topLevel = items.filter(a => !a.parentId);

  const countByType = items.reduce<Record<string, number>>((acc, a) => {
    acc[a.accountType] = (acc[a.accountType] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">دليل الحسابات</h1>
          <p className="text-sm text-gray-500 mt-1">الخطة المحاسبية — Chart of Accounts</p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <button onClick={handleSeed} disabled={seeding}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {seeding ? 'جاري الإنشاء...' : 'إنشاء الحسابات الافتراضية'}
            </button>
          )}
          <button onClick={() => { setShowForm(v => !v); setFormError(''); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {showForm ? 'إلغاء' : '+ حساب جديد'}
          </button>
        </div>
      </div>

      {/* Type summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(TYPE_LABELS).map(([type, { label, cls }]) => (
          <div key={type} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-1 ${cls}`}>{label}</span>
            <p className="text-xl font-bold text-gray-800">{countByType[type] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">بحث</label>
          <input type="text" value={filterQ} onChange={e => setFilterQ(e.target.value)}
            placeholder="كود / اسم..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">النوع</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">الكل</option>
            {Object.entries(TYPE_LABELS).map(([t, { label }]) => (
              <option key={t} value={t}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* New Account Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">إضافة حساب جديد</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الكود *</label>
              <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="مثال: 1110"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم بالعربي *</label>
              <input type="text" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
                placeholder="اسم الحساب"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم بالإنجليزي</label>
              <input type="text" value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                placeholder="Account name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">النوع</label>
              <select value={form.accountType} onChange={e => setForm(f => ({ ...f, accountType: e.target.value as Account['accountType'] }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {Object.entries(TYPE_LABELS).map(([t, { label }]) => (
                  <option key={t} value={t}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الرصيد الطبيعي</label>
              <select value={form.normalBalance} onChange={e => setForm(f => ({ ...f, normalBalance: e.target.value as Account['normalBalance'] }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="debit">مدين</option>
                <option value="credit">دائن</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الحساب الأب</label>
              <select value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— بدون أب —</option>
                {items.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
              <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="وصف الحساب (اختياري)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium">
              {saving ? 'جاري الحفظ...' : 'حفظ الحساب'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-4">لا توجد حسابات بعد</p>
          <button onClick={handleSeed} disabled={seeding}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
            {seeding ? 'جاري الإنشاء...' : 'إنشاء الحسابات الافتراضية'}
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الكود</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الاسم</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">النوع</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الرصيد الطبيعي</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الأب</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الحالة</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(acc => {
                const typeInfo = TYPE_LABELS[acc.accountType];
                const hasChildren = (acc.children?.length ?? 0) > 0;
                const indent = acc.parentId ? 'pr-8' : 'pr-4';
                return (
                  <tr key={acc.id} className={`hover:bg-gray-50 ${!acc.isActive ? 'opacity-50' : ''}`}>
                    <td className={`px-4 py-2.5 font-mono text-xs text-blue-700 ${indent}`}>
                      {acc.code}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={acc.parentId ? 'text-gray-600' : 'font-semibold text-gray-800'}>
                        {acc.nameAr}
                      </span>
                      {acc.nameEn && <span className="text-xs text-gray-400 mr-2">{acc.nameEn}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo?.cls ?? ''}`}>
                        {typeInfo?.label ?? acc.accountType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {acc.normalBalance === 'debit' ? 'مدين' : 'دائن'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {acc.parent ? `${acc.parent.code} — ${acc.parent.nameAr}` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${acc.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {acc.isActive ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleToggleActive(acc)}
                        className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-2 py-0.5 rounded">
                        {acc.isActive ? 'إيقاف' : 'تفعيل'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {items.length} حساب إجمالاً
          </div>
        </div>
      )}
    </div>
  );
}
