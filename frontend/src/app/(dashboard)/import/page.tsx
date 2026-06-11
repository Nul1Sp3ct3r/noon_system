'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Upload, AlertCircle, CheckCircle2, Trash2, RefreshCw,
  AlertTriangle, ShoppingCart, Calendar, Package,
  ChevronDown, ChevronUp, Clock, BarChart2, X, FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { imports as api } from '@/lib/api';
import { translateError } from '@/lib/errors';
import type { ImportBatch, ImportResult, NoonStatementSummary, ReconciliationReport } from '@/lib/types';

// ─── Config ───────────────────────────────────────────────────────────────────

type ImportTypeId   = 'weekly' | 'monthly' | 'inventory' | 'transaction_view';
type HistoryFilter  = 'all' | '7days' | '30days' | 'success' | 'failed';

interface ImportTypeDef {
  id:           ImportTypeId;
  importType:   string | undefined;
  label:        string;
  desc:         string;
  filename:     string;
  icon:         LucideIcon;
  iconBg:       string;
  iconColor:    string;
  activeBorder: string;
  activeBg:     string;
  primaryCols:  string[];
  allCols:      string[];
  signature:    string[];           // columns that uniquely identify this CSV
  historyTypes: string[];           // importBatch.importType values that belong here
}

const IMPORT_TYPES: ImportTypeDef[] = [
  {
    id:           'weekly',
    importType:   'weekly_noon',
    label:        'الاستيراد الأسبوعي',
    desc:         'استيراد مبيعات ورسوم نون الأسبوعية لتحديث الطلبات والربحية والتسويات.',
    filename:     'ملف_المبيعات_الاسبوعي.csv',
    icon:         ShoppingCart,
    iconBg:       'bg-blue-100',
    iconColor:    'text-blue-600',
    activeBorder: 'border-blue-500',
    activeBg:     'bg-blue-50',
    primaryCols:  ['order_nr', 'item_nr', 'sku', 'partner_sku', 'net_proceeds', 'referral_fee', 'item_status'],
    allCols: [
      'id_partner', 'statement_date', 'statement_nr', 'order_nr', 'item_nr',
      'brand_en', 'product_title_en', 'brand_ar', 'product_title_ar',
      'sku', 'partner_sku', 'fee_name', 'item_status',
      'ordered_date', 'shipped_date', 'delivered_date', 'returned_date',
      'net_proceeds', 'referral_fee', 'fbn_outbound_fee',
      'noon_markup', 'noon_promo', 'shipping_fee', 'other_amounts', 'total_payment',
    ],
    signature:    ['id_partner', 'fee_name', 'shipping_fee'],
    historyTypes: ['weekly_noon', 'orders'],
  },
  {
    id:           'monthly',
    importType:   undefined,          // backend auto-detects monthly
    label:        'الاستيراد الشهري',
    desc:         'استيراد كشف نون الشهري لتحديث الرسوم وضريبة القيمة المضافة والتقارير.',
    filename:     'كشف_نون_الشهري.csv',
    icon:         Calendar,
    iconBg:       'bg-violet-100',
    iconColor:    'text-violet-600',
    activeBorder: 'border-violet-500',
    activeBg:     'bg-violet-50',
    primaryCols:  ['transaction_type', 'document_type', 'sku', 'source_doc_nr', 'price_including_vat_document_currency'],
    allCols: [
      'transaction_type', 'document_type', 'document_subtype',
      'source_doc_nr', 'source_doc_line_nr', 'sku', 'partner_sku',
      'price_including_vat_document_currency', 'vat_amount_document_currency',
      'document_date', 'description',
    ],
    signature:    ['transaction_type', 'document_type', 'document_subtype'],
    historyTypes: ['monthly_statement'],
  },
  {
    id:           'inventory',
    importType:   'full_inventory',
    label:        'لقطة المخزون من نون',
    desc:         'استيراد ملف Inventory من نون لتحديث الكميات والمنتجات والمستودعات.',
    filename:     'Inventory.csv',
    icon:         Package,
    iconBg:       'bg-emerald-100',
    iconColor:    'text-emerald-600',
    activeBorder: 'border-emerald-500',
    activeBg:     'bg-emerald-50',
    primaryCols:  ['sku', 'partner_sku', 'qty', 'warehouse_code', 'title', 'brand'],
    allCols: [
      'box_barcode', 'warehouse_code', 'barcode', 'qty', 'id_partner',
      'inventory_type', 'pbarcode', 'sku', 'partner_sku',
      'title', 'brand', 'family', 'reason_code',
      'inventory_snapshot_at', 'country_code', 'classification_code',
    ],
    signature:    ['warehouse_code', 'inventory_type', 'inventory_snapshot_at'],
    historyTypes: ['full_inventory', 'inventory_sync'],
  },
  {
    id:           'transaction_view',
    importType:   'transaction_view',
    label:        'Transaction View',
    desc:         'استيراد ملف Transaction View من نون لمطابقة الكشوفات (PS-*) وحساب صافي كل دورة.',
    filename:     'noon_financeweb_transactionviewreport*.csv',
    icon:         FileText,
    iconBg:       'bg-orange-100',
    iconColor:    'text-orange-600',
    activeBorder: 'border-orange-500',
    activeBg:     'bg-orange-50',
    primaryCols:  ['reference_nr', 'transaction_type', 'net_proceeds', 'total'],
    allCols: [
      'contract', 'contract_title', 'reference_nr', 'order_nr', 'item_nr',
      'order_date', 'transaction_date', 'title', 'skus', 'partner_skus',
      'transaction_type', 'currency', 'net_proceeds', 'total',
      'referral_fee_including_vat', 'fullfilment_logistics_fees_including_vat',
    ],
    signature:    ['reference_nr', 'total'],
    historyTypes: ['transaction_view'],
  },
];

const UPLOAD_STAGES = [
  'جارٍ رفع الملف...',
  'جارٍ تحليل الأعمدة...',
  'جارٍ التحقق من الملف...',
  'جارٍ تحديث البيانات...',
  'جارٍ حفظ النتائج...',
];

const HISTORY_FILTER_LABELS: Record<HistoryFilter, string> = {
  all:     'الكل',
  '7days': '7 أيام',
  '30days':'30 يوم',
  success: 'ناجحة',
  failed:  'فاشلة',
};

// Sniff the CSV first line in-browser to detect which type it is
function detectCsvType(firstLine: string): ImportTypeId | null {
  const cols = firstLine
    .toLowerCase()
    .split(',')
    .map(c => c.trim().replace(/['"]/g, '').replace(/[\s-]+/g, '_'));
  for (const t of IMPORT_TYPES) {
    if (t.signature.every(s => cols.includes(s))) return t.id;
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [selectedId, setSelectedId] = useState<ImportTypeId>('weekly');

  // History
  const [batches, setBatches]           = useState<ImportBatch[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [loadingList, setLoadingList]   = useState(true);
  const [listError, setListError]       = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  // Upload
  const [dragging, setDragging]         = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [progress, setProgress]         = useState(0);
  const [uploadResult, setUploadResult] = useState<ImportResult | null>(null);
  const [uploadError, setUploadError]   = useState('');
  const [deletingId, setDeletingId]         = useState<string | null>(null);
  const [showAllCols, setShowAllCols]       = useState(false);
  const [uploadDuration, setUploadDuration] = useState<number | null>(null);

  // Reconciliation modal
  const [recon, setRecon]               = useState<ReconciliationReport | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError]     = useState('');

  // Statement summary expanded rows
  const [expandedStmt, setExpandedStmt] = useState<Set<string>>(new Set());

  // File mismatch detection
  const [pendingFile, setPendingFile]   = useState<File | null>(null);
  const [mismatchId, setMismatchId]     = useState<ImportTypeId | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number | null>(null);

  const selectedType = IMPORT_TYPES.find(t => t.id === selectedId)!;

  // ── History ───────────────────────────────────────────────────────────────

  const loadBatches = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const res = await api.listBatches({ page, limit: 50 });
      setBatches(res.items);
      setTotal(res.total);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'فشل تحميل سجل الاستيراد');
    } finally {
      setLoadingList(false);
    }
  }, [page]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  // Filter client-side (loaded batches) by type + time/status
  const now = Date.now();
  const filteredBatches = batches.filter(b => {
    if (!selectedType.historyTypes.includes(b.importType)) return false;
    const ms = new Date(b.createdAt).getTime();
    if (historyFilter === '7days')   return now - ms <= 7  * 86_400_000;
    if (historyFilter === '30days')  return now - ms <= 30 * 86_400_000;
    if (historyFilter === 'success') return b.status === 'completed';
    if (historyFilter === 'failed')  return b.status !== 'completed';
    return true;
  });

  // ── Type selection ────────────────────────────────────────────────────────

  function selectType(id: ImportTypeId) {
    if (id === selectedId) return;
    setSelectedId(id);
    setUploadResult(null);
    setUploadError('');
    setShowAllCols(false);
    setPendingFile(null);
    setMismatchId(null);
    setHistoryFilter('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function processFile(file: File, typeId: ImportTypeId) {
    const type = IMPORT_TYPES.find(t => t.id === typeId)!;
    setUploading(true);
    setProgress(0);
    setUploadResult(null);
    setUploadError('');
    startTimeRef.current = Date.now();
    setUploadDuration(null);

    try {
      const result = await api.upload(file, type.importType, pct => setProgress(pct));
      setUploadDuration(parseFloat(((Date.now() - (startTimeRef.current ?? Date.now())) / 1000).toFixed(1)));
      setUploadResult(result);
      loadBatches();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'فشل رفع الملف — أعد المحاولة';
      // Map backend permission errors to a user-friendly Arabic message
      const isPermission = raw === 'Insufficient role' || raw.startsWith('HTTP 403') || raw.includes('403');
      setUploadError(
        isPermission
          ? 'لا تملك صلاحية تنفيذ هذا الاستيراد. تواصل مع مدير النظام.'
          : raw,
      );
    } finally {
      setUploading(false);
      setProgress(0);
      setPendingFile(null);
      setMismatchId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleFile(file: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('يُقبل فقط ملفات CSV (.csv) — يرجى تصدير الملف بصيغة CSV من نون');
      return;
    }
    setUploadError('');
    setUploadResult(null);

    // Client-side type detection from CSV headers
    try {
      const text    = await file.text();
      const firstLn = text.split('\n')[0] ?? '';
      const detected = detectCsvType(firstLn);
      if (detected && detected !== selectedId) {
        setPendingFile(file);
        setMismatchId(detected);
        return; // wait for user decision
      }
    } catch { /* proceed without detection if text read fails */ }

    processFile(file, selectedId);
  }

  function handleMismatchConvert() {
    if (!pendingFile || !mismatchId) return;
    const id = mismatchId;
    setSelectedId(id);       // switch selected type
    setMismatchId(null);
    processFile(pendingFile, id);
  }

  function handleMismatchCancel() {
    setPendingFile(null);
    setMismatchId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function deleteBatch(batchId: string) {
    if (!confirm('هل أنت متأكد من حذف دفعة الاستيراد هذه؟ سيتم حذف جميع البيانات المرتبطة بها.')) return;
    setDeletingId(batchId);
    try {
      await api.deleteBatch(batchId);
      loadBatches();
    } catch (err) {
      setListError(translateError(err, 'فشل حذف دفعة الاستيراد'));
    } finally {
      setDeletingId(null);
    }
  }

  async function openReconciliation(batchId: string) {
    setRecon(null);
    setReconError('');
    setReconLoading(true);
    try {
      const r = await api.reconciliation(batchId);
      setRecon(r);
    } catch (err) {
      setReconError(err instanceof Error ? err.message : 'فشل تحميل تقرير المطابقة');
    } finally {
      setReconLoading(false);
    }
  }

  // Stage label from upload progress
  const stageIdx  = Math.min(Math.floor(progress / 20), UPLOAD_STAGES.length - 1);
  const stageLabel = progress >= 100 ? 'جارٍ المعالجة النهائية...' : UPLOAD_STAGES[stageIdx];

  const totalPages = Math.ceil(total / 20);
  const TypeIcon   = selectedType.icon;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="space-y-4" dir="rtl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">مركز الاستيراد</h1>
        <p className="text-slate-500 text-sm mt-0.5">رفع ملفات CSV من بوابة نون لتحديث الطلبات والمخزون والتقارير تلقائياً</p>
      </div>

      {/* ── Type selector — 3 cards ──────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">نوع الاستيراد</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {IMPORT_TYPES.map(type => {
            const Icon       = type.icon;
            const isSelected = type.id === selectedId;
            return (
              <button
                key={type.id}
                onClick={() => selectType(type.id)}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-right transition-all duration-150 w-full group
                  ${isSelected
                    ? `${type.activeBorder} ${type.activeBg} shadow-sm`
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
              >
                <div className={`w-9 h-9 rounded-xl ${type.iconBg} flex items-center justify-center shrink-0 mt-0.5 transition-transform group-hover:scale-105`}>
                  <Icon size={16} className={type.iconColor} />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className={`text-sm font-bold ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                    {type.label}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{type.desc}</p>
                </div>
                {isSelected && (
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-2 ${
                    type.id === 'weekly' ? 'bg-blue-500'
                    : type.id === 'monthly' ? 'bg-violet-500'
                    : 'bg-emerald-500'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Upload panel ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

        {/* Panel header — context changes with selected type */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
          <div className={`w-7 h-7 rounded-lg ${selectedType.iconBg} flex items-center justify-center shrink-0`}>
            <TypeIcon size={13} className={selectedType.iconColor} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">{selectedType.label}</p>
            <p className="text-xs text-slate-400">{selectedType.filename}</p>
          </div>
        </div>

        {/* Required columns — always shown, expandable */}
        <div className="px-5 py-3 bg-slate-50/60 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">الأعمدة المطلوبة</p>
            {selectedType.allCols.length > selectedType.primaryCols.length && (
              <button
                onClick={() => setShowAllCols(v => !v)}
                className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showAllCols
                  ? <><ChevronUp size={10} /> اختصار</>
                  : <><ChevronDown size={10} /> الكل ({selectedType.allCols.length})</>}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(showAllCols ? selectedType.allCols : selectedType.primaryCols).map(col => {
              const isPrimary = selectedType.primaryCols.includes(col);
              return (
                <code
                  key={col}
                  className={`text-[10px] px-2 py-0.5 rounded font-mono border transition-colors
                    ${isPrimary
                      ? 'bg-white border-slate-300 text-slate-800 font-semibold'
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                    }`}
                >
                  {col}
                </code>
              );
            })}
            {!showAllCols && selectedType.allCols.length > selectedType.primaryCols.length && (
              <button
                onClick={() => setShowAllCols(true)}
                className="text-[10px] text-slate-400 hover:text-blue-500 font-mono px-1 transition-colors"
              >
                +{selectedType.allCols.length - selectedType.primaryCols.length} أخرى…
              </button>
            )}
          </div>
        </div>

        <div className="p-5 space-y-3">

          {/* ── Mismatch detection banner ── */}
          {mismatchId && pendingFile && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">
                    يبدو أن هذا ملف {IMPORT_TYPES.find(t => t.id === mismatchId)?.label}
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    الملف يطابق نوع «{IMPORT_TYPES.find(t => t.id === mismatchId)?.label}»
                    بدلاً من «{selectedType.label}». هل تريد التحويل تلقائياً؟
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleMismatchConvert}
                  className="flex-1 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold transition-colors"
                >
                  التحويل تلقائياً
                </button>
                <button
                  onClick={handleMismatchCancel}
                  className="flex-1 py-2 text-sm border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {/* ── Error banner ── */}
          {uploadError && !mismatchId && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="break-words leading-relaxed">{uploadError}</span>
            </div>
          )}

          {/* ── Success result card ── */}
          {uploadResult && !mismatchId && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span className="font-bold text-emerald-800 text-sm">تم الاستيراد بنجاح</span>
                {uploadDuration != null && (
                  <span className="mr-auto flex items-center gap-1 text-[11px] text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <Clock size={10} />
                    {uploadDuration} ثانية
                  </span>
                )}
              </div>

              {/* Monthly */}
              {uploadResult.format === 'monthly' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <StatCard label="طلبات مستوردة" value={uploadResult.salesCount}   color="emerald" />
                  <StatCard label="مرتجعات"        value={uploadResult.returnsCount} color="amber"   />
                  <StatCard label="رسوم"            value={uploadResult.feesCount}   color="blue"    />
                  <StatCard label="متخطاة"          value={uploadResult.rowsSkipped} color="slate"   />
                  {uploadResult.totalSales > 0 && (
                    <div className="col-span-2 sm:col-span-4 grid grid-cols-3 gap-2 mt-1">
                      <MoneyCard label="إجمالي المبيعات" value={uploadResult.totalSales} />
                      <MoneyCard label="إجمالي الرسوم"   value={uploadResult.totalFees}  />
                      <MoneyCard label="ضريبة الرسوم"    value={uploadResult.feesVat}    />
                    </div>
                  )}
                </div>
              )}

              {/* Weekly / old */}
              {(uploadResult.format === 'weekly_noon' || uploadResult.format === 'old') && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <StatCard label="صفوف مضافة"  value={uploadResult.rowsImported}  color="emerald" />
                  <StatCard label="صفوف محدّثة" value={uploadResult.rowsUpdated}   color="blue"    />
                  <StatCard label="مبيعات"       value={uploadResult.salesCount}    color="violet"  />
                  <StatCard label="متخطاة"       value={uploadResult.rowsSkipped}   color="slate"   />
                  {uploadResult.totalSales > 0 && (
                    <div className="col-span-2 sm:col-span-4">
                      <MoneyCard label="إجمالي المبيعات" value={uploadResult.totalSales} />
                    </div>
                  )}
                </div>
              )}

              {/* Inventory */}
              {uploadResult.format === 'full_inventory' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <StatCard label="منتجات جديدة"  value={uploadResult.rowsImported}          color="emerald" />
                  <StatCard label="منتجات محدّثة"  value={uploadResult.productsUpdated ?? 0} color="blue"    />
                  <StatCard label="تسويات مخزون"   value={uploadResult.stockUpdated ?? 0}    color="violet"  />
                  <StatCard label="متخطاة"          value={uploadResult.rowsSkipped}          color="slate"   />
                </div>
              )}

              {/* Transaction View — per-statement summary table */}
              {uploadResult.format === 'transaction_view' && uploadResult.statementSummaries && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <StatCard label="كشوفات PS"     value={uploadResult.feesCount}     color="orange"  />
                    <StatCard label="طلبات مستوردة" value={uploadResult.rowsImported}  color="emerald" />
                    <StatCard label="متخطاة"         value={uploadResult.rowsSkipped}   color="slate"   />
                    <StatCard label="مبيعات"          value={uploadResult.salesCount}    color="violet"  />
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 text-xs">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['', 'رقم الكشف (PS)', 'التاريخ', 'صافي المبيعات', 'الرسوم', 'إجمالي الكشف', 'ضريبة الرسوم', 'صافي بعد VAT', 'إجمالي TV', 'الفرق', 'الحالة'].map(h => (
                            <th key={h} className="px-2 py-2 text-right font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {uploadResult.statementSummaries.map(s => {
                          const isExpanded = expandedStmt.has(s.referenceNr);
                          const statusCls = s.status === 'matched'
                            ? 'bg-emerald-50 text-emerald-700'
                            : s.status === 'rounding'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-600';
                          const statusLabel = s.status === 'matched' ? 'مطابق' : s.status === 'rounding' ? 'فرق تقريب' : 'يحتاج مراجعة';
                          return (
                            <>
                              <tr key={s.referenceNr} className="hover:bg-slate-50 transition-colors">
                                <td className="px-2 py-2">
                                  <button
                                    onClick={() => setExpandedStmt(prev => {
                                      const n = new Set(prev);
                                      n.has(s.referenceNr) ? n.delete(s.referenceNr) : n.add(s.referenceNr);
                                      return n;
                                    })}
                                    className="p-1 rounded text-slate-400 hover:text-slate-600"
                                  >
                                    {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                  </button>
                                </td>
                                <td className="px-2 py-2 font-mono text-[11px] text-slate-800 whitespace-nowrap">{s.referenceNr}</td>
                                <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{s.statementDate}</td>
                                <td className="px-2 py-2 tabular-nums text-slate-700">{s.netProceeds.toFixed(2)}</td>
                                <td className="px-2 py-2 tabular-nums text-red-600">{s.feesExclVat.toFixed(2)}</td>
                                <td className="px-2 py-2 tabular-nums font-semibold text-slate-800">{s.statementTotal.toFixed(2)}</td>
                                <td className="px-2 py-2 tabular-nums text-slate-500">{s.statementVat.toFixed(2)}{s.vatEstimated && <span className="text-[9px] text-amber-500 mr-0.5">تقدير</span>}</td>
                                <td className="px-2 py-2 tabular-nums font-bold text-emerald-700">{s.netAfterVat.toFixed(2)}</td>
                                <td className="px-2 py-2 tabular-nums text-slate-400">{s.tvTotal.toFixed(2)}</td>
                                <td className={`px-2 py-2 tabular-nums font-semibold ${Math.abs(s.difference) < 0.01 ? 'text-emerald-500' : 'text-amber-600'}`}>
                                  {s.difference >= 0 ? '+' : ''}{s.difference.toFixed(2)}
                                </td>
                                <td className="px-2 py-2">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusCls}`}>
                                    {statusLabel}
                                  </span>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${s.referenceNr}-detail`} className="bg-slate-50">
                                  <td colSpan={11} className="px-4 py-3">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-[11px]">
                                      <span className="text-slate-500">طلبات order: <span className="font-semibold text-slate-800">{s.orderRowsCount}</span></span>
                                      <span className="text-slate-500">تحديثات order_update: <span className="font-semibold text-slate-800">{s.orderUpdateRowsCount}</span></span>
                                      <span className="text-slate-500">دفعات بنكية مُتجاهَلة: <span className="font-semibold text-amber-700">{s.ignoredPaymentRowsCount}</span></span>
                                      <span className="text-slate-500">تحويلات رصيد مُتجاهَلة: <span className="font-semibold text-amber-700">{s.ignoredBalanceTransferRowsCount}</span></span>
                                      <span className="text-slate-500">الرسوم (شامل VAT): <span className="font-semibold text-red-600">{s.feesInclVat.toFixed(2)} ر.س</span></span>
                                      <span className="text-slate-500">الرسوم (بدون VAT): <span className="font-semibold text-slate-800">{s.feesExclVat.toFixed(2)} ر.س</span></span>
                                      <span className="text-slate-500">ضريبة الرسوم: <span className="font-semibold text-slate-800">{s.statementVat.toFixed(2)} ر.س {s.vatEstimated ? '(تقديرية)' : '(فعلية)'}</span></span>
                                      <span className="text-slate-500">صافي TV بعد VAT: <span className="font-semibold text-emerald-700">{s.netAfterVat.toFixed(2)} ر.س</span></span>
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
                </div>
              )}

              {/* Warnings */}
              {uploadResult.warnings.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-amber-700 text-xs font-semibold mb-1">
                    <AlertTriangle size={11} />
                    {uploadResult.warnings.length} تحذير
                  </div>
                  <ul className="space-y-0.5 max-h-20 overflow-y-auto">
                    {uploadResult.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-700 font-mono">{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Upload zone ── */}
          {!mismatchId && (
            uploading ? (
              <div className="border-2 border-dashed border-blue-200 rounded-xl p-8 text-center bg-blue-50">
                <div className="max-w-xs mx-auto mb-4">
                  <div className="flex justify-between text-[10px] text-blue-500 mb-1.5 font-medium">
                    <span>{stageLabel}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(4, progress)}%` }}
                    />
                  </div>
                </div>
                <p className="text-blue-600 text-xs font-medium">{stageLabel}</p>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150
                  ${dragging
                    ? 'border-blue-400 bg-blue-50 scale-[1.005]'
                    : 'border-slate-300 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className={`w-12 h-12 rounded-xl ${selectedType.iconBg} flex items-center justify-center mx-auto mb-3`}>
                  <Upload size={20} className={selectedType.iconColor} />
                </div>
                <p className="text-slate-700 font-semibold text-sm">اسحب ملف CSV هنا أو انقر للاختيار</p>
                <p className="text-slate-400 text-xs mt-1 font-mono">{selectedType.filename} · CSV · 10MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv"
                  onChange={onFileChange}
                />
              </div>
            )
          )}

        </div>
      </div>

      {/* ── Import history ────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-800 text-sm">سجل {selectedType.label}</h2>
            <p className="text-xs text-slate-400 mt-0.5">آخر 50 عملية استيراد مكتملة</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(HISTORY_FILTER_LABELS) as HistoryFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setHistoryFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  historyFilter === f
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {HISTORY_FILTER_LABELS[f]}
              </button>
            ))}
            <button
              onClick={loadBatches}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={10} />
              تحديث
            </button>
          </div>
        </div>

        {listError && (
          <div className="mx-5 my-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            {listError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['اسم الملف', 'رقم الكشف', 'تاريخ الاستيراد', 'مضافة', 'متخطاة', 'مبيعات', 'رسوم', 'الحالة', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingList ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <RefreshCw size={18} className="mx-auto text-slate-300 animate-spin mb-2" />
                    <p className="text-slate-400 text-xs">جارٍ التحميل…</p>
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center">
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${selectedType.iconBg} border border-white mb-3`}>
                      <TypeIcon size={20} className={`${selectedType.iconColor} opacity-50`} />
                    </div>
                    <p className="text-slate-600 font-semibold text-sm">لا توجد عمليات استيراد بعد</p>
                    <p className="text-slate-400 text-xs mt-1 mb-4">ابدأ أول استيراد برفع ملف CSV من نون</p>
                    <button
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      ابدأ الاستيراد
                    </button>
                  </td>
                </tr>
              ) : filteredBatches.map(b => (
                <tr key={b.batchId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs max-w-[160px] truncate text-slate-600" title={b.fileName ?? undefined}>
                    {b.fileName ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{b.statementNr ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(b.createdAt).toLocaleString('ar-SA')}
                  </td>
                  <td className="px-3 py-2.5 text-emerald-700 font-bold text-xs">{b.rowsImported.toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 text-slate-400 text-xs">{b.rowsSkipped.toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{b.salesCount.toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{b.feesCount.toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                      ${b.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {b.status === 'completed' ? 'مكتمل' : 'فشل'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openReconciliation(b.batchId)}
                        className="p-1.5 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        title="تقرير المطابقة"
                      >
                        <BarChart2 size={12} />
                      </button>
                      <button
                        onClick={() => deleteBatch(b.batchId)}
                        disabled={deletingId === b.batchId}
                        className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="حذف الدفعة"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 20 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <button
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 text-xs text-slate-600"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >السابق</button>
            <span className="text-xs text-slate-400">صفحة {page}</span>
            <button
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 text-xs text-slate-600"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
            >التالي</button>
          </div>
        )}
      </div>

    </div>
    {/* ── Reconciliation modal ──────────────────────────────────────────────── */}
    {(recon || reconLoading || reconError) && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 pb-6 px-4 overflow-y-auto" dir="rtl">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">

          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-base">تقرير المطابقة مع نون</h2>
              {recon && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {recon.fileName ?? recon.batchId}
                  {recon.statementNr ? ` · ${recon.statementNr}` : ''}
                  {recon.statementDate ? ` · ${recon.statementDate}` : ''}
                </p>
              )}
            </div>
            <button
              onClick={() => { setRecon(null); setReconError(''); }}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-6">
            {reconLoading && (
              <div className="flex items-center justify-center py-16">
                <RefreshCw size={20} className="animate-spin text-slate-300 mr-2" />
                <span className="text-slate-400 text-sm">جارٍ تحميل التقرير…</span>
              </div>
            )}

            {reconError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                {reconError}
              </div>
            )}

            {recon && (
              <>
                {/* Fee total integrity check */}
                {recon.hasFeeCheckWarning && (
                  <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
                    <div className="flex items-center gap-2 font-semibold mb-1">
                      <AlertCircle size={13} />
                      تحذير: مجموع الرسوم المعروضة لا يساوي إجمالي الرسوم
                    </div>
                    <div>
                      مجموع الفئات: {recon.displayedFeeSum.toFixed(2)} ·
                      إجمالي الرسوم: {recon.totalFees.toFixed(2)} ·
                      الفرق: {recon.feeCheckDelta.toFixed(4)}
                    </div>
                  </div>
                )}

                {/* Discrepancy alert */}
                {recon.hasDiscrepancy && (
                  <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                    <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm mb-2">
                      <AlertTriangle size={14} />
                      تم اكتشاف {recon.discrepancies.length} تباين
                    </div>
                    {recon.discrepancies.map((d, i) => (
                      <div key={i} className="text-xs text-amber-700 mt-1">
                        <span className="font-mono bg-amber-100 px-1 rounded">{d.field}</span>
                        {' '}نون: {d.noonValue.toFixed(2)} · PreciseFlow: {d.preciseflowValue.toFixed(2)} · فارق: {d.diff.toFixed(2)}
                        {d.note && <span className="block text-amber-600 mt-0.5">{d.note}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'طلبات تسليم',    value: recon.deliveredCount.toLocaleString('ar-SA') },
                    { label: 'مرتجعات',         value: recon.returnedCount.toLocaleString('ar-SA') },
                    { label: 'سطور رسوم نون',   value: recon.feeRowCount.toLocaleString('ar-SA') },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="font-bold text-slate-800 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Reconciliation table */}
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">البند</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">قيمة نون</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">قيمة PreciseFlow</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">الفارق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recon.reconciliationRows.map((row, i) => {
                        if (row.isSeparator) return <tr key={i}><td colSpan={4} className="py-1 bg-slate-50" /></tr>;
                        const diff = row.diff ?? null;
                        const hasDiff = diff !== null && Math.abs(diff) >= 0.01;
                        return (
                          <tr key={i} className={`${row.isProfit ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                            <td className="px-4 py-2.5">
                              <p className={`text-xs font-medium ${row.isProfit ? 'text-emerald-800 font-bold' : 'text-slate-700'}`}>
                                {row.labelAr}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">{row.label}</p>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-xs text-slate-600">
                              {row.noonValue !== null ? `${row.noonValue.toFixed(2)} ر.س` : '—'}
                            </td>
                            <td className={`px-4 py-2.5 text-right tabular-nums text-xs font-medium ${
                              row.isProfit
                                ? row.pfValue >= 0 ? 'text-emerald-700' : 'text-red-600'
                                : 'text-slate-800'
                            }`}>
                              {row.pfValue.toFixed(2)} ر.س
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                              {diff === null ? '—' : hasDiff
                                ? <span className="text-red-600 font-semibold">{diff > 0 ? '+' : ''}{diff.toFixed(2)}</span>
                                : <span className="text-emerald-500">✓</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Fee detail lines */}
                {recon.feeLines.length > 0 && (
                  <div className="mt-5">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">تفاصيل رسوم الكشف</h3>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            {['نوع الرسوم', 'الوصف', 'بدون VAT', 'VAT', 'شامل VAT'].map(h => (
                              <th key={h} className="px-3 py-2 text-right font-semibold text-slate-500">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {recon.feeLines.map((f, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-500">{f.feeType}</td>
                              <td className="px-3 py-2">{f.description || '—'}</td>
                              <td className="px-3 py-2 tabular-nums">{f.exclVat.toFixed(4)}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-400">{f.vatAmount.toFixed(4)}</td>
                              <td className="px-3 py-2 tabular-nums font-medium text-amber-700">{f.inclVat.toFixed(2)}</td>
                            </tr>
                          ))}
                          <tr className="bg-slate-50 font-semibold">
                            <td colSpan={2} className="px-3 py-2 text-slate-700">الإجمالي</td>
                            <td className="px-3 py-2 tabular-nums">{recon.totalFeesExclVat.toFixed(4)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-400">{recon.totalFeesVat.toFixed(4)}</td>
                            <td className="px-3 py-2 tabular-nums text-red-600">{recon.totalFees.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── Stat cards ───────────────────────────────────────────────────────────────

type StatColor = 'emerald' | 'blue' | 'violet' | 'amber' | 'slate' | 'orange';

const STAT_CLS: Record<StatColor, string> = {
  emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  blue:    'bg-blue-50   border-blue-100   text-blue-700',
  violet:  'bg-violet-50 border-violet-100 text-violet-700',
  amber:   'bg-amber-50  border-amber-100  text-amber-700',
  slate:   'bg-slate-50  border-slate-100  text-slate-600',
  orange:  'bg-orange-50 border-orange-100 text-orange-700',
};

function StatCard({ label, value, color }: { label: string; value: number; color: StatColor }) {
  return (
    <div className={`rounded-lg p-3 text-center border ${STAT_CLS[color]}`}>
      <p className="text-xl font-bold tabular-nums">{value.toLocaleString('ar-SA')}</p>
      <p className="text-xs mt-0.5 opacity-75">{label}</p>
    </div>
  );
}

function MoneyCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg p-3 text-center border border-emerald-100 bg-emerald-50">
      <p className="text-base font-bold text-emerald-700 tabular-nums">
        {value.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
      </p>
      <p className="text-xs text-emerald-600 mt-0.5">{label}</p>
    </div>
  );
}
