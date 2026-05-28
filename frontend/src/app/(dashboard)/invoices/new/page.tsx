'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertCircle, ArrowRight, Paperclip, Zap } from 'lucide-react';
import Link from 'next/link';
import { invoices as api, inventory, accounts as accountsApi } from '@/lib/api';
import type { Account, Warehouse } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemRow {
  key: number;
  sku: string;
  itemDescription: string;
  uom: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

let rowKey = 0;

function emptyRow(): ItemRow {
  return { key: ++rowKey, sku: '', itemDescription: '', uom: 'قطعة', quantity: '1', unitPrice: '', vatRate: '0.15' };
}

const UOM_OPTIONS = ['قطعة', 'كيلو', 'متر', 'لتر', 'ساعة', 'صندوق', 'كرتون', 'طن'];

const STATUS_STEPS = [
  { key: 'draft',    label: 'مسودة'  },
  { key: 'review',   label: 'مراجعة' },
  { key: 'approved', label: 'اعتماد' },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewInvoicePage() {
  const router = useRouter();

  // ── State — ALL PRESERVED ──────────────────────────────────────────────────
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

  // Extra state — ALL PRESERVED (PO, accounting, cost center hidden from UI, kept in meta)
  const [supplierVatNumber, setSupplierVatNumber]     = useState('');
  const [paymentTerms, setPaymentTerms]               = useState('');
  const [dueDate, setDueDate]                         = useState('');
  const [poNumber]                                    = useState('');           // hidden — no PO workflow
  const [discountAmount, setDiscountAmount]           = useState('');
  const [attachFile, setAttachFile]                   = useState<File | null>(null);
  const attachInputRef                                = useRef<HTMLInputElement>(null);
  const [accountingAccountId]                         = useState('');           // hidden — auto-determined
  const [allAccounts, setAllAccounts]                 = useState<Account[]>([]); // kept for meta lookup
  const [formStatus, setFormStatus]                   = useState<'draft' | 'review' | 'approved'>('draft');
  const [savingMode, setSavingMode]                   = useState<'draft' | 'review' | null>(null);
  const [costCenter]                                  = useState('');           // hidden — feature-flag ready

  useEffect(() => {
    inventory.warehouses().then(setWarehouses).catch(() => {});
    accountsApi.list({ activeOnly: true }).then(setAllAccounts).catch(() => {});
  }, []);

  // ── Core helpers — ALL PRESERVED ──────────────────────────────────────────

  function updateItem(key: number, field: keyof ItemRow, value: string) {
    setItems(rows => rows.map(r => r.key === key ? { ...r, [field]: value } : r));
  }
  function addItem()                    { setItems(rows => [...rows, emptyRow()]); }
  function removeItem(key: number)      { setItems(rows => rows.filter(r => r.key !== key)); }

  function computeItemTotals(item: ItemRow) {
    const qty    = parseFloat(item.quantity)  || 0;
    const price  = parseFloat(item.unitPrice) || 0;
    const vat    = parseFloat(item.vatRate)   || 0;
    const sub    = qty * price;
    const vatAmt = sub * vat;
    return { sub, vatAmt, total: sub + vatAmt };
  }

  const totals = items.reduce((a, it) => {
    const t = computeItemTotals(it);
    return { sub: a.sub + t.sub, vat: a.vat + t.vatAmt, total: a.total + t.total };
  }, { sub: 0, vat: 0, total: 0 });

  const discount   = parseFloat(discountAmount) || 0;
  const finalTotal = Math.max(0, totals.total - discount);

  const fmt = (n: number) =>
    n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Existing save — PRESERVED UNCHANGED
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

  // Due-date helpers — PRESERVED
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
  function handleInvoiceDateChange(val: string) {
    setInvoiceDate(val);
    if (paymentTerms) setDueDate(computeDueDate(paymentTerms, val));
  }

  // Full save with metadata — PRESERVED UNCHANGED
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
    if (validItems.length === 0) {
      setError('يجب إضافة بند واحد على الأقل بـ SKU وكمية وسعر');
      setSavingMode(null);
      return;
    }
    setSaving(true);
    try {
      const meta = [
        notes,
        supplierVatNumber ? `ض.ق.م مورد: ${supplierVatNumber}` : '',
        poNumber          ? `PO: ${poNumber}` : '',
        paymentTerms      ? `شروط الدفع: ${paymentTerms === '0' ? 'فوري' : `${paymentTerms} يوم`}` : '',
        dueDate           ? `الاستحقاق: ${dueDate}` : '',
        discount > 0      ? `خصم: ${fmt(discount)} ر.س` : '',
        accountingAccountId
          ? `حساب: ${allAccounts.find(a => String(a.id) === accountingAccountId)?.nameAr ?? accountingAccountId}`
          : '',
        costCenter        ? `مركز التكلفة: ${costCenter}` : '',
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

  // Keyboard shortcut — add row on Enter in price field
  function handlePriceEnter(e: React.KeyboardEvent, isLastRow: boolean) {
    if (e.key === 'Enter' && isLastRow) {
      e.preventDefault();
      addItem();
      setTimeout(() => {
        const skuInputs = document.querySelectorAll<HTMLInputElement>('[data-row-sku]');
        skuInputs[skuInputs.length - 1]?.focus();
      }, 30);
    }
  }

  // Auto-accounting label — informational only
  const autoJournalLabel = warehouseId ? 'مخزون  ←  موردون' : 'مصاريف  ←  موردون';

  const statusIdx = STATUS_STEPS.findIndex(s => s.key === formStatus);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-4">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/invoices" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowRight size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">فاتورة جديدة</h1>
            <p className="text-slate-400 text-xs mt-0.5">إدخال سريع لفاتورة مورد</p>
          </div>
        </div>

        {/* Auto-accounting badge — informational, no user action needed */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-lg px-3 py-1.5">
          <Zap size={11} className="shrink-0" />
          قيد تلقائي: {autoJournalLabel}
        </div>
      </div>

      {/* ── Status Bar ───────────────────────────────────────────────────── */}
      <div className="card px-5 py-3">
        <div className="flex items-center">
          {STATUS_STEPS.map((step, idx) => {
            const isPast    = idx < statusIdx;
            const isCurrent = idx === statusIdx;
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all
                    ${isCurrent ? 'bg-brand-600 text-white' : isPast ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'}`}
                  >
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span className={`text-xs whitespace-nowrap
                    ${isCurrent ? 'font-semibold text-brand-600' : isPast ? 'text-green-600' : 'text-slate-400'}`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < STATUS_STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-3 ${isPast ? 'bg-green-300' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Section 1: بيانات المورد ──────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
          <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">١</span>
          بيانات المورد
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              اسم المورد <span className="text-red-400">*</span>
            </label>
            <input
              className="input"
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="شركة التوريدات العربية"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              رقم الفاتورة <span className="text-red-400">*</span>
            </label>
            <input
              className="input"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="INV-2026-001"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">تاريخ الفاتورة</label>
            <input
              className="input"
              type="date"
              value={invoiceDate}
              onChange={e => handleInvoiceDateChange(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">شروط الدفع</label>
            <select
              className="input"
              value={paymentTerms}
              onChange={e => handlePaymentTermsChange(e.target.value)}
            >
              <option value="">— اختر —</option>
              <option value="0">فوري</option>
              <option value="30">30 يوم</option>
              <option value="60">60 يوم</option>
              <option value="90">90 يوم</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              تاريخ الاستحقاق
              {dueDate && paymentTerms && (
                <span className="text-green-600 text-[10px] mr-1.5 font-normal">← محسوب تلقائياً</span>
              )}
            </label>
            <input
              className={`input ${dueDate ? 'border-green-300 bg-green-50/40 text-green-800' : ''}`}
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">المستودع</label>
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

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">وضع الضريبة</label>
            <select
              className="input"
              value={vatMode}
              onChange={e => setVatMode(e.target.value as typeof vatMode)}
            >
              <option value="exclusive">حصري — الأسعار لا تشمل ض.ق.م</option>
              <option value="inclusive">شامل — الأسعار تشمل ض.ق.م</option>
              <option value="exempt">معفى</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              الرقم الضريبي للمورد
              <span className="text-slate-400 font-normal mr-1">(اختياري)</span>
            </label>
            <input
              className="input font-mono"
              value={supplierVatNumber}
              onChange={e => setSupplierVatNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
              placeholder="300XXXXXXXXXXX3"
              maxLength={15}
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              ملاحظات
              <span className="text-slate-400 font-normal mr-1">(اختيارية)</span>
            </label>
            <input
              className="input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أي ملاحظات..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              <Paperclip size={10} className="inline ml-1 text-slate-400" />
              مرفق الفاتورة
              <span className="text-slate-400 font-normal mr-1">(PDF / صورة)</span>
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
                {attachFile ? <span className="text-slate-700">{attachFile.name}</span> : 'اختر ملفاً...'}
              </button>
              {attachFile && (
                <button
                  type="button"
                  onClick={() => { setAttachFile(null); if (attachInputRef.current) attachInputRef.current.value = ''; }}
                  className="text-red-400 hover:text-red-600 text-xs p-1 shrink-0"
                >✕</button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Section 2: بنود الفاتورة ──────────────────────────────────────── */}
      <div className="card">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">٢</span>
            بنود الفاتورة
            <span className="text-red-400 font-normal">*</span>
          </h2>
          <button
            onClick={addItem}
            className="flex items-center gap-1.5 text-xs btn-ghost text-brand-600 py-1.5"
          >
            <Plus size={13} />
            إضافة بند
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="table-th w-32">SKU</th>
                <th className="table-th">اسم المنتج / الخدمة</th>
                <th className="table-th w-20 text-center">الكمية</th>
                <th className="table-th w-24">الوحدة</th>
                <th className="table-th w-28">السعر</th>
                <th className="table-th w-20 text-center">ض.ق.م</th>
                <th className="table-th w-28">الضريبة</th>
                <th className="table-th w-28">الإجمالي</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((it, rowIdx) => {
                const { vatAmt, total } = computeItemTotals(it);
                const isLast = rowIdx === items.length - 1;
                return (
                  <tr key={it.key} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2">
                      <input
                        data-row-sku
                        className="input w-full text-xs font-mono"
                        value={it.sku}
                        onChange={e => updateItem(it.key, 'sku', e.target.value)}
                        placeholder="Z123456"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-full text-xs min-w-[140px]"
                        value={it.itemDescription}
                        onChange={e => updateItem(it.key, 'itemDescription', e.target.value)}
                        placeholder="اسم المنتج أو الخدمة"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-full text-center"
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={e => updateItem(it.key, 'quantity', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="input w-full text-xs"
                        value={it.uom}
                        onChange={e => updateItem(it.key, 'uom', e.target.value)}
                      >
                        {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-full text-left"
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unitPrice}
                        onChange={e => updateItem(it.key, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                        onKeyDown={e => handlePriceEnter(e, isLast)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="input w-full text-xs"
                        value={it.vatRate}
                        onChange={e => updateItem(it.key, 'vatRate', e.target.value)}
                      >
                        <option value="0.15">15%</option>
                        <option value="0.05">5%</option>
                        <option value="0">0%</option>
                      </select>
                    </td>
                    <td className="px-4 py-2 text-left text-sm text-amber-600 tabular-nums whitespace-nowrap">
                      {fmt(vatAmt)}
                    </td>
                    <td className="px-4 py-2 text-left text-sm font-semibold tabular-nums whitespace-nowrap">
                      {fmt(total)}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => removeItem(it.key)}
                        disabled={items.length === 1}
                        className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-20"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-2 border-t border-slate-50">
          <p className="text-xs text-slate-400">
            اضغط{' '}
            <kbd className="bg-slate-100 border border-slate-200 rounded px-1 py-0.5 text-[10px] font-mono mx-0.5">Enter</kbd>
            {' '}في حقل السعر لإضافة بند جديد تلقائياً
          </p>
        </div>
      </div>

      {/* ── Section 3: الملخص المالي ──────────────────────────────────────── */}
      <div className="card">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">٣</span>
            الملخص المالي
          </h2>
        </div>
        <div className="px-6 py-5 flex justify-end">
          <div className="w-full max-w-sm space-y-3">

            <div className="flex justify-between text-sm">
              <span className="text-slate-500">المجموع الفرعي</span>
              <span className="font-medium tabular-nums">{fmt(totals.sub)} ر.س</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-slate-500">ضريبة القيمة المضافة</span>
              <span className="text-amber-600 tabular-nums">{fmt(totals.vat)} ر.س</span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">خصم</span>
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

            <div className="pt-3 border-t-2 border-slate-200">
              <div className="flex justify-between items-baseline">
                <span className="text-slate-700 font-semibold">الإجمالي النهائي</span>
                <div className="text-left">
                  <span className={`text-2xl font-bold tabular-nums ${discount > 0 ? 'text-brand-600' : 'text-slate-900'}`}>
                    {fmt(finalTotal)}
                  </span>
                  <span className="text-sm text-slate-500 mr-1.5">ر.س</span>
                </div>
              </div>
              {discount > 0 && (
                <p className="text-right text-xs text-green-600 mt-1.5">
                  وُفِّر {fmt(discount)} ر.س بعد الخصم
                </p>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Section 4: الإجراءات ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-6">
        <Link href="/invoices" className="btn-ghost text-sm text-slate-500">
          إلغاء
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={() => saveWithExtras('draft')}
            disabled={saving}
            className="btn-ghost border border-slate-200 text-slate-600 min-w-[120px] text-sm disabled:opacity-50"
          >
            {saving && savingMode === 'draft' ? 'جارٍ الحفظ…' : 'حفظ كمسودة'}
          </button>
          <button
            onClick={() => saveWithExtras('review')}
            disabled={saving}
            className="btn-primary min-w-[170px] text-sm disabled:opacity-50"
          >
            {saving && savingMode === 'review' ? 'جارٍ الإرسال…' : 'حفظ وإرسال للاعتماد'}
          </button>
        </div>
      </div>

    </div>
  );
}
