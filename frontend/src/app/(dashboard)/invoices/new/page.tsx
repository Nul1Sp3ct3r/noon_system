'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertCircle, ArrowRight, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { invoices as api, inventory } from '@/lib/api';
import type { Warehouse } from '@/lib/types';

interface ItemRow {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
}

let rowKey = 0;
function emptyRow(): ItemRow {
  return { key: ++rowKey, description: '', quantity: '1', unitPrice: '' };
}

const EXPENSE_TYPES = [
  { value: 'goods_purchase',        label: 'شراء بضاعة' },
  { value: 'shipping',              label: 'شحن وتوصيل' },
  { value: 'advertising',           label: 'إعلانات' },
  { value: 'operational_services',  label: 'خدمات تشغيلية' },
  { value: 'software_subscriptions',label: 'برامج واشتراكات' },
  { value: 'external_supplier',     label: 'مورد خارجي' },
  { value: 'other',                 label: 'أخرى' },
];

export default function NewPurchasePage() {
  const router = useRouter();

  const [supplierName, setSupplierName]   = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate]     = useState('');
  const [expenseType, setExpenseType]     = useState('');
  const [hasVat, setHasVat]               = useState(false);
  const [notes, setNotes]                 = useState('');
  const [warehouseId, setWarehouseId]     = useState('');
  const [warehouses, setWarehouses]       = useState<Warehouse[]>([]);
  const [items, setItems]                 = useState<ItemRow[]>([emptyRow()]);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [attachFile, setAttachFile]       = useState<File | null>(null);
  const attachInputRef                    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inventory.warehouses().then(setWarehouses).catch(() => {});
  }, []);

  function updateItem(key: number, field: keyof ItemRow, value: string) {
    setItems(rows => rows.map(r => r.key === key ? { ...r, [field]: value } : r));
  }
  function addItem()               { setItems(rows => [...rows, emptyRow()]); }
  function removeItem(key: number) { setItems(rows => rows.filter(r => r.key !== key)); }

  const vatRate = hasVat ? 0.15 : 0;

  function rowTotals(it: ItemRow) {
    const qty   = parseFloat(it.quantity)  || 0;
    const price = parseFloat(it.unitPrice) || 0;
    const sub   = qty * price;
    return { sub, vatAmt: sub * vatRate, total: sub * (1 + vatRate) };
  }

  const totals = items.reduce((a, it) => {
    const t = rowTotals(it);
    return { sub: a.sub + t.sub, vat: a.vat + t.vatAmt, total: a.total + t.total };
  }, { sub: 0, vat: 0, total: 0 });

  const fmt = (n: number) =>
    n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function handlePriceEnter(e: React.KeyboardEvent, isLast: boolean) {
    if (e.key === 'Enter' && isLast) {
      e.preventDefault();
      addItem();
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>('[data-row-desc]');
        inputs[inputs.length - 1]?.focus();
      }, 30);
    }
  }

  async function save() {
    setError('');
    if (!supplierName.trim() && !invoiceNumber.trim()) {
      setError('يجب إدخال اسم المورد أو رقم الفاتورة على الأقل');
      return;
    }
    const validItems = items.filter(it => it.description.trim() && it.quantity && it.unitPrice);
    if (validItems.length === 0) {
      setError('يجب إضافة بند واحد على الأقل بوصف وكمية وسعر');
      return;
    }
    setSaving(true);
    try {
      const dto = {
        supplierName:  supplierName  || undefined,
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate:   invoiceDate   || undefined,
        vatMode:       hasVat ? 'exclusive' : 'exempt',
        expenseType:   expenseType   || undefined,
        notes:         notes         || undefined,
        warehouseId:   warehouseId   ? parseInt(warehouseId, 10) : undefined,
        items: validItems.map(it => ({
          sku:       it.description.trim(),
          quantity:  parseInt(it.quantity, 10),
          unitPrice: parseFloat(it.unitPrice).toFixed(4),
          vatRate:   vatRate.toFixed(4),
        })),
      };
      const created = await api.create(dto);
      if (attachFile) {
        await api.uploadPdf(created.id, attachFile).catch(e =>
          console.warn('[purchase attachment upload]', e),
        );
      }
      router.push(`/invoices/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ عملية الشراء');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/invoices" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowRight size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">إضافة عملية شراء</h1>
          <p className="text-slate-400 text-xs mt-0.5">تسجيل فاتورة مورد جديدة</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Section 1: بيانات المورد */}
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
              onChange={e => setInvoiceDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">نوع المصروف</label>
            <select
              className="input"
              value={expenseType}
              onChange={e => setExpenseType(e.target.value)}
            >
              <option value="">— اختر —</option>
              {EXPENSE_TYPES.map(et => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
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
            <label className="block text-xs font-medium text-slate-500 mb-1">
              ملاحظات <span className="text-slate-400 font-normal">(اختيارية)</span>
            </label>
            <input
              className="input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              <Paperclip size={10} className="inline ml-1 text-slate-400" />
              مرفق الفاتورة <span className="text-slate-400 font-normal">(PDF / صورة)</span>
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

          {/* VAT checkbox */}
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hasVat}
                onChange={e => setHasVat(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-brand-600"
              />
              <span className="text-sm text-slate-700">الفاتورة تشمل ضريبة قيمة مضافة <span className="text-slate-400">(15%)</span></span>
            </label>
          </div>

        </div>
      </div>

      {/* Section 2: بنود الفاتورة */}
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
                <th className="table-th">البيان / المنتج</th>
                <th className="table-th w-24 text-center">الكمية</th>
                <th className="table-th w-32">السعر</th>
                {hasVat && <th className="table-th w-28">الضريبة</th>}
                <th className="table-th w-28">الإجمالي</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((it, rowIdx) => {
                const { vatAmt, total } = rowTotals(it);
                const isLast = rowIdx === items.length - 1;
                return (
                  <tr key={it.key} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2">
                      <input
                        data-row-desc
                        className="input w-full text-sm"
                        value={it.description}
                        onChange={e => updateItem(it.key, 'description', e.target.value)}
                        placeholder="اسم المنتج أو الخدمة أو SKU"
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
                      <input
                        className="input w-full"
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unitPrice}
                        onChange={e => updateItem(it.key, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                        onKeyDown={e => handlePriceEnter(e, isLast)}
                      />
                    </td>
                    {hasVat && (
                      <td className="px-4 py-2 text-sm text-amber-600 tabular-nums whitespace-nowrap">
                        {fmt(vatAmt)}
                      </td>
                    )}
                    <td className="px-4 py-2 text-sm font-semibold tabular-nums whitespace-nowrap">
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

      {/* Section 3: الملخص المالي */}
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
              <span className="text-slate-500">المجموع قبل الضريبة</span>
              <span className="font-medium tabular-nums">{fmt(totals.sub)} ر.س</span>
            </div>
            {hasVat && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">ضريبة القيمة المضافة (15%)</span>
                <span className="text-amber-600 tabular-nums">{fmt(totals.vat)} ر.س</span>
              </div>
            )}
            <div className="pt-3 border-t-2 border-slate-200">
              <div className="flex justify-between items-baseline">
                <span className="text-slate-700 font-semibold">الإجمالي</span>
                <div className="text-left">
                  <span className="text-2xl font-bold tabular-nums text-slate-900">{fmt(totals.total)}</span>
                  <span className="text-sm text-slate-500 mr-1.5">ر.س</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pb-6">
        <Link href="/invoices" className="btn-ghost text-sm text-slate-500">إلغاء</Link>
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary min-w-[160px] text-sm disabled:opacity-50"
        >
          {saving ? 'جارٍ الحفظ…' : 'حفظ عملية الشراء'}
        </button>
      </div>

    </div>
  );
}
