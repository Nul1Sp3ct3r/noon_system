'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Plus, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { inventory as api } from '@/lib/api';
import type { InventoryMovement, Warehouse } from '@/lib/types';

const MOVEMENT_TYPES = [
  { value: 'purchase',    label: 'شراء' },
  { value: 'sale',        label: 'بيع' },
  { value: 'return_in',  label: 'مرتجع وارد' },
  { value: 'return_out', label: 'مرتجع صادر' },
  { value: 'adjustment', label: 'تسوية' },
  { value: 'transfer',   label: 'نقل' },
  { value: 'writeoff',   label: 'إتلاف' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(MOVEMENT_TYPES.map(t => [t.value, t.label]));

export default function MovementsPage() {
  const [items, setItems]           = useState<InventoryMovement[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [filterSku, setFilterSku]             = useState('');
  const [filterType, setFilterType]           = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');

  const [showModal, setShowModal]   = useState(false);
  const [movSku, setMovSku]         = useState('');
  const [movType, setMovType]       = useState('purchase');
  const [movQty, setMovQty]         = useState('1');
  const [movWh, setMovWh]           = useState('');
  const [movRef, setMovRef]         = useState('');
  const [movNotes, setMovNotes]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');

  useEffect(() => {
    api.warehouses().then(setWarehouses).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.movements({
        sku: filterSku || undefined,
        movementType: filterType || undefined,
        warehouseId: filterWarehouse ? parseInt(filterWarehouse, 10) : undefined,
        page,
        limit: 100,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل الحركات');
    } finally {
      setLoading(false);
    }
  }, [page, filterSku, filterType, filterWarehouse]);

  useEffect(() => { load(); }, [load]);

  async function createMovement() {
    if (!movSku.trim()) { setFormError('يجب إدخال SKU'); return; }
    setSaving(true);
    setFormError('');
    try {
      await api.createMovement({
        sku: movSku.trim(),
        movementType: movType,
        quantity: parseInt(movQty, 10),
        warehouseId: movWh ? parseInt(movWh, 10) : undefined,
        reference: movRef || undefined,
        notes: movNotes || undefined,
      });
      setShowModal(false);
      setMovSku(''); setMovType('purchase'); setMovQty('1'); setMovWh(''); setMovRef(''); setMovNotes('');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'فشل إنشاء الحركة');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowRight size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">دفتر الحركات</h1>
            <p className="text-slate-500 text-sm mt-1">{total.toLocaleString('ar-SA')} حركة</p>
          </div>
        </div>
        <button onClick={() => { setShowModal(true); setFormError(''); }} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={15} />
          حركة جديدة
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <input
            className="input flex-1 min-w-[120px] text-sm"
            placeholder="بحث بـ SKU"
            value={filterSku}
            onChange={e => { setFilterSku(e.target.value); setPage(1); }}
          />
          <select className="input w-40 text-sm" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
            <option value="">كل الأنواع</option>
            {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="input w-44 text-sm" value={filterWarehouse} onChange={e => { setFilterWarehouse(e.target.value); setPage(1); }}>
            <option value="">كل المستودعات</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['SKU', 'المنتج', 'نوع الحركة', 'الكمية', 'المستودع', 'المرجع', 'التاريخ'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">لا توجد حركات</td></tr>
            ) : items.map(m => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="table-td font-mono text-xs">{m.sku}</td>
                <td className="table-td text-slate-500">{m.product?.nameEn ?? '—'}</td>
                <td className="table-td">
                  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-slate-50 text-slate-600 ring-slate-200">
                    {TYPE_LABEL[m.movementType] ?? m.movementType}
                  </span>
                </td>
                <td className={`table-td font-semibold ${m.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {m.quantity > 0 ? '+' : ''}{m.quantity}
                </td>
                <td className="table-td">{m.warehouse?.name ?? '—'}</td>
                <td className="table-td font-mono text-xs">{m.reference ?? '—'}</td>
                <td className="table-td text-slate-400 text-xs">
                  {new Date(m.createdAt).toLocaleString('ar-SA')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {total > 100 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <button className="btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</button>
            <span>صفحة {page} من {totalPages}</span>
            <button className="btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>التالي</button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">حركة مخزون جديدة</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">SKU <span className="text-red-500">*</span></label>
                  <input className="input font-mono text-xs" value={movSku} onChange={e => setMovSku(e.target.value)} placeholder="Z123456789" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">نوع الحركة</label>
                  <select className="input" value={movType} onChange={e => setMovType(e.target.value)}>
                    {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الكمية</label>
                  <input className="input" type="number" value={movQty} onChange={e => setMovQty(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المستودع</label>
                  <select className="input" value={movWh} onChange={e => setMovWh(e.target.value)}>
                    <option value="">— بدون —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المرجع</label>
                  <input className="input text-xs" value={movRef} onChange={e => setMovRef(e.target.value)} placeholder="PO-2026-001" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
                  <input className="input" value={movNotes} onChange={e => setMovNotes(e.target.value)} placeholder="اختياري" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost text-sm">إلغاء</button>
              <button onClick={createMovement} disabled={saving} className="btn-primary text-sm min-w-[100px]">
                {saving ? 'جارٍ…' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
