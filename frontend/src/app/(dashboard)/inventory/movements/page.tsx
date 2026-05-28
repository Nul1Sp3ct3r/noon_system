'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Plus, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { inventory as api } from '@/lib/api';
import type { InventoryMovement, Warehouse } from '@/lib/types';

const MOVEMENT_TYPES = [
  { value: 'purchase',         label: 'شراء' },
  { value: 'sale',             label: 'بيع' },
  { value: 'adjustment',       label: 'تسوية' },
  { value: 'transfer_in',      label: 'نقل وارد' },
  { value: 'transfer_out',     label: 'نقل صادر' },
  { value: 'noon_return',      label: 'مرتجع نون' },
  { value: 'noon_sync',        label: 'مزامنة نون' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(MOVEMENT_TYPES.map(t => [t.value, t.label]));

const TYPE_CLASS: Record<string, string> = {
  purchase:     'bg-blue-50 text-blue-700 ring-blue-200',
  sale:         'bg-emerald-50 text-emerald-700 ring-emerald-200',
  adjustment:   'bg-orange-50 text-orange-700 ring-orange-200',
  transfer_in:  'bg-violet-50 text-violet-700 ring-violet-200',
  transfer_out: 'bg-violet-50 text-violet-700 ring-violet-200',
  noon_return:  'bg-amber-50 text-amber-700 ring-amber-200',
  noon_sync:    'bg-slate-50 text-slate-600 ring-slate-200',
};

const fmtCur = (v: string | number | null | undefined) => {
  if (v == null || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';
};

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
  const [filterFrom, setFilterFrom]           = useState('');
  const [filterTo, setFilterTo]               = useState('');

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
        sku:          filterSku || undefined,
        movementType: filterType || undefined,
        warehouseId:  filterWarehouse ? parseInt(filterWarehouse, 10) : undefined,
        from:         filterFrom || undefined,
        to:           filterTo || undefined,
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
  }, [page, filterSku, filterType, filterWarehouse, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  async function createMovement() {
    if (!movSku.trim()) { setFormError('يجب إدخال SKU'); return; }
    setSaving(true);
    setFormError('');
    try {
      await api.createMovement({
        sku:          movSku.trim(),
        movementType: movType,
        quantity:     parseInt(movQty, 10),
        warehouseId:  movWh ? parseInt(movWh, 10) : undefined,
        reference:    movRef || undefined,
        notes:        movNotes || undefined,
      });
      setShowModal(false);
      setMovSku(''); setMovType('purchase'); setMovQty('1');
      setMovWh(''); setMovRef(''); setMovNotes('');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'فشل إنشاء الحركة');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / 100);

  const HEADERS = [
    'التاريخ', 'SKU', 'المنتج', 'نوع الحركة',
    'كمية قبل', 'التغيير', 'كمية بعد',
    'تكلفة الوحدة', 'أثر القيمة',
    'المستودع', 'المرجع',
  ];

  return (
    <div dir="rtl">
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
        <button
          onClick={() => { setShowModal(true); setFormError(''); }}
          className="flex items-center gap-1.5 text-sm px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
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
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <input
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="بحث بـ SKU"
            value={filterSku}
            onChange={e => { setFilterSku(e.target.value); setPage(1); }}
          />
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1); }}
          >
            <option value="">كل الأنواع</option>
            {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterWarehouse}
            onChange={e => { setFilterWarehouse(e.target.value); setPage(1); }}
          >
            <option value="">كل المستودعات</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input
            type="date"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterFrom}
            onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
            title="من تاريخ"
          />
          <input
            type="date"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterTo}
            onChange={e => { setFilterTo(e.target.value); setPage(1); }}
            title="إلى تاريخ"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {HEADERS.map(h => (
                <th key={h} className="px-3 py-3 text-right text-xs font-medium text-slate-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-12 text-center text-slate-400">جارٍ التحميل…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-12 text-center text-slate-400">لا توجد حركات</td>
              </tr>
            ) : items.map(m => {
              const isPositive = m.quantity > 0;
              return (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  {/* Date */}
                  <td className="px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleDateString('ar-SA', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                    <div className="text-slate-300">
                      {new Date(m.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  {/* SKU */}
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{m.sku}</td>
                  {/* Product */}
                  <td className="px-3 py-2.5 text-slate-500 max-w-[140px] truncate" title={m.product?.nameEn ?? ''}>
                    {m.product?.nameEn ?? '—'}
                  </td>
                  {/* Movement Type */}
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      TYPE_CLASS[m.movementType] ?? 'bg-slate-50 text-slate-600 ring-slate-200'
                    }`}>
                      {TYPE_LABEL[m.movementType] ?? m.movementType}
                    </span>
                  </td>
                  {/* Qty Before */}
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">
                    {m.qtyBefore != null ? m.qtyBefore.toLocaleString('ar-SA') : '—'}
                  </td>
                  {/* Change */}
                  <td className={`px-3 py-2.5 font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isPositive ? '+' : ''}{m.quantity.toLocaleString('ar-SA')}
                  </td>
                  {/* Qty After */}
                  <td className="px-3 py-2.5 tabular-nums font-medium text-slate-700">
                    {m.qtyAfter != null ? m.qtyAfter.toLocaleString('ar-SA') : '—'}
                  </td>
                  {/* Unit Cost */}
                  <td className="px-3 py-2.5 tabular-nums text-slate-600">
                    {m.unitCost ? fmtCur(m.unitCost) : <span className="text-slate-300">—</span>}
                  </td>
                  {/* Cost Impact */}
                  <td className={`px-3 py-2.5 tabular-nums font-medium ${
                    m.costImpact == null ? 'text-slate-300' :
                    m.costImpact > 0 ? 'text-blue-600' : 'text-red-500'
                  }`}>
                    {m.costImpact != null
                      ? (m.costImpact > 0 ? '+' : '') + fmtCur(m.costImpact)
                      : '—'}
                  </td>
                  {/* Warehouse */}
                  <td className="px-3 py-2.5 text-slate-500">
                    {m.warehouse?.name ?? '—'}
                  </td>
                  {/* Reference */}
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-400">
                    {m.reference ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {total > 100 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <button
              className="px-3 py-1.5 border rounded-lg hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              السابق
            </button>
            <span>صفحة {page} من {totalPages} · {total.toLocaleString('ar-SA')} حركة</span>
            <button
              className="px-3 py-1.5 border rounded-lg hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
            >
              التالي
            </button>
          </div>
        )}
      </div>

      {/* New Movement Modal */}
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
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={movSku}
                    onChange={e => setMovSku(e.target.value)}
                    placeholder="Z123456789"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">نوع الحركة</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={movType}
                    onChange={e => setMovType(e.target.value)}
                  >
                    {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الكمية</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="number"
                    value={movQty}
                    onChange={e => setMovQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المستودع</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={movWh}
                    onChange={e => setMovWh(e.target.value)}
                  >
                    <option value="">— بدون —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المرجع</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={movRef}
                    onChange={e => setMovRef(e.target.value)}
                    placeholder="PO-2026-001"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={movNotes}
                    onChange={e => setMovNotes(e.target.value)}
                    placeholder="اختياري"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={createMovement}
                disabled={saving}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-w-[100px]"
              >
                {saving ? 'جارٍ…' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
