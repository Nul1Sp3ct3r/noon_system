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

const ACCOUNT_OPTIONS = [
  { code: '5100', name: 'مصاريف إعلانات وتسويق' },
  { code: '5200', name: 'مصاريف شحن وتوصيل'     },
  { code: '5250', name: 'رسوم بنكية ومصرفية'    },
  { code: '5300', name: 'رسوم منصة نون'          },
  { code: '5400', name: 'اشتراكات وتراخيص'       },
  { code: '5500', name: 'إيجار ومرافق'           },
  { code: '5600', name: 'مصاريف برامج وتقنية'    },
  { code: '5700', name: 'مصاريف تشغيلية'         },
  { code: '5800', name: 'مصاريف متنوعة'          },
];

const QUICK_PRESETS = [
  { label: 'إعلان',    accountCode: '5100', costCenter: 'تسويق',  paymentMethod: 'bank_transfer', vatTreatment: 'exclusive', description: 'مصروف إعلانات',  categoryHint: 'إعلان',  bgCls: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100' },
  { label: 'شحن',      accountCode: '5200', costCenter: 'تشغيل',  paymentMethod: 'bank_transfer', vatTreatment: 'exclusive', description: 'مصروف شحن',      categoryHint: 'شحن',    bgCls: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'         },
  { label: 'رسوم نون', accountCode: '5300', costCenter: 'تشغيل',  paymentMethod: 'deferred',      vatTreatment: 'exclusive', description: 'رسوم إحالة نون', categoryHint: 'نون',    bgCls: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' },
  { label: 'برنامج',   accountCode: '5600', costCenter: 'تقنية',  paymentMethod: 'credit_card',   vatTreatment: 'exempt',    description: 'اشتراك برنامج',  categoryHint: 'برمجة', bgCls: 'bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100'         },
  { label: 'إيجار',    accountCode: '5500', costCenter: 'إدارة',  paymentMethod: 'bank_transfer', vatTreatment: 'exclusive', description: 'إيجار',          categoryHint: 'إيجار', bgCls: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'         },
  { label: 'اشتراك',   accountCode: '5400', costCenter: 'تقنية',  paymentMethod: 'credit_card',   vatTreatment: 'exempt',    description: 'اشتراك شهري',    categoryHint: 'اشتراك',bgCls: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100'         },
];

const APPROVAL_THRESHOLD = 5000;

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

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<number | null>(null);
  const [form, setForm]         = useState(emptyForm());
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');
  const fileInputRef            = useRef<HTMLInputElement>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);

  // ─── Loaders ──────────────────────────────────────────────────────────────

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

  function applyFilters() { setPage(1); load(1); loadStats(); }
  function clearFilters() {
    setFQ(''); setFFrom(''); setFTo(''); setFCat(''); setFVendor('');
    setFPayment(''); setFStatus(''); setFAmtMin(''); setFAmtMax(''); setPage(1);
  }

  async function handleSeedCats() {
    setSeeding(true);
    try {
      const r = await expensesApi.seedCategories();
      if (r.seeded) { alert(`تم إنشاء ${r.count} فئة`); loadCats(); }
      else alert(r.message ?? 'الفئات موجودة');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'خطأ'); }
    finally { setSeeding(false); }
  }

  // ─── Form helpers ─────────────────────────────────────────────────────────

  function setF(field: string, value: string) {
    setForm(f => {
      const updated = { ...f, [field]: value };
      if (field === 'amountBeforeVat' || field === 'vatAmount') {
        const amt = parseFloat(updated.amountBeforeVat || '0');
        const vat = parseFloat(updated.vatAmount || '0');
        updated.totalAmount = (amt + vat).toFixed(2);
        if (amt + vat > APPROVAL_THRESHOLD && updated.status === 'draft') {
          updated.status = 'pending_approval';
        }
      }
      return updated;
    });
  }

  function applyPreset(preset: typeof QUICK_PRESETS[0]) {
    const matchedCat = cats.find(c =>
      c.name.includes(preset.categoryHint) || preset.categoryHint.includes(c.name)
    );
    setForm(f => ({
      ...f,
      accountCode:   preset.accountCode,
      costCenter:    preset.costCenter,
      paymentMethod: preset.paymentMethod,
      vatTreatment:  preset.vatTreatment,
      description:   f.description || preset.description,
      categoryId:    matchedCat ? String(matchedCat.id) : f.categoryId,
    }));
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

  const formTotal     = parseFloat(form.totalAmount     || '0');
  const formVat       = parseFloat(form.vatAmount       || '0');
  const formBase      = parseFloat(form.amountBeforeVat || '0');
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

  // Trend: compare thisMonth vs monthlyAverage
  const trendRatio = stats && stats.monthlyAverage > 0 ? stats.thisMonth / stats.monthlyAverage : null;
  const trendPct   = trendRatio ? Math.round((trendRatio - 1) * 100) : null;

  const kpiCards = [
    {
      label:   'مصروفات هذا الشهر',
      value:   SAR(stats?.thisMonth ?? 0) + ' ر.س',
      sub:     trendPct !== null
        ? (trendPct > 5 ? `أعلى ${trendPct}% من المتوسط` : trendPct < -5 ? `أقل ${Math.abs(trendPct)}% من المتوسط` : 'مساوٍ للمتوسط')
        : 'الشهر الحالي',
      icon:    Calendar,
      accent:  'border-r-4 border-r-blue-500',
      iconBg:  'bg-blue-100', iconCls: 'text-blue-600', valCls: 'text-slate-900',
      subCls:  trendPct !== null && trendPct > 5 ? 'text-red-500 font-semibold' : trendPct !== null && trendPct < -5 ? 'text-emerald-600 font-semibold' : 'text-slate-400',
    },
    {
      label:   'ضريبة قابلة للاسترداد',
      value:   SAR(stats?.totalVat ?? 0) + ' ر.س',
      sub:     'إجمالي ض.ق.م مدفوعة',
      icon:    Receipt,
      accent:  'border-r-4 border-r-violet-500',
      iconBg:  'bg-violet-100', iconCls: 'text-violet-600', valCls: 'text-violet-700', subCls: 'text-slate-400',
    },
    {
      label:   'بانتظار الاعتماد',
      value:   String(stats?.unpaidExpenses ?? 0),
      sub:     (stats?.unpaidExpenses ?? 0) > 0 ? 'تحتاج مراجعة فورية' : 'لا توجد معلقة',
      icon:    Clock,
      accent:  (stats?.unpaidExpenses ?? 0) > 0 ? 'border-r-4 border-r-amber-500' : 'border-r-4 border-r-slate-300',
      iconBg:  (stats?.unpaidExpenses ?? 0) > 0 ? 'bg-amber-100' : 'bg-slate-100',
      iconCls: (stats?.unpaidExpenses ?? 0) > 0 ? 'text-amber-600' : 'text-slate-400',
      valCls:  (stats?.unpaidExpenses ?? 0) > 0 ? 'text-amber-700' : 'text-slate-900',
      subCls:  (stats?.unpaidExpenses ?? 0) > 0 ? 'text-amber-500 font-semibold' : 'text-slate-400',
    },
    {
      label:   'إجمالي المصروفات',
      value:   SAR(stats?.totalExpenses ?? 0) + ' ر.س',
      sub:     `${stats?.count ?? 0} مصروف مرحّل`,
      icon:    TrendingDown,
      accent:  'border-r-4 border-r-red-500',
      iconBg:  'bg-red-100', iconCls: 'text-red-500', valCls: 'text-red-700', subCls: 'text-slate-400',
    },
    {
      label:   'الفئة الأعلى',
      value:   stats?.topCategory ?? '—',
      sub:     'حسب إجمالي المصروف',
      icon:    Tag,
      accent:  'border-r-4 border-r-emerald-500',
      iconBg:  'bg-emerald-100', iconCls: 'text-emerald-600', valCls: 'text-slate-900', subCls: 'text-slate-400',
    },
    {
      label:   'متوسط شهري',
      value:   SAR(stats?.monthlyAverage ?? 0) + ' ر.س',
      sub:     'آخر 12 شهراً',
      icon:    BarChart2,
      accent:  'border-r-4 border-r-slate-400',
      iconBg:  'bg-slate-100', iconCls: 'text-slate-500', valCls: 'text-slate-900', subCls: 'text-slate-400',
    },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" dir="rtl">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">مركز المصروفات التشغيلية</h1>
          <p className="text-xs text-slate-400 mt-0.5">مصروفات غير مخزنية — تؤثر مباشرة على الأرباح والخسائر</p>
        </div>
        {cats.length === 0 && (
          <button onClick={handleSeedCats} disabled={seeding}
            className="text-xs text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
            {seeding ? 'جاري...' : 'إنشاء الفئات الافتراضية'}
          </button>
        )}
      </div>

      {/* ── KPI Dashboard ─────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpiCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className={`bg-white rounded-xl border border-slate-200 ${card.accent} px-4 py-3.5 shadow-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-slate-500 leading-tight">{card.label}</span>
                  <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon size={14} className={card.iconCls} />
                  </div>
                </div>
                <p className={`text-lg font-bold tabular-nums truncate ${card.valCls}`}>{card.value}</p>
                <p className={`text-[10px] mt-0.5 truncate ${card.subCls}`}>{card.sub}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Quick Action Bar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={openCreate}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">
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

      {/* ── Filters ───────────────────────────────────────────────────── */}
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

      {/* ── Form + Sidebar (2-column on XL) ───────────────────────────── */}
      {showForm && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">

          {/* FORM — takes 2/3 */}
          <form onSubmit={handleSubmit}
            className="xl:col-span-2 bg-white border border-blue-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="font-semibold text-slate-800 text-sm">
                  {editId ? 'تعديل المصروف' : 'مصروف تشغيلي جديد'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">يُقيَّد مباشرة في الأرباح والخسائر</p>
              </div>
              <button type="button" onClick={closeForm}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  {formError}
                </div>
              )}
              {overThreshold && form.status !== 'posted' && form.status !== 'paid' && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                  المبلغ يتجاوز حد الاعتماد ({SAR(APPROVAL_THRESHOLD)} ر.س) — الحالة: "بانتظار الاعتماد"
                </div>
              )}

              {/* Card 1 — بيانات المصروف */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">بيانات المصروف</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">التاريخ <span className="text-red-400">*</span></label>
                    <input type="date" value={form.expenseDate} onChange={e => setF('expenseDate', e.target.value)}
                      className="input w-full" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">الجهة / المورد</label>
                    <input type="text" value={form.vendor} onChange={e => setF('vendor', e.target.value)}
                      placeholder="اسم المورد" className="input w-full" />
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
                      placeholder="رقم الفاتورة" className="input w-full font-mono" />
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <label className="block text-xs font-medium text-slate-600 mb-1">الوصف</label>
                    <input type="text" value={form.description} onChange={e => setF('description', e.target.value)}
                      placeholder="وصف المصروف" className="input w-full" />
                  </div>
                </div>
              </div>

              {/* Card 2 — التصنيف المالي */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">التصنيف المالي</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">الحساب المحاسبي</label>
                    <input type="text" value={form.accountCode} onChange={e => setF('accountCode', e.target.value)}
                      placeholder="5100 — مصاريف إعلانات"
                      list="account-codes-list"
                      className="input w-full font-mono" />
                    <datalist id="account-codes-list">
                      {ACCOUNT_OPTIONS.map(a => (
                        <option key={a.code} value={a.code}>{a.name}</option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">مركز التكلفة</label>
                    <select value={form.costCenter} onChange={e => setF('costCenter', e.target.value)}
                      className="input w-full">
                      <option value="">— اختر —</option>
                      <option value="إدارة">إدارة</option>
                      <option value="مبيعات">مبيعات</option>
                      <option value="تشغيل">تشغيل</option>
                      <option value="تسويق">تسويق</option>
                      <option value="تقنية">تقنية</option>
                      <option value="مستودع">مستودع</option>
                      <option value="مخزون">مخزون</option>
                      <option value="شحن">شحن</option>
                      <option value="نون">نون</option>
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

              {/* Card 3 — بيانات الدفع */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">بيانات الدفع والمبالغ</p>
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
                      className="input w-full text-left tabular-nums font-semibold bg-blue-50 border-blue-200" />
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
                      placeholder="اختيارية" className="input w-full" />
                  </div>
                </div>
              </div>

              {/* Card 4 — المرفقات */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">المرفق — وصل / فاتورة</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp"
                    onChange={e => setAttachFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <button type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex items-center gap-2 border rounded-lg px-4 py-2 text-sm transition-colors ${attachFile ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-white hover:border-blue-300'}`}>
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
                  <span className="text-[10px] text-slate-400">PDF · JPG · PNG — حتى 10 MB</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
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

          {/* SIDEBAR — takes 1/3, sticky */}
          <div className="xl:col-span-1 space-y-3 xl:sticky xl:top-20">

            {/* Quick presets */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">إدخال سريع</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PRESETS.map(preset => (
                  <button key={preset.label} type="button"
                    onClick={() => applyPreset(preset)}
                    className={`border rounded-lg px-3 py-2 text-xs font-semibold text-right transition-colors ${preset.bgCls}`}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">اضغط لملء الحقول تلقائياً</p>
            </div>

            {/* Live financial summary */}
            <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl p-4 shadow-md text-white">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">الملخص المالي</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">المبلغ الأساسي</span>
                  <span className="tabular-nums font-medium text-sm">{SAR(formBase)} ر.س</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">ض.ق.م</span>
                  <span className="tabular-nums font-medium text-sm text-amber-400">{SAR(formVat)} ر.س</span>
                </div>
                <div className="h-px bg-slate-700" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white font-semibold">الإجمالي</span>
                  <span className={`tabular-nums font-bold text-lg ${overThreshold ? 'text-amber-400' : 'text-white'}`}>
                    {SAR(formTotal)} ر.س
                  </span>
                </div>
                {formVat > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">صافي بعد الضريبة</span>
                    <span className="tabular-nums text-sm text-emerald-400">{SAR(formBase)} ر.س</span>
                  </div>
                )}
                <div className="h-px bg-slate-700" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">الحساب</span>
                  <span className="text-xs font-mono text-slate-300">{form.accountCode || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">طريقة الدفع</span>
                  <span className="text-xs text-slate-300">{PAYMENT_LABELS[form.paymentMethod] || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">مركز التكلفة</span>
                  <span className="text-xs text-slate-300">{form.costCenter || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">الحالة</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[form.status]?.cls ?? 'bg-slate-700 text-slate-300'}`}>
                    {STATUS_CONFIG[form.status]?.label ?? form.status}
                  </span>
                </div>
              </div>
              {overThreshold && (
                <div className="mt-3 bg-amber-500/20 border border-amber-500/30 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-amber-300">يتجاوز حد الاعتماد ({SAR(APPROVAL_THRESHOLD)} ر.س)</p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Expense Table ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl py-12 text-center text-slate-400 text-sm">
          <RefreshCw size={20} className="mx-auto mb-2 animate-spin text-slate-300" />
          جاري التحميل...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 mb-4">
            <Receipt size={28} className="text-slate-300" />
          </div>
          <p className="text-slate-700 font-semibold text-base mb-1">
            {hasActiveFilters ? 'لا توجد نتائج مطابقة' : 'ابدأ بإضافة أول مصروف تشغيلي'}
          </p>
          <p className="text-slate-400 text-sm mb-5">
            {hasActiveFilters
              ? 'جرّب تعديل الفلاتر أو مسحها للعرض الكامل'
              : 'سجّل مصاريف التشغيل لتتبع تكاليفك وإنتاج قيود محاسبية تلقائية'}
          </p>
          {!hasActiveFilters ? (
            <div className="flex flex-col items-center gap-2">
              <button onClick={openCreate}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                <Plus size={15} />
                إضافة مصروف
              </button>
              {cats.length === 0 && (
                <button onClick={handleSeedCats} disabled={seeding}
                  className="text-sm text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 px-4 py-2 rounded-lg disabled:opacity-50">
                  {seeding ? 'جاري...' : 'إنشاء الفئات الافتراضية أولاً'}
                </button>
              )}
            </div>
          ) : (
            <button onClick={clearFilters}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm">
              مسح الفلاتر
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
            <p className="text-xs font-semibold text-slate-600">{total} مصروف</p>
            <p className="text-xs tabular-nums text-slate-500">
              مجموع الصفحة: <span className="font-bold text-slate-800">{SAR(items.reduce((s, e) => s + Number(e.totalAmount), 0))} ر.س</span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1160px]">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {[
                    'التاريخ', 'المورد', 'الفئة', 'الوصف',
                    'الحساب', 'مركز التكلفة', 'الحالة', 'طريقة الدفع',
                    'قبل الضريبة', 'الضريبة', 'الإجمالي', 'مرفق', 'مرجع', '',
                  ].map(h => (
                    <th key={h} className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-500 whitespace-nowrap">
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
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                        onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">{exp.expenseDate}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[120px] truncate text-xs">
                          {exp.vendor ?? <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[100px] truncate">
                          {exp.category?.name ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 max-w-[150px] truncate text-xs">
                          {exp.description ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-400">
                          {exp.accountCode ?? <span className="text-slate-200">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {exp.costCenter
                            ? <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">{exp.costCenter}</span>
                            : <span className="text-slate-200">—</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>
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
                        <td className="px-3 py-2.5 text-left tabular-nums text-xs whitespace-nowrap">
                          {Number(exp.vatAmount) > 0
                            ? <span className="text-amber-600 font-medium">{SAR(exp.vatAmount)}</span>
                            : <span className="text-slate-200">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-left tabular-nums text-sm font-bold whitespace-nowrap text-slate-900">
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
                              <Paperclip size={11} className="inline ml-0.5" />
                              {exp.attachmentName.slice(0, 8)}{exp.attachmentName.length > 8 ? '…' : ''}
                            </a>
                          ) : <span className="text-slate-200 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-slate-400 whitespace-nowrap">
                          {exp.referenceNumber ?? <span className="text-slate-200">—</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {(exp.status === 'draft' || exp.status === 'pending_approval' || exp.status === 'approved') && (
                              <button onClick={() => openEdit(exp)}
                                className="text-xs px-2 py-0.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-100">
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
                      {isExpanded && (
                        <tr key={`${exp.id}-expanded`} className="bg-blue-50/40">
                          <td colSpan={14} className="px-5 py-3 border-b border-blue-100">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide mb-0.5">معالجة الضريبة</p>
                                <p className="text-slate-700">
                                  {VAT_TREATMENTS.find(t => t.value === exp.vatTreatment)?.label ?? exp.vatTreatment ?? '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide mb-0.5">رقم المرجع</p>
                                <p className="font-mono text-slate-700">{exp.referenceNumber ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide mb-0.5">ملاحظات</p>
                                <p className="text-slate-700">{exp.notes ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide mb-0.5">صافي بعد الضريبة</p>
                                <p className="font-bold text-slate-800 tabular-nums text-sm">
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
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={8} className="px-3 py-2.5 text-xs font-semibold text-slate-500">
                    المجاميع — {items.length} مصروف في هذه الصفحة
                  </td>
                  <td className="px-3 py-2.5 text-left tabular-nums text-xs font-bold text-slate-700 whitespace-nowrap">
                    {SAR(items.reduce((s, e) => s + Number(e.amountBeforeVat), 0))}
                  </td>
                  <td className="px-3 py-2.5 text-left tabular-nums text-xs font-bold text-amber-600 whitespace-nowrap">
                    {SAR(items.reduce((s, e) => s + Number(e.vatAmount), 0))}
                  </td>
                  <td className="px-3 py-2.5 text-left tabular-nums text-sm font-bold text-slate-900 whitespace-nowrap">
                    {SAR(items.reduce((s, e) => s + Number(e.totalAmount), 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────── */}
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
