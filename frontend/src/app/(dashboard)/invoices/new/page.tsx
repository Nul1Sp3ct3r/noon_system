'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { invoices as api, inventory } from '@/lib/api';
import type { Warehouse } from '@/lib/types';

interface ItemRow {
  key: number;
  sku: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

let rowKey = 0;

function emptyRow(): ItemRow {
  return { key: ++rowKey, sku: '', quantity: '1', unitPrice: '', vatRate: '0.15' };
}

export default function NewInvoicePage() {
  const router = useRouter();

  const [supplierName, setSupplierName]     = useState('');
  const [invoiceNumber, setInvoiceNumber]   = useState('');
  const [invoiceDate, setInvoiceDate]       = useState('');
  const [vatMode, setVatMode]               = useState<'inclusive' | 'exclusive' | 'exempt'>('exclusive');
  const [notes, setNotes]                   = useState('');
  const [warehouseId, setWarehouseId]       = useState('');
  const [warehouses, setWarehouses]         = useState<Warehouse[]>([]);
  const [items, setItems]                   = useState<ItemRow[]>([emptyRow()]);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState('');

  useEffect(() => {
    inventory.warehouses().then(setWarehouses).catch(() => {});
  }, []);

  function updateItem(key: number, field: keyof ItemRow, value: string) {
    setItems(rows => rows.map(r => r.key === key ? { ...r, [field]: value } : r));
  }

  function addItem() {
    setItems(rows => [...rows, emptyRow()]);
  }

  function removeItem(key: number) {
    setItems(rows => rows.filter(r => r.key !== key));
  }

  function computeItemTotals(item: ItemRow) {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    const vat = parseFloat(item.vatRate) || 0;
    const sub = qty * price;
    const vatAmt = sub * vat;
    return { sub, vatAmt, total: sub + vatAmt };
  }

  const totals = items.reduce((a, it) => {
    const t = computeItemTotals(it);
    return { sub: a.sub + t.sub, vat: a.vat + t.vatAmt, total: a.total + t.total };
  }, { sub: 0, vat: 0, total: 0 });

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
          sku: it.sku.trim(),
          quantity: parseInt(it.quantity, 10),
          unitPrice: parseFloat(it.unitPrice).toFixed(4),
          vatRate: parseFloat(it.vatRate).toFixed(4),
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

  const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/invoices" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowRight size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">فاتورة جديدة</h1>
          <p className="text-slate-500 text-sm mt-0.5">إدخال فاتورة مورد مع بنود البضاعة</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Header */}
      <div className="card p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-4">بيانات الفاتورة</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">اسم المورد</label>
            <input className="input" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="مثال: شركة التوريدات العربية" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">رقم الفاتورة</label>
            <input className="input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="مثال: INV-2026-001" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">تاريخ الفاتورة</label>
            <input className="input" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">معالجة ضريبة القيمة المضافة</label>
            <select className="input" value={vatMode} onChange={e => setVatMode(e.target.value as typeof vatMode)}>
              <option value="exclusive">حصري (الأسعار لا تشمل ض.ق.م)</option>
              <option value="inclusive">شامل (الأسعار تشمل ض.ق.م)</option>
              <option value="exempt">معفى</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">المستودع</label>
            <select className="input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              <option value="">— بدون مستودع —</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية" />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="card mb-4">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">بنود الفاتورة</h2>
          <button onClick={addItem} className="flex items-center gap-1.5 text-sm btn-ghost text-brand-600">
            <Plus size={15} />
            إضافة بند
          </button>
        </div>

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
              {items.map(it => {
                const { sub, vatAmt, total } = computeItemTotals(it);
                return (
                  <tr key={it.key}>
                    <td className="table-td">
                      <input
                        className="input w-32 text-xs font-mono"
                        value={it.sku}
                        onChange={e => updateItem(it.key, 'sku', e.target.value)}
                        placeholder="Z123456789"
                      />
                    </td>
                    <td className="table-td">
                      <input
                        className="input w-20 text-center"
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={e => updateItem(it.key, 'quantity', e.target.value)}
                      />
                    </td>
                    <td className="table-td">
                      <input
                        className="input w-28"
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unitPrice}
                        onChange={e => updateItem(it.key, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="table-td">
                      <select
                        className="input w-24 text-sm"
                        value={it.vatRate}
                        onChange={e => updateItem(it.key, 'vatRate', e.target.value)}
                      >
                        <option value="0.15">15%</option>
                        <option value="0">0%</option>
                        <option value="0.05">5%</option>
                      </select>
                    </td>
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
          <div className="space-y-1.5 text-sm min-w-[220px]">
            <div className="flex justify-between gap-6">
              <span className="text-slate-500">المجموع الفرعي</span>
              <span className="font-medium">{fmt(totals.sub)} ر.س</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-slate-500">ضريبة القيمة المضافة</span>
              <span className="text-amber-600">{fmt(totals.vat)} ر.س</span>
            </div>
            <div className="flex justify-between gap-6 pt-1.5 border-t border-slate-200">
              <span className="font-semibold">الإجمالي</span>
              <span className="font-bold text-slate-900">{fmt(totals.total)} ر.س</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link href="/invoices" className="btn-ghost">إلغاء</Link>
        <button onClick={save} disabled={saving} className="btn-primary min-w-[120px]">
          {saving ? 'جارٍ الحفظ…' : 'حفظ الفاتورة'}
        </button>
      </div>
    </div>
  );
}
