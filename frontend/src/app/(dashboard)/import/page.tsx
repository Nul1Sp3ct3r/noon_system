'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Upload, AlertCircle, CheckCircle2, Trash2, RefreshCw,
  AlertTriangle, ShoppingCart, Calendar, Package,
} from 'lucide-react';
import { imports as api } from '@/lib/api';
import type { ImportBatch, ImportResult } from '@/lib/types';

const fmt = (n: number) =>
  n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId = 'weekly' | 'monthly' | 'inventory';

const TABS: { id: TabId; label: string; importType: string | undefined; icon: typeof ShoppingCart; color: string }[] = [
  {
    id: 'weekly',
    label: 'الاستيراد الأسبوعي',
    importType: 'weekly_noon',
    icon: ShoppingCart,
    color: 'blue',
  },
  {
    id: 'monthly',
    label: 'الاستيراد الشهري',
    importType: undefined,   // auto-detect (existing behavior)
    icon: Calendar,
    color: 'violet',
  },
  {
    id: 'inventory',
    label: 'استيراد المخزون الكامل',
    importType: 'full_inventory',
    icon: Package,
    color: 'emerald',
  },
];

const TAB_HELP: Record<TabId, { title: string; desc: string; cols: string[] }> = {
  weekly: {
    title: 'ملف المبيعات الأسبوعي',
    desc: 'ملف_المبيعات_الاسبوعي.csv — تقرير الطلبات الأسبوعي من بوابة نون',
    cols: [
      'id_partner', 'statement_date', 'statement_nr', 'order_nr', 'item_nr',
      'brand_en', 'product_title_en', 'brand_ar', 'product_title_ar',
      'sku', 'partner_sku', 'fee_name', 'item_status',
      'ordered_date', 'shipped_date', 'delivered_date', 'returned_date',
      'net_proceeds', 'referral_fee', 'fbn_outbound_fee',
      'noon_markup', 'noon_promo', 'shipping_fee', 'other_amounts', 'total_payment',
    ],
  },
  monthly: {
    title: 'الكشف الشهري',
    desc: 'ملف CSV الشهري من مزود خدمة نون (transaction_type / document_type)',
    cols: [
      'transaction_type', 'document_type', 'document_subtype',
      'source_doc_nr', 'source_doc_line_nr', 'sku', 'partner_sku',
      'price_including_vat_document_currency', 'vat_amount_document_currency',
      'document_date', 'description',
    ],
  },
  inventory: {
    title: 'لقطة المخزون الكامل',
    desc: 'Inventory (1).csv — لقطة فورية للمخزون من مستودعات نون',
    cols: [
      'box_barcode', 'warehouse_code', 'barcode', 'qty', 'id_partner',
      'inventory_type', 'pbarcode', 'sku', 'partner_sku',
      'title', 'brand', 'family', 'reason_code',
      'inventory_snapshot_at', 'country_code', 'classification_code',
    ],
  },
};

// Import type badge labels
const FORMAT_LABEL: Record<string, string> = {
  monthly:        'كشف شهري',
  old:            'ملف مبيعات',
  weekly_noon:    'أسبوعي',
  full_inventory: 'مخزون كامل',
};

const IMPORT_TYPE_BADGE: Record<string, string> = {
  monthly_statement: 'شهري',
  orders:            'مبيعات',
  weekly_noon:       'أسبوعي',
  full_inventory:    'مخزون',
  inventory_sync:    'مزامنة مخزون',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<TabId>('weekly');

  const [batches, setBatches]         = useState<ImportBatch[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError]     = useState('');

  const [dragging, setDragging]         = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [progress, setProgress]         = useState(0);
  const [uploadResult, setUploadResult] = useState<ImportResult | null>(null);
  const [uploadError, setUploadError]   = useState('');
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [showHelp, setShowHelp]         = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBatches = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const res = await api.listBatches({ page, limit: 20 });
      setBatches(res.items);
      setTotal(res.total);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'فشل تحميل سجل الاستيراد');
    } finally {
      setLoadingList(false);
    }
  }, [page]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  // Clear results when switching tabs
  function switchTab(id: TabId) {
    setActiveTab(id);
    setUploadResult(null);
    setUploadError('');
    setShowHelp(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFile(file: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('يُقبل فقط ملفات CSV (.csv) — يرجى تصدير الملف بصيغة CSV من نون');
      return;
    }

    const tab = TABS.find(t => t.id === activeTab)!;

    setUploading(true);
    setProgress(0);
    setUploadResult(null);
    setUploadError('');

    try {
      const result = await api.upload(file, tab.importType, pct => setProgress(pct));
      setUploadResult(result);
      loadBatches();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'فشل رفع الملف');
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
    if (!confirm('هل أنت متأكد من حذف دفعة الاستيراد هذه؟ سيتم حذف جميع الطلبات والحركات المرتبطة بها.')) return;
    setDeletingId(batchId);
    try {
      await api.deleteBatch(batchId);
      loadBatches();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل الحذف');
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.ceil(total / 20);
  const currentTab = TABS.find(t => t.id === activeTab)!;
  const help = TAB_HELP[activeTab];

  return (
    <div className="space-y-5" dir="rtl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">مركز الاستيراد</h1>
        <p className="text-slate-500 text-sm mt-0.5">رفع ملفات CSV من بوابة نون لاستيراد الطلبات والمخزون والتقارير</p>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors -mb-px
                ${isActive
                  ? 'bg-white border-slate-200 text-blue-600 border-b-white'
                  : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Upload Panel ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800 text-sm">{help.title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{help.desc}</p>
          </div>
          <button
            onClick={() => setShowHelp(v => !v)}
            className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            {showHelp ? 'إخفاء الأعمدة' : 'عرض الأعمدة المطلوبة'}
          </button>
        </div>

        {/* Expected columns help */}
        {showHelp && (
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">الأعمدة المطلوبة</p>
            <div className="flex flex-wrap gap-1.5">
              {help.cols.map(col => (
                <code key={col} className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-mono">
                  {col}
                </code>
              ))}
            </div>
          </div>
        )}

        <div className="p-5">
          {/* Upload error */}
          {uploadError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span className="break-words">{uploadError}</span>
            </div>
          )}

          {/* Upload result */}
          {uploadResult && (
            <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <span className="font-semibold text-emerald-800 text-sm">تم الاستيراد بنجاح</span>
                <span className="mr-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  {FORMAT_LABEL[uploadResult.format] ?? uploadResult.format}
                </span>
              </div>

              {/* Monthly result */}
              {uploadResult.format === 'monthly' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'طلبات مستوردة', value: uploadResult.salesCount },
                    { label: 'مرتجعات',        value: uploadResult.returnsCount },
                    { label: 'رسوم',           value: uploadResult.feesCount },
                    { label: 'متخطاة',         value: uploadResult.rowsSkipped },
                  ].map(({ label, value }) => (
                    <ResultCard key={label} label={label} value={value.toLocaleString('ar-SA')} />
                  ))}
                  {uploadResult.totalSales > 0 && (
                    <div className="col-span-2 sm:col-span-4 grid grid-cols-3 gap-3 mt-1">
                      <ResultCard label="إجمالي المبيعات" value={`${fmt(uploadResult.totalSales)} ر.س`} />
                      <ResultCard label="إجمالي الرسوم"   value={`${fmt(uploadResult.totalFees)} ر.س`} />
                      <ResultCard label="ضريبة الرسوم"    value={`${fmt(uploadResult.feesVat)} ر.س`} />
                    </div>
                  )}
                </div>
              )}

              {/* Weekly result */}
              {uploadResult.format === 'weekly_noon' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <ResultCard label="صفوف مضافة"    value={uploadResult.rowsImported.toLocaleString('ar-SA')} />
                  <ResultCard label="صفوف محدّثة"   value={uploadResult.rowsUpdated.toLocaleString('ar-SA')} />
                  <ResultCard label="مبيعات"         value={uploadResult.salesCount.toLocaleString('ar-SA')} />
                  <ResultCard label="مرتجعات"        value={uploadResult.returnsCount.toLocaleString('ar-SA')} />
                  {uploadResult.totalSales > 0 && (
                    <div className="col-span-2 sm:col-span-4">
                      <ResultCard label="إجمالي المبيعات" value={`${fmt(uploadResult.totalSales)} ر.س`} />
                    </div>
                  )}
                </div>
              )}

              {/* Inventory result */}
              {uploadResult.format === 'full_inventory' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <ResultCard label="منتجات جديدة"      value={(uploadResult.rowsImported).toLocaleString('ar-SA')} />
                  <ResultCard label="منتجات محدّثة"      value={(uploadResult.productsUpdated ?? 0).toLocaleString('ar-SA')} />
                  <ResultCard label="تسويات مخزون"       value={(uploadResult.stockUpdated ?? 0).toLocaleString('ar-SA')} />
                  <ResultCard label="صفوف متخطاة"        value={uploadResult.rowsSkipped.toLocaleString('ar-SA')} />
                </div>
              )}

              {/* Old sales result */}
              {uploadResult.format === 'old' && (
                <div className="grid grid-cols-3 gap-3">
                  <ResultCard label="صفوف مضافة"  value={uploadResult.rowsImported.toLocaleString('ar-SA')} />
                  <ResultCard label="صفوف محدّثة" value={uploadResult.rowsUpdated.toLocaleString('ar-SA')} />
                  <ResultCard label="صفوف متخطاة" value={uploadResult.rowsSkipped.toLocaleString('ar-SA')} />
                </div>
              )}

              {/* Warnings */}
              {uploadResult.warnings.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-amber-700 text-xs font-medium mb-1">
                    <AlertTriangle size={12} />
                    {uploadResult.warnings.length} تحذير
                  </div>
                  <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                    {uploadResult.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-700 font-mono">{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Upload zone */}
          {uploading ? (
            <div className="border-2 border-dashed border-blue-300 rounded-xl p-10 text-center bg-blue-50">
              <div className="mb-3 max-w-sm mx-auto">
                <div className="w-full bg-blue-100 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <p className="text-blue-700 font-medium text-sm">
                {progress < 100 ? `جارٍ الرفع… ${progress}%` : 'جارٍ المعالجة…'}
              </p>
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                ${dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={28} className="mx-auto text-slate-400 mb-3" />
              <p className="text-slate-600 font-medium text-sm">اسحب ملف CSV هنا أو انقر للاختيار</p>
              <p className="text-slate-400 text-xs mt-1">ملفات CSV فقط · حد أقصى 10MB</p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".csv"
                onChange={onFileChange}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Import History ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 text-sm">سجل الاستيراد</h2>
          <button onClick={loadBatches} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            <RefreshCw size={12} />
            تحديث
          </button>
        </div>

        {listError && (
          <div className="mx-5 my-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            {listError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['النوع', 'اسم الملف', 'رقم الكشف', 'تاريخ الكشف', 'تاريخ الاستيراد', 'مضافة', 'متخطاة', 'مبيعات', 'مرتجعات', 'رسوم', 'الحالة', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingList ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-400 text-sm">جارٍ التحميل…</td></tr>
              ) : batches.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-400 text-sm">لا توجد عمليات استيراد سابقة</td></tr>
              ) : batches.map(b => (
                <tr key={b.batchId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                      ${b.importType === 'monthly_statement'
                        ? 'bg-violet-50 text-violet-700'
                        : b.importType === 'weekly_noon'
                        ? 'bg-blue-50 text-blue-700'
                        : b.importType === 'full_inventory'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'}`}>
                      {IMPORT_TYPE_BADGE[b.importType] ?? b.importType}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs max-w-[140px] truncate text-slate-600" title={b.fileName ?? undefined}>
                    {b.fileName ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{b.statementNr ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{b.statementDate ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(b.createdAt).toLocaleString('ar-SA')}
                  </td>
                  <td className="px-3 py-2.5 text-emerald-700 font-semibold text-xs">{b.rowsImported.toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 text-slate-400 text-xs">{b.rowsSkipped.toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 text-xs">{b.salesCount.toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 text-xs">{b.returnsCount.toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 text-xs">{b.feesCount.toLocaleString('ar-SA')}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                      ${b.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {b.status === 'completed' ? 'مكتمل' : b.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => deleteBatch(b.batchId)}
                      disabled={deletingId === b.batchId}
                      className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="حذف الدفعة"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <button
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 text-sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              السابق
            </button>
            <span>صفحة {page} من {totalPages}</span>
            <button
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 text-sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
            >
              التالي
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Small result card ────────────────────────────────────────────────────────

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg p-3 text-center border border-emerald-100">
      <p className="text-lg font-bold text-emerald-700">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
