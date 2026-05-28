'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Upload, AlertCircle, CheckCircle2, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import { imports as api } from '@/lib/api';
import type { ImportBatch, ImportResult } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ImportPage() {
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

  async function handleFile(file: File) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('يُقبل فقط ملفات CSV (.csv) — يرجى تصدير الملف بصيغة CSV من نون');
      return;
    }

    setUploading(true);
    setProgress(0);
    setUploadResult(null);
    setUploadError('');

    try {
      const result = await api.upload(file, pct => setProgress(pct));
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">مركز الاستيراد</h1>
        <p className="text-slate-500 text-sm mt-1">رفع ملفات CSV الشهرية من نون لاستيراد الطلبات والرسوم</p>
      </div>

      {/* Upload zone */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-4">رفع ملف جديد</h2>

        {uploadError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="break-words">{uploadError}</span>
          </div>
        )}

        {uploadResult && (
          <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-4 text-sm text-emerald-700">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} className="shrink-0" />
              <span className="font-semibold">تم الاستيراد بنجاح</span>
              <span className="mr-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                {uploadResult.format === 'monthly' ? 'كشف شهري' : 'ملف مبيعات'}
              </span>
            </div>

            {uploadResult.format === 'monthly' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                {[
                  { label: 'طلبات مستوردة',  value: uploadResult.salesCount },
                  { label: 'مرتجعات',         value: uploadResult.returnsCount },
                  { label: 'رسوم',            value: uploadResult.feesCount },
                  { label: 'صفوف متخطاة',    value: uploadResult.rowsSkipped },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-lg p-3 text-center border border-emerald-100">
                    <p className="text-xl font-bold text-emerald-700">{value.toLocaleString('ar-SA')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
                {uploadResult.totalSales > 0 && (
                  <div className="col-span-2 sm:col-span-4 grid grid-cols-3 gap-3 mt-1">
                    {[
                      { label: 'إجمالي المبيعات', value: `${fmt(uploadResult.totalSales)} ر.س` },
                      { label: 'إجمالي الرسوم',   value: `${fmt(uploadResult.totalFees)} ر.س` },
                      { label: 'ضريبة الرسوم',    value: `${fmt(uploadResult.feesVat)} ر.س` },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white rounded-lg p-3 text-center border border-emerald-100">
                        <p className="text-sm font-bold text-emerald-700">{value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 mt-2">
                {[
                  { label: 'صفوف مضافة',    value: uploadResult.rowsImported },
                  { label: 'صفوف محدّثة',   value: uploadResult.rowsUpdated },
                  { label: 'صفوف متخطاة',   value: uploadResult.rowsSkipped },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-lg p-3 text-center border border-emerald-100">
                    <p className="text-xl font-bold text-emerald-700">{value.toLocaleString('ar-SA')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {uploadResult.warnings.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <div className="flex items-center gap-1.5 text-amber-700 text-xs font-medium mb-1">
                  <AlertTriangle size={13} />
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

        {uploading ? (
          <div className="border-2 border-dashed border-brand-300 rounded-xl p-10 text-center bg-brand-50">
            <div className="mb-3 max-w-sm mx-auto">
              <div className="w-full bg-brand-100 rounded-full h-2.5">
                <div
                  className="bg-brand-600 h-2.5 rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="text-brand-700 font-medium">
              {progress < 100 ? `جارٍ الرفع… ${progress}%` : 'جارٍ المعالجة…'}
            </p>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${dragging ? 'border-brand-400 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={32} className="mx-auto text-slate-400 mb-3" />
            <p className="text-slate-600 font-medium">اسحب ملف CSV هنا أو انقر للاختيار</p>
            <p className="text-slate-400 text-sm mt-1">ملفات CSV فقط · حد أقصى 10MB</p>
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

      {/* History */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">سجل الاستيراد</h2>
          <button
            onClick={() => loadBatches()}
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <RefreshCw size={13} />
            تحديث
          </button>
        </div>

        {listError && (
          <div className="mx-5 my-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            {listError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['النوع', 'اسم الملف', 'رقم الكشف', 'تاريخ الكشف', 'تاريخ الاستيراد', 'مستوردة', 'متخطاة', 'طلبات', 'مرتجعات', 'رسوم', 'الحالة', ''].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr><td colSpan={12} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              ) : batches.length === 0 ? (
                <tr><td colSpan={12} className="table-td text-center py-10 text-slate-400">لا توجد عمليات استيراد سابقة</td></tr>
              ) : batches.map(b => (
                <tr key={b.batchId} className="hover:bg-slate-50">
                  <td className="table-td">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset
                      ${b.importType === 'monthly_statement'
                        ? 'bg-blue-50 text-blue-700 ring-blue-200'
                        : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                      {b.importType === 'monthly_statement' ? 'شهري' : 'مبيعات'}
                    </span>
                  </td>
                  <td className="table-td font-mono text-xs max-w-[150px] truncate" title={b.fileName ?? undefined}>
                    {b.fileName ?? '—'}
                  </td>
                  <td className="table-td font-mono text-xs">{b.statementNr ?? '—'}</td>
                  <td className="table-td text-slate-400 text-xs">{b.statementDate ?? '—'}</td>
                  <td className="table-td text-slate-400 text-xs">
                    {new Date(b.createdAt).toLocaleString('ar-SA')}
                  </td>
                  <td className="table-td text-emerald-700 font-medium">{b.rowsImported.toLocaleString('ar-SA')}</td>
                  <td className="table-td text-slate-400">{b.rowsSkipped.toLocaleString('ar-SA')}</td>
                  <td className="table-td">{b.salesCount.toLocaleString('ar-SA')}</td>
                  <td className="table-td">{b.returnsCount.toLocaleString('ar-SA')}</td>
                  <td className="table-td">{b.feesCount.toLocaleString('ar-SA')}</td>
                  <td className="table-td">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset
                      ${b.status === 'completed' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                      {b.status === 'completed' ? 'مكتمل' : b.status}
                    </span>
                  </td>
                  <td className="table-td">
                    <button
                      onClick={() => deleteBatch(b.batchId)}
                      disabled={deletingId === b.batchId}
                      className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="حذف الدفعة"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <button className="btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</button>
            <span>صفحة {page} من {totalPages}</span>
            <button className="btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>التالي</button>
          </div>
        )}
      </div>
    </div>
  );
}
