'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertCircle, ArrowRight, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { invoices as api, inventory, accounts as accountsApi } from '@/lib/api';
import type { Account, Warehouse } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemRow {
  key: number;
  sku: string;
  itemDescription: string; // [ADD #5] اسم الصنف/الخدمة
  uom: string;             // [ADD #6] وحدة القياس
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

let rowKey = 0;

function emptyRow(): ItemRow {
  return {
    key: ++rowKey,
    sku: '',
    itemDescription: '', // [ADD #5]
    uom: 'قطعة',         // [ADD #6]
    quantity: '1',
    unitPrice: '',
    vatRate: '0.15',
  };
}

// ─── [ADD] Constants ──────────────────────────────────────────────────────────

const UOM_OPTIONS = ['قطعة', 'كيلو', 'متر', 'لتر', 'ساعة', 'صندوق', 'كرتون', 'طن'];

// [ADD #11] Status steps
const STATUS_STEPS = [
  { key: 'draft',    label: 'مسودة'  },
  { key: 'review',   label: 'مراجعة' },
  { key: 'approved', label: 'اعتماد' },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewInvoicePage() {
  const router = useRouter();

  // ── Existing state ──────────────────────────────────────────────────────────
  const [supplierName, setSupplierName]   = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate]     = useState('');
  const [vatMode, setVatMode]             = useState<'inclusive' | 'exclusive' | 'exempt'>('exclusive');
  const [notes, setNotes]                 = useState('');
  const [warehouseId, setWarehouseId]     = useState('');
  const [warehouses, setWarehouses]       = useState<Warehouse[]>([]);
  const [items, setItems]                 = useState<ItemRow[]>([emptyRow()]);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');

  // ── [ADD] New state ─────────────────────────────────────────────────────────
  const [supplierVatNumber, setSupplierVatNumber]     = useState('');        // #1
  const [paymentTerms, setPaymentTerms]               = useState('');        // #3
  const [dueDate, setDueDate]                         = useState('');        // #2
  const [poNumber, setPoNumber]                       = useState('');        // #4
  const [discountAmount, setDiscountAmount]           = useState('');        // #7
  const [attachFile, setAttachFile]                   = useState<File | null>(null); // #8
  const attachInputRef                                = useRef<HTMLInputElement>(null); // #8
  const [accountingAccountId, setAccountingAccountId] = useState('');       // #9
  const [allAccounts, setAllAccounts]                 = useState<Account[]>([]); // #9
  const [formStatus, setFormStatus]                   = useState<'draft' | 'review' | 'approved'>('draft'); // #11
  const [savingMode, setSavingMode]                   = useState<'draft' | 'review' | null>(null); // #10

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    inventory.warehouses().then(setWarehouses).catch(() => {});
    accountsApi.list({ activeOnly: true }).then(setAllAccounts).catch(() => {}); // [ADD #9]
  }, []);

  // ── Existing helpers ────────────────────────────────────────────────────────

  function updateItem(key: number, field: keyof ItemRow, value: string) {
    setItems(rows => rows.map(r => r.key === key ? { ...r, [field]: value } : r));
  }
  function addItem()           { setItems(rows => [...rows, emptyRow()]); }
  function removeItem(key: number) { setItems(rows => rows.filter(r => r.key !== key)); }

  function computeItemTotals(item: ItemRow) {
    const qty   = parseFloat(item.quantity)  || 0;
    const price = parseFloat(item.unitPrice) || 0;
    const vat   = parseFloat(item.vatRate)   || 0;
    const sub   = qty * price;
    const vatAmt = sub * vat;
    return { sub, vatAmt, total: sub + vatAmt };
  }

  const totals = items.reduce((a, it) => {
    const t = computeItemTotals(it);
    return { sub: a.sub + t.sub, vat: a.vat + t.vatAmt, total: a.total + t.total };
  }, { sub: 0, vat: 0, total: 0 });

  // [ADD #7] Discount-adjusted final total
  const discount   = parseFloat(discountAmount) || 0;
  const finalTotal = Math.max(0, totals.total - discount);

  // Existing save (unchanged — kept as-is for backward compat)
  async function save() {
    setError('');
    const validItems = items.filter(it => it.sku.trim() && it.quantity && it.unitPrice);
    if (!supplierName.trim() && !invoiceNumber.trim()) {
      setError('يجب إدخال اسم المورد أو رقم الفاتورة على الأقل');
      return;
    }
    setSaving(true);
    try {
      const dto = {
        supplierName: supplierName || undefined,
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate: invoiceDate || undefined,
        vatMode,
        notes: notes || undefined,
        warehouseId: warehouseId ? parseInt(warehouseId, 10) : undefined,
        items: validItems.map(it => ({
          sku:       it.sku.trim(),
          quantity:  parseInt(it.quantity, 10),
          unitPrice: parseFloat(it.unitPrice).toFixed(4),
          vatRate:   parseFloat(it.vatRate).toFixed(4),
        })),
      };
      const created = await api.create(dto);
      router.push(`/invoices/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ الفاتورة');
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n: number) =>
    n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── [ADD] New helpers ───────────────────────────────────────────────────────

  // [ADD #3] Auto-compute due date from payment terms and invoice date
  function computeDueDate(terms: string, base: string): string {
    if (!base || !terms) return '';
    const days = parseInt(terms, 10);
    if (isNaN(days)) return '';
    if (days === 0) return base;
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function handlePaymentTermsChange(val: string) {
    setPaymentTerms(val);
    setDueDate(computeDueDate(val, invoiceDate));
  }

  // [ADD #2] Sync due date when invoice date changes
  function handleInvoiceDateChange(val: string) {
    setInvoiceDate(val);
    if (paymentTerms) setDueDate(computeDueDate(paymentTerms, val));
  }

  // [ADD #10] Save with full metadata (draft or review)
  async function saveWithExtras(mode: 'draft' | 'review') {
    setFormStatus(mode);
    setSavingMode(mode);
    setError('');

    const validItems = items.filter(it => it.sku.trim() && it.quantity && it.unitPrice);
    if (!supplierName.trim() && !invoiceNumber.trim()) {
      setError('يجب إدخال اسم المورد أو رقم الفاتورة على الأقل');
      setSavingMode(null);
      return;
    }
    setSaving(true);
    try {
      // Enrich notes with extra metadata
      const meta = [
        notes,
        supplierVatNumber ? `ض.ق.م مورد: ${supplierVatNumber}`                           : '',
        poNumber          ? `PO: ${poNumber}`                                              : '',
        paymentTerms      ? `شروط الدفع: ${paymentTerms === '0' ? 'فوري' : `${paymentTerms} يوم`}` : '',
        dueDate           ? `الاستحقاق: ${dueDate}`                                        : '',
        discount > 0      ? `خصم: ${fmt(discount)} ر.س`                                   : '',
        accountingAccountId
          ? `حساب: ${allAccounts.find(a => String(a.id) === accountingAccountId)?.nameAr ?? accountingAccountId}`
          : '',
        mode === 'review' ? 'الحالة: مرسل للاعتماد' : 'الحالة: مسودة',
      ].filter(Boolean).join(' | ');

      const dto = {
        supplierName:  supplierName  || undefined,
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate:   invoiceDate   || undefined,
        vatMode,
        notes:         meta          || undefined,
        warehouseId:   warehouseId   ? parseInt(warehouseId, 10) : undefined,
        items: validItems.map(it => ({
          sku:       it.sku.trim(),
          quantity:  parseInt(it.quantity, 10),
          unitPrice: parseFloat(it.unitPrice).toFixed(4),
          vatRate:   parseFloat(it.vatRate).toFixed(4),
        })),
      };

      const created = await api.create(dto);

      // [ADD #8] Upload attachment after creation
      if (attachFile) {
        await api.uploadPdf(created.id, attachFile).catch(e =>
          console.warn('[invoice attachment upload]', e),
        );
      }

      router.push(`/invoices/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ الفاتورة');
    } finally {
      setSaving(false);
      setSavingMode(null);
    }
  }

  // ── [ADD #11] Status step index ─────────────────────────────────────────────
  const statusIdx = STATUS_STEPS.findIndex(s => s.key === formStatus);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl">

      {/* Page title — unchanged */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/invoices" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowRight size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">فاتورة جديدة</h1>
          <p className="text-slate-500 text-sm mt-0.5">إدخال فاتورة مورد مع بنود البضاعة</p>
        </div>
      </div>

      {/* [ADD #11] ── شريط الحالة ──────────────────────────────────────────── */}
      <div className="card p-4 mb-4">
        <div className="flex items-center">
          {STATUS_STEPS.map((step, idx) => {
            const isPast    = idx < statusIdx;
            const isCurrent = idx === statusIdx;
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    transition-all duration-200
                    ${isCurrent ? 'bg-brand-600 text-white ring-2 ring-brand-200'
                    : isPast    ? 'bg-green-500 text-white'
                    : 'bg-slate-200 text-slate-400'}
                  `}>
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span className={`text-sm whitespace-nowrap ${
                    isCurrent ? 'font-semibold text-brand-600'
                    : isPast  ? 'text-green-600'
                    : 'text-slate-400'
                  }`}>
                    {step.label}
                  </span>
                </div>
                {idx < STATUS_STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-4 transition-colors ${isPast ? 'bg-green-400' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error banner — unchanged */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── بيانات الفاتورة ──────────────────────────────────────────────────── */}
      <div className="card p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-4">بيانات الفاتورة</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* اسم المورد — unchanged label, added * */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              اسم المورد <span className="text-red-500">*</span>
            </label>
            <input
              className="input"
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="مثال: شركة التوريدات العربية"
            />
          </div>

          {/* [ADD #1] الرقم الضريبي للمورد */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">الرقم الضريبي للمورد</label>
            <input
              className="input font-mono tracking-widest"
              value={supplierVatNumber}
              onChange={e => setSupplierVatNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
              placeholder="300XXXXXXXXXXX3"
              maxLength={15}
              inputMode="numeric"
            />
            {supplierVatNumber.length > 0 && supplierVatNumber.length < 15 && (
              <p className="text-xs text-amber-500 mt-0.5">{15 - supplierVatNumber.length} رقم متبقٍ</p>
            )}
          </div>

          {/* رقم الفاتورة — added * */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              رقم الفاتورة <span className="text-red-500">*</span>
            </label>
            <input
              className="input"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="مثال: INV-2026-001"
            />
          </div>

          {/* تاريخ الفاتورة — onChange wired to handleInvoiceDateChange for [ADD #2/#3] */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">تاريخ الفاتورة</label>
            <input
              className="input"
              type="date"
              value={invoiceDate}
              onChange={e => handleInvoiceDateChange(e.target.value)}
            />
          </div>

          {/* [ADD #3] شروط الدفع */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">شروط الدفع</label>
            <select
              className="input"
              value={paymentTerms}
              onChange={e => handlePaymentTermsChange(e.target.value)}
            >
              <option value="">— اختر —</option>
              <option value="0">فوري (Net 0)</option>
              <option value="30">30 يوم (Net 30)</option>
              <option value="60">60 يوم (Net 60)</option>
              <option value="90">90 يوم (Net 90)</option>
            </select>
          </div>

          {/* [ADD #2] تاريخ الاستحقاق — auto-computed */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              تاريخ الاستحقاق
              {dueDate && paymentTerms && (
                <span className="text-green-600 text-[10px] mr-1.5 font-normal">(محسوب تلقائياً)</span>
              )}
            </label>
            <input
              className={`input ${dueDate ? 'border-green-300 bg-green-50/50 text-green-800' : ''}`}
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          {/* معالجة ض.ق.م — unchanged */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">معالجة ضريبة القيمة المضافة</label>
            <select
              className="input"
              value={vatMode}
              onChange={e => setVatMode(e.target.value as typeof vatMode)}
            >
              <option value="exclusive">حصري (الأسعار لا تشمل ض.ق.م)</option>
              <option value="inclusive">شامل (الأسعار تشمل ض.ق.م)</option>
              <option value="exempt">معفى</option>
            </select>
          </div>

          {/* المستودع — unchanged */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">المستودع</label>
            <select
              className="input"
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
            >
              <option value="">— بدون مستودع —</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
              ))}
            </select>
          </div>

          {/* ملاحظات — unchanged */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
            <input
              className="input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="ملاحظات اختيارية"
            />
          </div>

          {/* [ADD #8] رفع مرفقات — same row as ملاحظات */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              <Paperclip size={11} className="inline ml-1 text-slate-400" />
              مرفق (PDF / صورة)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={attachInputRef}
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                className="hidden"
                onChange={e => setAttachFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => attachInputRef.current?.click()}
                className="input flex-1 text-right cursor-pointer text-slate-400 hover:border-brand-400 text-sm truncate"
              >
                {attachFile ? (
                  <span className="text-slate-700">{attachFile.name}</span>
                ) : (
                  'اختر ملفاً...'
                )}
              </button>
              {attachFile && (
                <button
                  type="button"
                  onClick={() => {
                    setAttachFile(null);
                    if (attachInputRef.current) attachInputRef.current.value = '';
                  }}
                  className="text-red-400 hover:text-red-600 text-xs p-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* [ADD #9] الحساب المحاسبي — linked to Chart of Accounts */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">الحساب المحاسبي</label>
            <select
              className="input"
              value={accountingAccountId}
              onChange={e => setAccountingAccountId(e.target.value)}
            >
              <option value="">— اختر من دليل الحسابات —</option>
              {allAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.nameAr}{a.nameEn ? ` (${a.nameEn})` : ''}
                </option>
              ))}
            </select>
            {allAccounts.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                لا توجد حسابات — أنشئ دليل الحسابات أولاً من{' '}
                <Link href="/accounts" className="text-brand-600 hover:underline">صفحة الحسابات</Link>
              </p>
            )}
          </div>

        </div>
      </div>

      {/* [ADD #4] ── ربط أمر الشراء (PO) ────────────────────────────────────── */}
      <div className="card p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ربط بأمر الشراء (PO)</label>
            <input
              className={`input ${poNumber ? 'border-green-300' : ''}`}
              value={poNumber}
              onChange={e => setPoNumber(e.target.value)}
              placeholder="مثال: PO-2026-042"
            />
            {poNumber && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <span>✓</span> مرتبط بأمر الشراء
                <span className="font-mono font-semibold">{poNumber}</span>
              </p>
            )}
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-slate-600 leading-relaxed">
            <span className="font-semibold text-blue-700 block mb-0.5">المطابقة الثلاثية (3-Way Match)</span>
            الربط يمنع الدفع المزدوج ويتيح المطابقة الثلاثية:
            أمر الشراء ← استلام البضاعة ← الفاتورة
          </div>
        </div>
      </div>

      {/* ── بنود الفاتورة ─────────────────────────────────────────────────────── */}
      <div className="card mb-4">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">بنود الفاتورة</h2>
          <button
            onClick={addItem}
            className="flex items-center gap-1.5 text-sm btn-ghost text-brand-600"
          >
            <Plus size={15} />
            إضافة بند
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  'SKU',
                  'اسم الصنف / الخدمة', // [ADD #5]
                  'الكمية',
                  'وحدة القياس',         // [ADD #6]
                  'سعر الوحدة',
                  'نسبة ض.ق.م',
                  'المجموع الفرعي',
                  'الضريبة',
                  'الإجمالي',
                  '',
                ].map(h => (
                  <th key={h} className="table-th whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const { sub, vatAmt, total } = computeItemTotals(it);
                return (
                  <tr key={it.key}>
                    {/* SKU — unchanged */}
                    <td className="table-td">
                      <input
                        className="input w-28 text-xs font-mono"
                        value={it.sku}
                        onChange={e => updateItem(it.key, 'sku', e.target.value)}
                        placeholder="Z123456789"
                      />
                    </td>

                    {/* [ADD #5] اسم الصنف / الخدمة */}
                    <td className="table-td">
                      <input
                        className="input w-36 text-xs"
                        value={it.itemDescription}
                        onChange={e => updateItem(it.key, 'itemDescription', e.target.value)}
                        placeholder="اسم المنتج أو الخدمة"
                      />
                    </td>

                    {/* الكمية — unchanged */}
                    <td className="table-td">
                      <input
                        className="input w-16 text-center"
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={e => updateItem(it.key, 'quantity', e.target.value)}
                      />
                    </td>

                    {/* [ADD #6] وحدة القياس */}
                    <td className="table-td">
                      <select
                        className="input w-20 text-xs"
                        value={it.uom}
                        onChange={e => updateItem(it.key, 'uom', e.target.value)}
                      >
                        {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>

                    {/* سعر الوحدة — unchanged */}
                    <td className="table-td">
                      <input
                        className="input w-24"
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unitPrice}
                        onChange={e => updateItem(it.key, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                      />
                    </td>

                    {/* نسبة ض.ق.م — unchanged */}
                    <td className="table-td">
                      <select
                        className="input w-20 text-sm"
                        value={it.vatRate}
                        onChange={e => updateItem(it.key, 'vatRate', e.target.value)}
                      >
                        <option value="0.15">15%</option>
                        <option value="0">0%</option>
                        <option value="0.05">5%</option>
                      </select>
                    </td>

                    {/* Computed columns — unchanged */}
                    <td className="table-td text-slate-500">{fmt(sub)}</td>
                    <td className="table-td text-amber-600">{fmt(vatAmt)}</td>
                    <td className="table-td font-medium">{fmt(total)}</td>
                    <td className="table-td">
                      <button
                        onClick={() => removeItem(it.key)}
                        disabled={items.length === 1}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
          <div className="space-y-1.5 text-sm min-w-[260px]">

            {/* Existing rows — unchanged */}
            <div className="flex justify-between gap-6">
              <span className="text-slate-500">المجموع الفرعي</span>
              <span className="font-medium">{fmt(totals.sub)} ر.س</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-slate-500">ضريبة القيمة المضافة</span>
              <span className="text-amber-600">{fmt(totals.vat)} ر.س</span>
            </div>

            {/* [ADD #7] سطر الخصم */}
            <div className="flex justify-between items-center gap-6">
              <span className="text-slate-500">الخصم</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={e => setDiscountAmount(e.target.value)}
                  placeholder="0.00"
                  className="input w-28 text-left text-xs h-7 py-0.5 px-2"
                />
                <span className="text-slate-400 text-xs">ر.س</span>
              </div>
            </div>

            {/* الإجمالي — updated to use finalTotal */}
            <div className="flex justify-between gap-6 pt-1.5 border-t border-slate-200">
              <span className="font-semibold">الإجمالي</span>
              <span className={`font-bold ${discount > 0 ? 'text-brand-600' : 'text-slate-900'}`}>
                {fmt(finalTotal)} ر.س
              </span>
            </div>

            {/* [ADD #7] وفرت X ر.س */}
            {discount > 0 && (
              <div className="flex justify-between gap-6 text-xs text-green-600 font-medium">
                <span>وفرت</span>
                <span>− {fmt(discount)} ر.س</span>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* [ADD #10] ── الأزرار: مسودة + إرسال للاعتماد ──────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        <Link href="/invoices" className="btn-ghost">إلغاء</Link>

        {/* حفظ كمسودة */}
        <button
          onClick={() => saveWithExtras('draft')}
          disabled={saving}
          className="btn-ghost border border-slate-300 min-w-[130px] disabled:opacity-50"
        >
          {saving && savingMode === 'draft' ? 'جارٍ الحفظ…' : 'حفظ كمسودة'}
        </button>

        {/* حفظ وإرسال للاعتماد */}
        <button
          onClick={() => saveWithExtras('review')}
          disabled={saving}
          className="btn-primary min-w-[170px] disabled:opacity-50"
        >
          {saving && savingMode === 'review' ? 'جارٍ الإرسال…' : 'حفظ وإرسال للاعتماد'}
        </button>
      </div>

    </div>
  );
}
