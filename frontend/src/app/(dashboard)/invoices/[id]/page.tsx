'use client';

import { useEffect, useState, useRef } from 'react';
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, AlertCircle, XCircle, Plus, Trash2, Upload, FileDown, Trash } from 'lucide-react';
import Link from 'next/link';
import { invoices as api, inventory } from '@/lib/api';
import type { InvoiceDetail, Warehouse } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = parseInt(id, 10);

  const [invoice, setInvoice]         = useState<InvoiceDetail | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [voidReason, setVoidReason]   = useState('');
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voiding, setVoiding]         = useState(false);
  const [voidError, setVoidError]     = useState('');

  // Add item form state
  const [showAddItem, setShowAddItem] = useState(false);
  const [newSku, setNewSku]           = useState('');
  const [newQty, setNewQty]           = useState('1');
  const [newPrice, setNewPrice]       = useState('');
  const [newVat, setNewVat]           = useState('0.15');
  const [addingItem, setAddingItem]   = useState(false);
  const [addItemError, setAddItemError] = useState('');
  const [removingItem, setRemovingItem] = useState<number | null>(null);
  const [warehouses, setWarehouses]   = useState<Warehouse[]>([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfError, setPdfError]         = useState('');
  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
    inventory.warehouses().then(setWarehouses).catch(() => {});
  }, [invoiceId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const inv = await api.get(invoiceId);
      setInvoice(inv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل الفاتورة');
    } finally {
      setLoading(false);
    }
  }

  async function voidInvoice() {
    setVoiding(true);
    setVoidError('');
    try {
      await api.voidInvoice(invoiceId, voidReason || undefined);
      await load();
      setShowVoidForm(false);
      setVoidReason('');
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'فشل الإلغاء');
    } finally {
      setVoiding(false);
    }
  }

  async function addItem() {
    if (!newSku.trim() || !newPrice) {
      setAddItemError('يجب إدخال SKU والسعر');
      return;
    }
    setAddingItem(true);
    setAddItemError('');
    try {
      const updated = await api.addItem(invoiceId, {
        sku: newSku.trim(),
        quantity: parseInt(newQty, 10),
        unitPrice: parseFloat(newPrice).toFixed(4),
        vatRate: parseFloat(newVat).toFixed(4),
      });
      setInvoice(updated);
      setNewSku(''); setNewQty('1'); setNewPrice(''); setNewVat('0.15');
      setShowAddItem(false);
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : 'فشل إضافة البند');
    } finally {
      setAddingItem(false);
    }
  }

  async function handlePdfUpload(file: File) {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('يُقبل فقط ملفات PDF');
      return;
    }
    setUploadingPdf(true);
    setPdfError('');
    try {
      await api.uploadPdf(invoiceId, file);
      await load();
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'فشل رفع الملف');
    } finally {
      setUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  }

  async function handleDeletePdf() {
    if (!confirm('هل تريد حذف ملف PDF المرفق؟')) return;
    try {
      await api.deletePdf(invoiceId);
      await load();
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'فشل الحذف');
    }
  }

  async function removeItem(itemId: number) {
    if (!confirm('هل تريد حذف هذا البند؟')) return;
    setRemovingItem(itemId);
    try {
      const updated = await api.removeItem(invoiceId, itemId);
      setInvoice(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل حذف البند');
    } finally {
      setRemovingItem(null);
    }
  }

  const fmt = (v: string | number | null | undefined) => {
    if (v == null) return '—';
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const warehouseName = (id: number | null | undefined) =>
    id ? (warehouses.find(w => w.id === id)?.name ?? `#${id}`) : '—';

  const VAT_MODE_LABELS: Record<string, string> = {
    inclusive: 'شامل الضريبة',
    exclusive: 'حصري',
    exempt: 'معفى',
  };

  const EXPENSE_TYPE_LABELS: Record<string, string> = {
    goods_purchase:        'شراء بضاعة',
    shipping:              'شحن وتوصيل',
    advertising:           'إعلانات',
    operational_services:  'خدمات تشغيلية',
    software_subscriptions:'برامج واشتراكات',
    external_supplier:     'مورد خارجي',
    other:                 'أخرى',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400">جارٍ تحميل الفاتورة…</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div>
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2 mb-4">
          <AlertCircle size={16} className="shrink-0" />
          {error || 'عملية الشراء غير موجودة'}
        </div>
        <Link href="/invoices" className="btn-ghost">العودة للمشتريات</Link>
      </div>
    );
  }

  const isActive = invoice.status === 'active';

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/invoices" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowRight size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">
                {invoice.invoiceNumber ?? `شراء #${invoice.id}`}
              </h1>
              <Badge
                label={isActive ? 'نشط' : 'ملغى'}
                variant={isActive ? 'green' : 'red'}
              />
            </div>
            <p className="text-slate-500 text-sm mt-0.5">{invoice.supplierName ?? '—'}</p>
          </div>
        </div>
        {isActive && (
          <button
            onClick={() => setShowVoidForm(v => !v)}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            <XCircle size={14} />
            إلغاء الفاتورة
          </button>
        )}
      </div>

      {/* Void form */}
      {showVoidForm && (
        <div className="card p-4 mb-4 border-red-100 bg-red-50">
          <p className="text-sm text-red-700 font-medium mb-2">سبب الإلغاء (اختياري)</p>
          {voidError && (
            <p className="text-xs text-red-600 mb-2">{voidError}</p>
          )}
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              placeholder="مثال: خطأ في البيانات"
            />
            <button onClick={voidInvoice} disabled={voiding} className="btn-primary bg-red-600 hover:bg-red-700 text-sm px-4">
              {voiding ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}
            </button>
            <button onClick={() => setShowVoidForm(false)} className="btn-ghost text-sm">إلغاء</button>
          </div>
        </div>
      )}

      {/* Meta grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {[
          { label: 'التاريخ', value: invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('ar-SA') : '—' },
          { label: 'نوع المصروف', value: EXPENSE_TYPE_LABELS[(invoice as any).expenseType] ?? ((invoice as any).expenseType ?? '—') },
          { label: 'ضريبة ق.م', value: VAT_MODE_LABELS[invoice.vatMode] ?? invoice.vatMode },
          { label: 'المستودع', value: invoice.warehouse?.name ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="card p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-medium text-slate-800 mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {invoice.notes && (
        <div className="card p-4 mb-4">
          <p className="text-xs text-slate-500 mb-1">ملاحظات</p>
          <p className="text-sm text-slate-700">{invoice.notes}</p>
        </div>
      )}

      {/* PDF Attachment */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">مرفق PDF</p>
          <div className="flex items-center gap-2">
            {invoice.pdfFilename ? (
              <>
                <button
                  onClick={() => api.downloadPdf(invoiceId, invoice.pdfOriginalName ?? invoice.pdfFilename ?? 'invoice.pdf')}
                  className="flex items-center gap-1.5 text-xs btn-ghost text-blue-600 border border-blue-200"
                >
                  <FileDown size={13} />
                  {invoice.pdfOriginalName ?? invoice.pdfFilename}
                </button>
                {isActive && (
                  <button onClick={handleDeletePdf} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="حذف PDF">
                    <Trash size={13} />
                  </button>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-400">لا يوجد مرفق</span>
            )}
            {isActive && (
              <>
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={uploadingPdf}
                  className="flex items-center gap-1.5 text-xs btn-ghost border border-slate-200"
                >
                  <Upload size={13} />
                  {uploadingPdf ? 'جارٍ الرفع…' : invoice.pdfFilename ? 'استبدال' : 'رفع PDF'}
                </button>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); }}
                />
              </>
            )}
          </div>
        </div>
        {pdfError && <p className="text-xs text-red-600 mt-2">{pdfError}</p>}
      </div>

      {/* Items table */}
      <div className="card mb-4">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">البنود ({invoice.items.length})</h2>
          {isActive && (
            <button
              onClick={() => setShowAddItem(v => !v)}
              className="flex items-center gap-1.5 text-sm btn-ghost text-brand-600"
            >
              <Plus size={15} />
              إضافة بند
            </button>
          )}
        </div>

        {showAddItem && (
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            {addItemError && <p className="text-xs text-red-600 mb-2">{addItemError}</p>}
            <div className="flex gap-2 flex-wrap items-end">
              <div>
                <label className="block text-xs text-slate-500 mb-1">SKU</label>
                <input className="input w-36 text-xs font-mono" value={newSku} onChange={e => setNewSku(e.target.value)} placeholder="Z123456789" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">الكمية</label>
                <input className="input w-20" type="number" min="1" value={newQty} onChange={e => setNewQty(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">السعر</label>
                <input className="input w-28" type="number" min="0" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">ض.ق.م</label>
                <select className="input w-20" value={newVat} onChange={e => setNewVat(e.target.value)}>
                  <option value="0.15">15%</option>
                  <option value="0">0%</option>
                  <option value="0.05">5%</option>
                </select>
              </div>
              <button onClick={addItem} disabled={addingItem} className="btn-primary text-sm">
                {addingItem ? 'جارٍ…' : 'إضافة'}
              </button>
              <button onClick={() => { setShowAddItem(false); setAddItemError(''); }} className="btn-ghost text-sm">إلغاء</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['SKU', 'الكمية', 'سعر الوحدة', 'نسبة ض.ق.م', 'المجموع الفرعي', 'الضريبة', 'الإجمالي', ''].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.items.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center py-8 text-slate-400">لا توجد بنود</td></tr>
              ) : invoice.items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="table-td font-mono text-xs">{item.sku}</td>
                  <td className="table-td">{item.quantity}</td>
                  <td className="table-td">{fmt(item.unitPrice)} ر.س</td>
                  <td className="table-td">{(parseFloat(item.vatRate) * 100).toFixed(0)}%</td>
                  <td className="table-td">{fmt(item.lineSubtotal)}</td>
                  <td className="table-td text-amber-600">{fmt(item.lineVat)}</td>
                  <td className="table-td font-medium">{fmt(item.lineTotal)}</td>
                  <td className="table-td">
                    {isActive && (
                      <button
                        onClick={() => removeItem(item.id)}
                        disabled={removingItem === item.id}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
          <div className="space-y-1.5 text-sm min-w-[220px]">
            <div className="flex justify-between gap-6">
              <span className="text-slate-500">المجموع الفرعي</span>
              <span className="font-medium">{fmt(invoice.subtotal)} ر.س</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-slate-500">ضريبة القيمة المضافة</span>
              <span className="text-amber-600">{fmt(invoice.vatAmount)} ر.س</span>
            </div>
            <div className="flex justify-between gap-6 pt-1.5 border-t border-slate-200">
              <span className="font-semibold">الإجمالي</span>
              <span className="font-bold text-slate-900">{fmt(invoice.totalAmount)} ر.س</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
