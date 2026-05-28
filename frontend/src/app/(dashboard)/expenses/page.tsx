'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { expenses as expensesApi } from '@/lib/api';
import type { Expense, ExpenseCategory, ExpenseStats } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  cash:          'نقداً',
  credit_card:   'بطاقة ائتمان',
  check:         'شيك',
  other:         'أخرى',
};

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  draft:  { label: 'مسودة', cls: 'bg-yellow-100 text-yellow-800' },
  posted: { label: 'مرحّل', cls: 'bg-green-100 text-green-800'  },
};

const SAR = (n: number | string) =>
  Number(n).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Form defaults ────────────────────────────────────────────────────────────

const emptyForm = () => ({
  expenseDate:     new Date().toISOString().slice(0, 10),
  vendor:          '',
  categoryId:      '',
  description:     '',
  amountBeforeVat: '',
  vatAmount:       '',
  totalAmount:     '',
  paymentMethod:   'bank_transfer',
  referenceNumber: '',
  notes:           '',
});

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [items, setItems]           = useState<Expense[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [stats, setStats]           = useState<ExpenseStats | null>(null);
  const [cats, setCats]             = useState<ExpenseCategory[]>([]);
  const [seeding, setSeeding]       = useState(false);

  // Filters
  const [fFrom, setFFrom]           = useState('');
  const [fTo, setFTo]               = useState('');
  const [fCat, setFCat]             = useState('');
  const [fVendor, setFVendor]       = useState('');
  const [fPayment, setFPayment]     = useState('');
  const [fStatus, setFStatus]       = useState('');

  // Form
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<number | null>(null);
  const [form, setForm]             = useState(emptyForm());
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const fileInputRef                = useRef<HTMLInputElement>(null);

  // ─── Loaders ───────────────────────────────────────────────────────────────

  const loadCats = useCallback(async () => {
    try { setCats(await expensesApi.categories()); } catch { /* non-fatal */ }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setStats(await expensesApi.stats({
        from: fFrom || undefined,
        to:   fTo   || undefined,
      }));
    } catch { /* non-fatal */ }
  }, [fFrom, fTo]);

  const load = useCallback(async (p: number) => {
    setLoading(true); setError('');
    try {
      const res = await expensesApi.list({
        page: p, limit: 20,
        from:          fFrom      || undefined,
        to:            fTo        || undefined,
        categoryId:    fCat       ? parseInt(fCat) : undefined,
        vendor:        fVendor    || undefined,
        paymentMethod: fPayment   || undefined,
        status:        fStatus    || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  }, [fFrom, fTo, fCat, fVendor, fPayment, fStatus]);

  useEffect(() => { loadCats(); }, [loadCats]);
  useEffect(() => { load(page); loadStats(); }, [page, load, loadStats]);

  const totalPages = Math.ceil(total / 20);

  // ─── Seed categories ───────────────────────────────────────────────────────

  async function handleSeedCats() {
    setSeeding(true);
    try {
      const r = await expensesApi.seedCategories();
      if (r.seeded) { alert(`تم إنشاء ${r.count} فئة`); loadCats(); }
      else alert(r.message ?? 'الفئات موجودة');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'خطأ'); }
    finally { setSeeding(false); }
  }

  // ─── Form helpers ──────────────────────────────────────────────────────────

  function setF(field: string, value: string) {
    setForm(f => {
      const updated = { ...f, [field]: value };
      if (field === 'amountBeforeVat' || field === 'vatAmount') {
        const amt = parseFloat(updated.amountBeforeVat || '0');
        const vat = parseFloat(updated.vatAmount       || '0');
        updated.totalAmount = (amt + vat).toFixed(2);
      }
      return updated;
    });
  }

  function openCreate() {
    setForm(emptyForm()); setEditId(null);
    setAttachFile(null); setFormError('');
    setShowForm(true);
  }

  function openEdit(e: Expense) {
    setForm({
      expenseDate:     e.expenseDate,
      vendor:          e.vendor          ?? '',
      categoryId:      e.categoryId      ? String(e.categoryId) : '',
      description:     e.description     ?? '',
      amountBeforeVat: e.amountBeforeVat,
      vatAmount:       e.vatAmount,
      totalAmount:     e.totalAmount,
      paymentMethod:   e.paymentMethod,
      referenceNumber: e.referenceNumber ?? '',
      notes:           e.notes           ?? '',
    });
    setEditId(e.id); setAttachFile(null); setFormError('');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeForm() { setShowForm(false); setEditId(null); setFormError(''); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setFormError('');
    if (!form.expenseDate)     { setFormError('التاريخ مطلوب'); return; }
    if (!form.amountBeforeVat) { setFormError('المبلغ مطلوب'); return; }
    if (!form.totalAmount)     { setFormError('الإجمالي مطلوب'); return; }

    setSaving(true);
    try {
      const dto = {
        expenseDate:     form.expenseDate,
        vendor:          form.vendor          || undefined,
        categoryId:      form.categoryId      ? parseInt(form.categoryId) : undefined,
        description:     form.description     || undefined,
        amountBeforeVat: parseFloat(form.amountBeforeVat),
        vatAmount:       parseFloat(form.vatAmount || '0'),
        totalAmount:     parseFloat(form.totalAmount),
        paymentMethod:   form.paymentMethod   || undefined,
        referenceNumber: form.referenceNumber || undefined,
        notes:           form.notes           || undefined,
      };

      let exp: Expense;
      if (editId) {
        exp = await expensesApi.update(editId, dto);
      } else {
        exp = await expensesApi.create(dto);
      }

      if (attachFile) {
        await expensesApi.uploadAttachment(exp.id, attachFile);
      }

      closeForm();
      load(1); setPage(1); loadStats();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function handlePost(id: number) {
    try { await expensesApi.post(id); load(page); loadStats(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'خطأ'); }
  }

  async function handleDelete(id: number) {
    if (!confirm('هل تريد حذف هذا المصروف؟')) return;
    try { await expensesApi.remove(id); load(page); loadStats(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'خطأ'); }
  }

  async function handleExport() {
    try {
      await expensesApi.exportXlsx({
        from:          fFrom    || undefined,
        to:            fTo      || undefined,
        categoryId:    fCat     ? parseInt(fCat) : undefined,
        paymentMethod: fPayment || undefined,
        status:        fStatus  || undefined,
      });
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'خطأ في التصدير'); }
  }

  function applyFilters() { setPage(1); load(1); loadStats(); }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المصروفات</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة المصروفات والتكاليف</p>
        </div>
        <div className="flex gap-2">
          {cats.length === 0 && (
            <button onClick={handleSeedCats} disabled={seeding}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">
              {seeding ? 'جاري...' : 'إنشاء الفئات الافتراضية'}
            </button>
          )}
          <button onClick={openCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + مصروف جديد
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs text-gray-500">إجمالي المصروفات</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{SAR(stats.totalExpenses)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stats.count} مصروف مرحّل</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs text-gray-500">ضريبة المدخلات المسترجعة</p>
            <p className="text-xl font-bold text-blue-700 mt-1">{SAR(stats.totalVat)}</p>
            <p className="text-xs text-gray-400 mt-0.5">إجمالي ضريبة القيمة المضافة</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs text-gray-500">مصروفات هذا الشهر</p>
            <p className="text-xl font-bold text-orange-600 mt-1">{SAR(stats.thisMonth)}</p>
            <p className="text-xs text-gray-400 mt-0.5">الشهر الحالي</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs text-gray-500">الفئة الأعلى إنفاقاً</p>
            <p className="text-base font-bold text-purple-700 mt-1 truncate">{stats.topCategory ?? '—'}</p>
            <p className="text-xs text-gray-400 mt-0.5">حسب الإجمالي المرحّل</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">من</label>
            <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">إلى</label>
            <input type="date" value={fTo} onChange={e => setFTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">الفئة</label>
            <select value={fCat} onChange={e => setFCat(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="">الكل</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">الجهة / المورد</label>
            <input type="text" value={fVendor} onChange={e => setFVendor(e.target.value)}
              placeholder="بحث..."
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">طريقة الدفع</label>
            <select value={fPayment} onChange={e => setFPayment(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="">الكل</option>
              {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">الحالة</label>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="">الكل</option>
              <option value="draft">مسودة</option>
              <option value="posted">مرحّل</option>
            </select>
          </div>
          <button onClick={applyFilters}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm">
            تطبيق
          </button>
          <button onClick={handleExport}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm">
            تصدير Excel
          </button>
        </div>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-blue-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              {editId ? 'تعديل المصروف' : 'إضافة مصروف جديد'}
            </h2>
            <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>

          {/* Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ *</label>
              <input type="date" value={form.expenseDate} onChange={e => setF('expenseDate', e.target.value)}
                required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الجهة / المورد</label>
              <input type="text" value={form.vendor} onChange={e => setF('vendor', e.target.value)}
                placeholder="اسم المورد أو الجهة"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الفئة</label>
              <select value={form.categoryId} onChange={e => setF('categoryId', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— بدون فئة —</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الدفع</label>
              <select value={form.paymentMethod} onChange={e => setF('paymentMethod', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
              <input type="text" value={form.description} onChange={e => setF('description', e.target.value)}
                placeholder="وصف المصروف"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Row 3 — Amounts */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ قبل الضريبة *</label>
              <input type="number" min="0" step="0.01" value={form.amountBeforeVat}
                onChange={e => setF('amountBeforeVat', e.target.value)}
                required placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ضريبة القيمة المضافة</label>
              <input type="number" min="0" step="0.01" value={form.vatAmount}
                onChange={e => setF('vatAmount', e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الإجمالي *</label>
              <input type="number" min="0" step="0.01" value={form.totalAmount}
                onChange={e => setF('totalAmount', e.target.value)}
                required placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left font-semibold" />
            </div>
          </div>

          {/* Row 4 — Reference + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم المرجع</label>
              <input type="text" value={form.referenceNumber} onChange={e => setF('referenceNumber', e.target.value)}
                placeholder="رقم الفاتورة أو المرجع"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
              <input type="text" value={form.notes} onChange={e => setF('notes', e.target.value)}
                placeholder="ملاحظات إضافية"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Attachment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المرفق (وصل / فاتورة)</label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp"
                onChange={e => setAttachFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button type="button"
                onClick={() => fileInputRef.current?.click()}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                {attachFile ? attachFile.name : 'اختر ملفاً (PDF / صورة)'}
              </button>
              {attachFile && (
                <button type="button" onClick={() => { setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-red-500 text-sm hover:text-red-700">إلغاء</button>
              )}
            </div>
          </div>

          {formError && <p className="text-red-600 text-sm">{formError}</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
              {saving ? 'جاري الحفظ...' : editId ? 'تحديث المصروف' : 'حفظ المصروف'}
            </button>
            <button type="button" onClick={closeForm}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              إلغاء
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white border border-gray-200 rounded-xl">
          <p className="text-lg mb-2">لا توجد مصروفات</p>
          <p className="text-sm">أضف مصروفاً جديداً بالضغط على + مصروف جديد</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">التاريخ</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">الجهة / المورد</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">الفئة</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">الوصف</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">قبل الضريبة</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">الضريبة</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600 whitespace-nowrap">الإجمالي</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">الدفع</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">المرجع</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">الحالة</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600 whitespace-nowrap">مرفق</th>
                  <th className="px-3 py-3 whitespace-nowrap" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(exp => {
                  const st = STATUS_STYLE[exp.status] ?? STATUS_STYLE.draft;
                  return (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{exp.expenseDate}</td>
                      <td className="px-3 py-2.5 text-gray-800 max-w-[120px] truncate">{exp.vendor ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs max-w-[120px] truncate">
                        {exp.category?.name ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-[160px] truncate">{exp.description ?? '—'}</td>
                      <td className="px-3 py-2.5 text-left font-mono text-xs whitespace-nowrap">
                        {SAR(exp.amountBeforeVat)}
                      </td>
                      <td className="px-3 py-2.5 text-left font-mono text-xs text-blue-600 whitespace-nowrap">
                        {Number(exp.vatAmount) > 0 ? SAR(exp.vatAmount) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-left font-mono text-xs font-semibold whitespace-nowrap">
                        {SAR(exp.totalAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {PAYMENT_LABELS[exp.paymentMethod] ?? exp.paymentMethod}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                        {exp.referenceNumber ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {exp.attachmentName ? (
                          <a
                            href={expensesApi.attachmentUrl(exp.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-xs underline"
                          >
                            {exp.attachmentName.length > 14 ? exp.attachmentName.slice(0, 12) + '…' : exp.attachmentName}
                          </a>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex gap-1 justify-end">
                          {exp.status === 'draft' && (
                            <>
                              <button onClick={() => openEdit(exp)}
                                className="text-xs px-2 py-0.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
                                تعديل
                              </button>
                              <button onClick={() => handlePost(exp.id)}
                                className="text-xs px-2 py-0.5 border border-green-300 rounded text-green-700 hover:bg-green-50">
                                ترحيل
                              </button>
                              <button onClick={() => handleDelete(exp.id)}
                                className="text-xs px-2 py-0.5 border border-red-200 rounded text-red-500 hover:bg-red-50">
                                حذف
                              </button>
                            </>
                          )}
                          {exp.status === 'posted' && exp.journalEntryId && (
                            <span className="text-xs text-green-600 px-1">
                              JE#{exp.journalEntryId}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span>{total} مصروف إجمالاً</span>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40">السابق</button>
          <span className="text-sm text-gray-600">صفحة {page} من {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40">التالي</button>
        </div>
      )}
    </div>
  );
}
