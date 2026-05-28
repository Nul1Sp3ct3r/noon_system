'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Receipt, TrendingDown, Clock, BarChart2, Tag, Calendar,
  Plus, Upload, RefreshCw, FileDown, AlertCircle, X,
  ChevronDown, ChevronUp, Paperclip, AlertTriangle,
} from 'lucide-react';
import { expenses as expensesApi } from '@/lib/api';
import type { Expense, ExpenseCategory, ExpenseStats } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer:    'تحويل بنكي',
  cash:             'نقداً',
  credit_card:      'بطاقة ائتمان',
  check:            'شيك',
  other:            'أخرى',
  treasury:         'خزينة',
  stc_pay:          'STC Pay',
  employee_advance: 'عهدة موظف',
  deferred:         'آجل',
};

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  draft:            { label: 'مسودة',            cls: 'bg-slate-100  text-slate-600',  dot: 'bg-slate-400'  },
  pending_approval: { label: 'بانتظار الاعتماد', cls: 'bg-amber-100  text-amber-700',  dot: 'bg-amber-500'  },
  approved:         { label: 'معتمد',             cls: 'bg-blue-100   text-blue-700',   dot: 'bg-blue-500'   },
  paid:             { label: 'مدفوع',             cls: 'bg-teal-100   text-teal-700',   dot: 'bg-teal-500'   },
  posted:           { label: 'مرحّل',             cls: 'bg-green-100  text-green-700',  dot: 'bg-green-500'  },
  rejected:         { label: 'مرفوض',             cls: 'bg-red-100    text-red-700',    dot: 'bg-red-500'    },
};

const VAT_TREATMENTS = [
  { value: 'exclusive',        label: 'حصري — تُحسب الضريبة منفصلة' },
  { value: 'inclusive',        label: 'شامل — الضريبة مضمّنة في المبلغ' },
  { value: 'exempt',           label: 'معفى من الضريبة'              },
  { value: 'out_of_scope',     label: 'خارج نطاق الضريبة'            },
  { value: 'full_recovery',    label: 'استرداد كامل'                  },
  { value: 'partial_recovery', label: 'استرداد جزئي'                  },
];

const APPROVAL_THRESHOLD = 5000; // SAR

const SAR = (n: number | string) =>
  Number(n).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  vatTreatment:    'exclusive',
  costCenter:      '',
  accountCode:     '',
  status:          'draft',
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [items, setItems]       = useState<Expense[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [stats, setStats]       = useState<ExpenseStats | null>(null);
  const [cats, setCats]         = useState<ExpenseCategory[]>([]);
  const [seeding, setSeeding]   = useState(false);

  // Filters
  const [fQ, setFQ]             = useState('');
  const [fFrom, setFFrom]       = useState('');
  const [fTo, setFTo]           = useState('');
  const [fCat, setFCat]         = useState('');
  const [fVendor, setFVendor]   = useState('');
  const [fPayment, setFPayment] = useState('');
  const [fStatus, setFStatus]   = useState('');
  const [fAmtMin, setFAmtMin]   = useState('');
  const [fAmtMax, setFAmtMax]   = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const searchDebounce          = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<number | null>(null);
  const [form, setForm]         = useState(emptyForm());
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');
  const fileInputRef            = useRef<HTMLInputElement>(null);

  // Expanded rows
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // ─── Loaders ─────────────────────────────────────────────────────────────────

  const loadCats = useCallback(async () => {
    try { setCats(await expensesApi.categories()); } catch { /* non-fatal */ }
  }, []);

  const loadStats = useCallback(async () => {
    try { setStats(await expensesApi.stats({ from: fFrom || undefined, to: fTo || undefined })); }
    catch { /* non-fatal */ }
  }, [fFrom, fTo]);

  const load = useCallback(async (p: number) => {
    setLoading(true); setError('');
    try {
      const res = await expensesApi.list({
        page: p, limit: 20,
        q:             fQ       || undefined,
        from:          fFrom    || undefined,
        to:            fTo      || undefined,
        categoryId:    fCat     ? parseInt(fCat) : undefined,
        vendor:        fVendor  || undefined,
        paymentMethod: fPayment || undefined,
        status:        fStatus  || undefined,
        amountMin:     fAmtMin  ? parseFloat(fAmtMin) : undefined,
        amountMax:     fAmtMax  ? parseFloat(fAmtMax) : undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  }, [fQ, fFrom, fTo, fCat, fVendor, fPayment, fStatus, fAmtMin, fAmtMax]);

  useEffect(() => { loadCats(); }, [loadCats]);
  useEffect(() => { load(page); loadStats(); }, [page, load, loadStats]);

  const totalPages = Math.ceil(total / 20);

  function handleSearchChange(val: string) {
    setFQ(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => { setPage(1); }, 400);
  }

  function applyFilters()  { setPage(1); load(1); loadStats(); }
  function clearFilters()  { setFQ(''); setFFrom(''); setFTo(''); setFCat(''); setFVendor(''); setFPayment(''); setFStatus(''); setFAmtMin(''); setFAmtMax(''); setPage(1); }

  // ─── Seed categories ─────────────────────────────────────────────────────────

  async function handleSeedCats() {
    setSeeding(true);
    try {
      const r = await expensesApi.seedCategories();
      if (r.seeded) { alert(`تم إنشاء ${r.count} فئة`); loadCats(); }
      else alert(r.message ?? 'الفئات موجودة');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'خطأ'); }
    finally { setSeeding(false); }
  }

  // ─── Form helpers ─────────────────────────────────────────────────────────────

  function setF(field: string, value: string) {
    setForm(f => {
      const updated = { ...f, [field]: value };
      if (field === 'amountBeforeVat' || field === 'vatAmount') {
        const amt = parseFloat(updated.amountBeforeVat || '0');
        const vat = parseFloat(updated.vatAmount || '0');
        updated.totalAmount = (amt + vat).toFixed(2);
        // Auto-suggest approval if over threshold
        if (amt + vat > APPROVAL_THRESHOLD && updated.status === 'draft') {
          updated.status = 'pending_approval';
        }
      }
      return updated;
    });
  }

  function openCreate() {
    setForm(emptyForm()); setEditId(null);
    setAttachFile(null); setFormError('');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      vatTreatment:    e.vatTreatment    ?? 'exclusive',
      costCenter:      e.costCenter      ?? '',
      accountCode:     e.accountCode     ?? '',
      status:          e.status,
    });
    setEditId(e.id); setAttachFile(null); setFormError('');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeForm() { setShowForm(false); setEditId(null); setFormError(''); }

  // Computed summary
  const formTotal     = parseFloat(form.totalAmount     || '0');
  const formVat       = parseFloat(form.vatAmount       || '0');
  const formNetAmount = formTotal;                           // net = total (VAT embedded or separate)
  const overThreshold = formTotal > APPROVAL_THRESHOLD;

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
        vatTreatment:    form.vatTreatment    || undefined,
        costCenter:      form.costCenter      || undefined,
        accountCode:     form.accountCode     || undefined,
        status:          form.status          || undefined,
      };

      let exp: Expense;
      if (editId) exp = await expensesApi.update(editId, dto);
      else        exp = await expensesApi.create(dto);

      if (attachFile) await expensesApi.uploadAttachment(exp.id, attachFile);

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

  const hasActiveFilters = fQ || fFrom || fTo || fCat || fVendor || fPayment || fStatus || fAmtMin || fAmtMax;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" dir="rtl">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">إدارة المصروفات التشغيلية</h1>
          <p className="text-xs text-slate-400 mt-0.5">مصروفات غير مخزنية — تؤثر مباشرة على الأرباح والخسائر</p>
        </div>
        {cats.length === 0 && (
          <button onClick={handleSeedCats} disabled={seeding}
            className="text-xs text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
            {seeding ? 'جاري...' : 'إنشاء الفئات الافتراضية'}
          </button>
        )}
      </div>

      {/* ── KPI Dashboard ───────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            {
              label: 'مصروفات الشهر',
              value: SAR(stats.thisMonth),
              sub:   'الشهر الحالي',
              icon:  Calendar,
              color: 'text-blue-600',
              bg:    'bg-blue-50',
            },
            {
              label: 'ضريبة قابلة للاسترداد',
              value: SAR(stats.totalVat),
              sub:   'إجمالي ض.ق.م مدفوعة',
              icon:  Receipt,
              color: 'text-violet-600',
              bg:    'bg-violet-50',
            },
            {
              label: 'مصروفات غير مدفوعة',
              value: String(stats.unpaidExpenses),
              sub:   'مسودة + مراجعة + معتمدة',
              icon:  Clock,
              color: 'text-amber-600',
              bg:    'bg-amber-50',
              warn:  stats.unpaidExpenses > 0,
            },
            {
              label: 'إجمالي المصروفات',
              value: SAR(stats.totalExpenses),
              sub:   `${stats.count} مصروف مرحّل`,
              icon:  TrendingDown,
              color: 'text-red-500',
              bg:    'bg-red-50',
            },
            {
              label: 'الفئة الأعلى',
              value: stats.topCategory ?? '—',
              sub:   'حسب الإجمالي',
              icon:  Tag,
              color: 'text-emerald-600',
              bg:    'bg-emerald-50',
            },
            {
              label: 'متوسط شهري',
              value: SAR(stats.monthlyAverage),
              sub:   'آخر 12 شهر',
              icon:  BarChart2,
              color: 'text-slate-600',
              bg:    'bg-slate-100',
            },
          ].map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className={`bg-white rounded-xl border px-4 py-3.5 ${(card as any).warn ? 'border-amber-200' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-500 leading-tight">{card.label}</span>
                  <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                    <Icon size={13} className={card.color} />
                  </div>
                </div>
                <p className={`text-base font-bold tabular-nums truncate ${(card as any).warn ? 'text-amber-700' : 'text-slate-900'}`}>
                  {card.value}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{card.sub}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Quick Action Bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={openCreate}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          <Plus size={14} />
          مصروف جديد
        </button>
        <button
          onClick={() => { setForm({ ...emptyForm(), status: 'draft' }); setAttachFile(null); setShowForm(true); fileInputRef.current?.click(); }}
          className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
          <Upload size={14} />
          رفع إيصال
        </button>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
          <RefreshCw size={14} />
          مصروف متكرر
        </button>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 text-sm px-3 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100">
          <FileDown size={14} />
          تصدير Excel
        </button>
        <div className="flex-1" />
        <span className="text-xs text-slate-400">{total} مصروف</span>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="بحث: الجهة / الوصف / المرجع..."
            value={fQ}
            onChange={e => handleSearchChange(e.target.value)}
          />
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded-lg transition-colors ${showFilters ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            فلاتر متقدمة
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters}
              className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-50">
              مسح الفلاتر
            </button>
          )}
        </div>

        {showFilters && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">من تاريخ</label>
              <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">إلى تاريخ</label>
              <input type="date" value={fTo} onChange={e => setFTo(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">الفئة</label>
              <select value={fCat} onChange={e => setFCat(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">الكل</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">الحالة</label>
              <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">الكل</option>
                {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">طريقة الدفع</label>
              <select value={fPayment} onChange={e => setFPayment(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">الكل</option>
                {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">الجهة / المورد</label>
              <input type="text" value={fVendor} onChange={e => setFVendor(e.target.value)}
                placeholder="بحث..."
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">حد أدنى للمبلغ</label>
              <input type="number" min="0" step="0.01" value={fAmtMin} onChange={e => setFAmtMin(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-left focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">حد أقصى للمبلغ</label>
              <input type="number" min="0" step="0.01" value={fAmtMax} onChange={e => setFAmtMax(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-left focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-end">
              <button onClick={applyFilters}
                className="w-full text-sm bg-blue-600 text-white rounded-lg py-1.5 hover:bg-blue-700">
                تطبيق
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Expense Form ────────────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-blue-200 rounded-xl shadow-sm overflow-hidden">
          {/* Form header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">
                {editId ? 'تعديل المصروف' : 'مصروف تشغيلي جديد'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">مصروف غير مخزني — يُقيَّد مباشرة في الأرباح والخسائر</p>
            </div>
            <button type="button" onClick={closeForm}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400">
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                {formError}
              </div>
            )}

            {/* Threshold warning */}
            {overThreshold && form.status !== 'posted' && form.status !== 'paid' && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800 flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                المبلغ يتجاوز حد الاعتماد ({SAR(APPROVAL_THRESHOLD)} ر.س) — تمت إعادة تعيين الحالة إلى "بانتظار الاعتماد"
              </div>
            )}

            {/* ─ Section 1: بيانات المصروف ─ */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">بيانات المصروف</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">التاريخ <span className="text-red-400">*</span></label>
                  <input type="date" value={form.expenseDate} onChange={e => setF('expenseDate', e.target.value)}
                    className="input w-full" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الجهة / المورد</label>
                  <input type="text" value={form.vendor} onChange={e => setF('vendor', e.target.value)}
                    placeholder="اسم المورد"
                    className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الفئة</label>
                  <select value={form.categoryId} onChange={e => setF('categoryId', e.target.value)}
                    className="input w-full">
                    <option value="">— بدون فئة —</option>
                    {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">رقم المرجع</label>
                  <input type="text" value={form.referenceNumber} onChange={e => setF('referenceNumber', e.target.value)}
                    placeholder="رقم الفاتورة"
                    className="input w-full" />
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1">الوصف</label>
                  <input type="text" value={form.description} onChange={e => setF('description', e.target.value)}
                    placeholder="وصف المصروف"
                    className="input w-full" />
                </div>
              </div>
            </div>

            {/* ─ Section 2: التصنيف المحاسبي ─ */}
            <div className="pt-1 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3 mt-3">التصنيف المحاسبي</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الحساب المحاسبي</label>
                  <input type="text" value={form.accountCode} onChange={e => setF('accountCode', e.target.value)}
                    placeholder="5100 — رسوم نون"
                    className="input w-full font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">مركز التكلفة</label>
                  <select value={form.costCenter} onChange={e => setF('costCenter', e.target.value)}
                    className="input w-full">
                    <option value="">— اختر —</option>
                    <option value="إدارة">إدارة</option>
                    <option value="مبيعات">مبيعات</option>
                    <option value="تشغيل">تشغيل</option>
                    <option value="مستودع">مستودع</option>
                    <option value="تقنية">تقنية</option>
                    <option value="تسويق">تسويق</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">معالجة الضريبة</label>
                  <select value={form.vatTreatment} onChange={e => setF('vatTreatment', e.target.value)}
                    className="input w-full">
                    {VAT_TREATMENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ─ Section 3: المبالغ + الدفع ─ */}
            <div className="pt-1 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3 mt-3">المبالغ وبيانات الدفع</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المبلغ قبل الضريبة <span className="text-red-400">*</span></label>
                  <input type="number" min="0" step="0.01" value={form.amountBeforeVat}
                    onChange={e => setF('amountBeforeVat', e.target.value)}
                    placeholder="0.00" required
                    className="input w-full text-left tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ضريبة القيمة المضافة</label>
                  <input type="number" min="0" step="0.01" value={form.vatAmount}
                    onChange={e => setF('vatAmount', e.target.value)}
                    placeholder="0.00"
                    className="input w-full text-left tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الإجمالي <span className="text-red-400">*</span></label>
                  <input type="number" min="0" step="0.01" value={form.totalAmount}
                    onChange={e => setF('totalAmount', e.target.value)}
                    placeholder="0.00" required
                    className="input w-full text-left tabular-nums font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">طريقة الدفع</label>
                  <select value={form.paymentMethod} onChange={e => setF('paymentMethod', e.target.value)}
                    className="input w-full">
                    {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الحالة</label>
                  <select value={form.status} onChange={e => setF('status', e.target.value)}
                    className="input w-full">
                    {Object.entries(STATUS_CONFIG).filter(([v]) => v !== 'posted').map(([v, c]) => (
                      <option key={v} value={v}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
                  <input type="text" value={form.notes} onChange={e => setF('notes', e.target.value)}
                    placeholder="اختيارية"
                    className="input w-full" />
                </div>
              </div>
            </div>

            {/* ─ Section 4: المرفقات ─ */}
            <div className="pt-1 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3 mt-3">المرفق (وصل / فاتورة)</p>
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
                  className="flex items-center gap-2 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:border-blue-300 transition-colors">
                  <Paperclip size={13} />
                  {attachFile ? attachFile.name : 'اختر ملفاً — PDF أو صورة'}
                </button>
                {attachFile && (
                  <button type="button"
                    onClick={() => { setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-red-400 text-sm hover:text-red-600 flex items-center gap-1">
                    <X size={13} /> إلغاء
                  </button>
                )}
              </div>
            </div>

            {/* ─ Section 5: الملخص المالي ─ */}
            {formTotal > 0 && (
              <div className="pt-1 border-t border-slate-100">
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap gap-6 text-sm">
                  <div>
                    <p className="text-[10px] text-slate-400">قبل الضريبة</p>
                    <p className="font-medium tabular-nums">{SAR(form.amountBeforeVat || 0)} ر.س</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">الضريبة</p>
                    <p className="font-medium tabular-nums text-amber-600">{SAR(form.vatAmount || 0)} ر.س</p>
                  </div>
                  <div className="border-r border-slate-200 pr-6">
                    <p className="text-[10px] text-slate-400">الإجمالي</p>
                    <p className={`text-lg font-bold tabular-nums ${overThreshold ? 'text-amber-700' : 'text-slate-900'}`}>
                      {SAR(formTotal)} ر.س
                    </p>
                  </div>
                  {formVat > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-400">ضريبة قابلة للاسترداد</p>
                      <p className="font-medium tabular-nums text-violet-600">{SAR(formVat)} ر.س</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Form actions */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/50">
            <button type="button" onClick={closeForm}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-white text-slate-600">
              إلغاء
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium min-w-[130px]">
              {saving ? 'جاري الحفظ...' : editId ? 'تحديث المصروف' : 'حفظ المصروف'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Expense Table ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center text-slate-400 text-sm">
          جاري التحميل...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center">
          <Receipt size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">لا توجد مصروفات</p>
          <p className="text-slate-400 text-sm mt-1">أضف مصروفاً جديداً من القائمة أعلاه</p>
          {cats.length === 0 && (
            <button onClick={handleSeedCats} disabled={seeding}
              className="mt-4 text-sm text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 px-4 py-2 rounded-lg disabled:opacity-50">
              {seeding ? 'جاري...' : 'إنشاء الفئات الافتراضية أولاً'}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  {['التاريخ', 'الجهة / المورد', 'الفئة', 'الوصف', 'الحساب', 'مركز التكلفة',
                    'الحالة', 'طريقة الدفع', 'قبل الضريبة', 'الضريبة', 'الإجمالي', 'مرفق', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(exp => {
                  const st = STATUS_CONFIG[exp.status] ?? STATUS_CONFIG.draft;
                  const isExpanded = expandedId === exp.id;
                  return (
                    <>
                      <tr key={exp.id}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">{exp.expenseDate}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[120px] truncate">{exp.vendor ?? '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[100px] truncate">
                          {exp.category?.name ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-[150px] truncate text-xs">{exp.description ?? '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-400">
                          {exp.accountCode ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-400">
                          {exp.costCenter ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot} shrink-0`} />
                            {st.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {PAYMENT_LABELS[exp.paymentMethod] ?? exp.paymentMethod}
                        </td>
                        <td className="px-3 py-2.5 text-left tabular-nums text-xs text-slate-600 whitespace-nowrap">
                          {SAR(exp.amountBeforeVat)}
                        </td>
                        <td className="px-3 py-2.5 text-left tabular-nums text-xs text-amber-600 whitespace-nowrap">
                          {Number(exp.vatAmount) > 0 ? SAR(exp.vatAmount) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-left tabular-nums text-sm font-semibold whitespace-nowrap">
                          {SAR(exp.totalAmount)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {exp.attachmentName ? (
                            <a
                              href={expensesApi.attachmentUrl(exp.id)}
                              target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 text-xs underline"
                            >
                              <Paperclip size={12} className="inline ml-0.5" />
                              {exp.attachmentName.slice(0, 10)}{exp.attachmentName.length > 10 ? '…' : ''}
                            </a>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end">
                            {(exp.status === 'draft' || exp.status === 'pending_approval' || exp.status === 'approved') && (
                              <button onClick={() => openEdit(exp)}
                                className="text-xs px-2 py-0.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">
                                تعديل
                              </button>
                            )}
                            {exp.status === 'draft' && (
                              <button onClick={() => handlePost(exp.id)}
                                className="text-xs px-2 py-0.5 border border-green-300 rounded text-green-700 hover:bg-green-50">
                                ترحيل
                              </button>
                            )}
                            {exp.status === 'draft' && (
                              <button onClick={() => handleDelete(exp.id)}
                                className="text-xs px-2 py-0.5 border border-red-200 rounded text-red-500 hover:bg-red-50">
                                حذف
                              </button>
                            )}
                            {exp.status === 'posted' && exp.journalEntryId && (
                              <span className="text-xs text-green-600 font-mono px-1">JE#{exp.journalEntryId}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr key={`${exp.id}-expanded`} className="bg-blue-50/30">
                          <td colSpan={13} className="px-5 py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                              <div>
                                <p className="text-slate-400 mb-0.5">معالجة الضريبة</p>
                                <p className="text-slate-700">
                                  {VAT_TREATMENTS.find(t => t.value === exp.vatTreatment)?.label ?? exp.vatTreatment ?? '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-400 mb-0.5">رقم المرجع</p>
                                <p className="font-mono text-slate-700">{exp.referenceNumber ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 mb-0.5">ملاحظات</p>
                                <p className="text-slate-700">{exp.notes ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 mb-0.5">صافي المصروف (بعد استرداد ضريبي)</p>
                                <p className="font-semibold text-slate-800 tabular-nums">
                                  {SAR(Number(exp.totalAmount) - Number(exp.vatAmount))} ر.س
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>{total} مصروف إجمالاً</span>
            {items.length > 0 && (
              <span className="tabular-nums font-medium text-slate-600">
                مجموع الصفحة: {SAR(items.reduce((s, e) => s + Number(e.totalAmount), 0))} ر.س
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pb-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50">
            السابق
          </button>
          <span className="text-sm text-slate-500">صفحة {page} من {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50">
            التالي
          </button>
        </div>
      )}

    </div>
  );
}
