'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  AlertCircle, Plus, X, ArrowRight, TrendingUp, TrendingDown,
  Package, AlertTriangle, Activity, ShoppingCart, ArrowDownCircle,
  ArrowUpCircle, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { inventory as api } from '@/lib/api';
import type { InventoryMovement, Warehouse, InventoryDashboard } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOVEMENT_TYPES = [
  { value: 'purchase',     label: 'شراء',        dir: +1 },
  { value: 'sale',         label: 'بيع',          dir: -1 },
  { value: 'adjustment',   label: 'تسوية',        dir:  0 },
  { value: 'transfer_in',  label: 'نقل وارد',    dir: +1 },
  { value: 'transfer_out', label: 'نقل صادر',    dir: -1 },
  { value: 'noon_return',  label: 'مرتجع نون',   dir: +1 },
  { value: 'noon_sync',    label: 'مزامنة نون',  dir:  0 },
];

const REFERENCE_TYPES = [
  { value: 'purchase_invoice', label: 'فاتورة شراء'      },
  { value: 'noon_import',      label: 'استيراد نون'       },
  { value: 'settlement',       label: 'تسوية'              },
  { value: 'customer_return',  label: 'مرتجع عميل'        },
  { value: 'supplier_return',  label: 'مرتجع مورد'        },
  { value: 'damage',           label: 'تالف'               },
  { value: 'manual_adjust',    label: 'تعديل يدوي'         },
  { value: 'warehouse_xfer',   label: 'تحويل مستودع'       },
  { value: 'stock_count',      label: 'جرد'                },
  { value: 'other',            label: 'أخرى'               },
];

const REASON_CODES = [
  { value: 'purchase',   label: 'شراء'           },
  { value: 'sale',       label: 'بيع'             },
  { value: 'return',     label: 'مرتجع'           },
  { value: 'damage',     label: 'تالف'            },
  { value: 'loss',       label: 'فقدان'           },
  { value: 'count',      label: 'جرد'             },
  { value: 'correction', label: 'تصحيح خطأ'       },
  { value: 'settlement', label: 'تسوية'           },
  { value: 'transfer',   label: 'تحويل'           },
  { value: 'other',      label: 'أخرى'            },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(MOVEMENT_TYPES.map(t => [t.value, t.label]));
const REF_LABEL:  Record<string, string> = Object.fromEntries(REFERENCE_TYPES.map(t => [t.value, t.label]));

const TYPE_BADGE: Record<string, string> = {
  purchase:     'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sale:         'bg-red-50 text-red-600 ring-red-200',
  adjustment:   'bg-orange-50 text-orange-700 ring-orange-200',
  transfer_in:  'bg-violet-50 text-violet-700 ring-violet-200',
  transfer_out: 'bg-violet-50 text-violet-600 ring-violet-200',
  noon_return:  'bg-amber-50 text-amber-700 ring-amber-200',
  noon_sync:    'bg-slate-100 text-slate-500 ring-slate-200',
};

const fmtCur = (v: string | number | null | undefined) => {
  if (v == null || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';
};

const fmtNum = (n: number) => n.toLocaleString('ar-SA');

// ─── Component ────────────────────────────────────────────────────────────────

export default function MovementsPage() {
  // ── Table state ─────────────────────────────────────────────────────────────
  const [items, setItems]           = useState<InventoryMovement[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [dashboard, setDashboard]   = useState<InventoryDashboard | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filterQ, setFilterQ]                 = useState('');
  const [filterType, setFilterType]           = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterRefType, setFilterRefType]     = useState('');
  const [filterFrom, setFilterFrom]           = useState('');
  const [filterTo, setFilterTo]               = useState('');
  const searchRef                             = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [showModal, setShowModal]         = useState(false);
  const [movSku, setMovSku]               = useState('');
  const [movType, setMovType]             = useState('purchase');
  const [movQty, setMovQty]               = useState('1');
  const [movWh, setMovWh]                 = useState('');
  const [movRef, setMovRef]               = useState('');
  const [movRefType, setMovRefType]       = useState('');
  const [movReasonCode, setMovReasonCode] = useState('');
  const [movUnitCost, setMovUnitCost]     = useState('');
  const [movNotes, setMovNotes]           = useState('');
  const [saving, setSaving]               = useState(false);
  const [formError, setFormError]         = useState('');

  // Live stock preview
  const [currentQty, setCurrentQty]       = useState<number | null>(null);
  const [loadingQty, setLoadingQty]        = useState(false);

  // ── Load current stock for modal preview ─────────────────────────────────────
  useEffect(() => {
    if (!movSku.trim() || !showModal) { setCurrentQty(null); return; }
    const t = setTimeout(async () => {
      setLoadingQty(true);
      try {
        const res = await api.movements({ sku: movSku.trim(), limit: 1, page: 1 });
        // qtyAfter of the most recent movement = current stock
        setCurrentQty(res.items.length > 0 ? res.items[0].qtyAfter : 0);
      } catch { setCurrentQty(null); }
      finally { setLoadingQty(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [movSku, showModal]);

  // ── Data loading ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.movements({
        q:             filterQ        || undefined,
        movementType:  filterType     || undefined,
        warehouseId:   filterWarehouse ? parseInt(filterWarehouse, 10) : undefined,
        referenceType: filterRefType  || undefined,
        from:          filterFrom     || undefined,
        to:            filterTo       || undefined,
        page, limit: 100,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل الحركات');
    } finally {
      setLoading(false);
    }
  }, [page, filterQ, filterType, filterWarehouse, filterRefType, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.warehouses().then(setWarehouses).catch(() => {});
    api.dashboard().then(setDashboard).catch(() => {});
  }, []);

  // Debounced search
  function handleSearchChange(val: string) {
    setFilterQ(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); }, 400);
  }

  // ── Create movement ──────────────────────────────────────────────────────────
  async function createMovement() {
    setFormError('');
    if (!movSku.trim())                   { setFormError('يجب إدخال SKU'); return; }
    const qty = parseInt(movQty, 10);
    if (!qty || qty === 0)                { setFormError('الكمية يجب أن تكون رقماً غير صفري'); return; }
    if (movUnitCost && parseFloat(movUnitCost) < 0) { setFormError('تكلفة الوحدة لا يمكن أن تكون سالبة'); return; }

    // Negative stock warning (outgoing movements)
    const movDir = MOVEMENT_TYPES.find(t => t.value === movType)?.dir ?? 0;
    const projectedQty = currentQty !== null ? currentQty + qty * (movDir < 0 ? -1 : 1) : null;
    if (projectedQty !== null && projectedQty < 0 && movDir < 0) {
      const confirm = window.confirm(
        `تحذير: المخزون سيصبح سالباً (${projectedQty})\nهل أنت متأكد من المتابعة؟`
      );
      if (!confirm) return;
    }

    // Large quantity warning
    if (Math.abs(qty) > 1000) {
      const confirm = window.confirm(`كمية كبيرة جداً: ${Math.abs(qty)} وحدة — هل أنت متأكد؟`);
      if (!confirm) return;
    }

    setSaving(true);
    try {
      await api.createMovement({
        sku:              movSku.trim(),
        movementType:     movType,
        quantity:         qty,
        warehouseId:      movWh      ? parseInt(movWh, 10)         : undefined,
        reference:        movRef     || undefined,
        referenceType:    movRefType || undefined,
        reasonCode:       movReasonCode || undefined,
        unitCostOverride: movUnitCost ? parseFloat(movUnitCost)   : undefined,
        notes:            movNotes   || undefined,
      });
      setShowModal(false);
      resetModal();
      load();
      api.dashboard().then(setDashboard).catch(() => {});
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'فشل إنشاء الحركة');
    } finally {
      setSaving(false);
    }
  }

  function resetModal() {
    setMovSku(''); setMovType('purchase'); setMovQty('1');
    setMovWh(''); setMovRef(''); setMovRefType(''); setMovReasonCode('');
    setMovUnitCost(''); setMovNotes(''); setCurrentQty(null);
  }

  function openModal() { setShowModal(true); setFormError(''); resetModal(); }
  function closeModal() { setShowModal(false); setFormError(''); }

  const totalPages = Math.ceil(total / 100);

  // Live stock impact calculation
  const qty        = parseInt(movQty, 10) || 0;
  const movDir     = MOVEMENT_TYPES.find(t => t.value === movType)?.dir ?? 0;
  const qtyDelta   = movDir === 0 ? qty : movDir > 0 ? qty : -qty;
  const projected  = currentQty !== null ? currentQty + qtyDelta : null;
  const isNegative = projected !== null && projected < 0;
  const costEst    = movUnitCost && qty ? (parseFloat(movUnitCost) * Math.abs(qty)).toFixed(2) : null;

  // Dashboard KPIs
  const kpi = dashboard?.kpis;
  const alerts = dashboard?.alerts;

  const KPI_CARDS = kpi ? [
    {
      label:  'قيمة المخزون',
      value:  kpi.totalValue.toLocaleString('ar-SA', { maximumFractionDigits: 0 }) + ' ر.س',
      icon:   Package,
      color:  'text-blue-600',
      bg:     'bg-blue-50',
      sub:    `${fmtNum(kpi.totalSkus)} SKU نشط`,
    },
    {
      label:  'الحركات اليوم',
      value:  fmtNum(kpi.todayMovements),
      icon:   Activity,
      color:  'text-violet-600',
      bg:     'bg-violet-50',
      sub:    'حركة مسجلة',
    },
    {
      label:  'مشتريات الشهر',
      value:  fmtNum(kpi.thisMonthPurchases),
      icon:   ArrowDownCircle,
      color:  'text-emerald-600',
      bg:     'bg-emerald-50',
      sub:    'وحدة واردة',
    },
    {
      label:  'صرف الشهر',
      value:  fmtNum(kpi.thisMonthIssues),
      icon:   ArrowUpCircle,
      color:  'text-red-500',
      bg:     'bg-red-50',
      sub:    'وحدة صادرة',
    },
    {
      label:  'مخزون منخفض',
      value:  fmtNum(kpi.lowStock),
      icon:   AlertTriangle,
      color:  'text-amber-600',
      bg:     'bg-amber-50',
      sub:    'SKU يحتاج تجديد',
      warn:   kpi.lowStock > 0,
    },
    {
      label:  'نفد المخزون',
      value:  fmtNum(kpi.outOfStock),
      icon:   AlertCircle,
      color:  'text-red-600',
      bg:     'bg-red-50',
      sub:    'SKU غير متوفر',
      warn:   kpi.outOfStock > 0,
    },
  ] : [];

  const hasAlerts = alerts && (
    alerts.zeroStockRecentSales.length > 0 ||
    alerts.missingCostInStock.length > 0 ||
    alerts.costExceedsPrice.length > 0
  );

  return (
    <div dir="rtl" className="space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowRight size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">مركز حركات المخزون</h1>
            <p className="text-slate-400 text-xs mt-0.5">{total.toLocaleString('ar-SA')} حركة مسجلة</p>
          </div>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          <Plus size={15} />
          حركة جديدة
        </button>
      </div>

      {/* ── KPI Dashboard ───────────────────────────────────────────────── */}
      {kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {KPI_CARDS.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className={`bg-white border rounded-xl px-4 py-3.5 ${card.warn ? 'border-amber-200' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-500">{card.label}</span>
                  <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <Icon size={14} className={card.color} />
                  </div>
                </div>
                <p className={`text-lg font-bold tabular-nums ${card.warn ? 'text-amber-700' : 'text-slate-900'}`}>
                  {card.value}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Alerts panel ────────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAlerts(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-600" />
              تنبيهات المخزون — تتطلب مراجعة
            </div>
            {showAlerts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showAlerts && alerts && (
            <div className="px-4 pb-4 grid sm:grid-cols-2 gap-4 border-t border-amber-100">
              {alerts.zeroStockRecentSales.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-2 mt-3">نفاد المخزون مع مبيعات حديثة</p>
                  <div className="space-y-1">
                    {alerts.zeroStockRecentSales.map(a => (
                      <div key={a.sku} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-1.5 border border-red-100">
                        <span className="font-mono text-slate-600">{a.sku}</span>
                        <span className="text-red-600 font-semibold">{a.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {alerts.missingCostInStock.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-2 mt-3">تكلفة مفقودة — تؤثر على التقييم</p>
                  <div className="space-y-1">
                    {alerts.missingCostInStock.slice(0, 5).map(a => (
                      <div key={a.sku} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-1.5 border border-amber-100">
                        <span className="font-mono text-slate-600">{a.sku}</span>
                        <span className="text-amber-600">{a.qty} وحدة</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <input
            className="col-span-2 sm:col-span-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="بحث: SKU / مرجع / ملاحظات"
            value={filterQ}
            onChange={e => handleSearchChange(e.target.value)}
          />
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1); }}
          >
            <option value="">كل الأنواع</option>
            {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterWarehouse}
            onChange={e => { setFilterWarehouse(e.target.value); setPage(1); }}
          >
            <option value="">كل المستودعات</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterRefType}
            onChange={e => { setFilterRefType(e.target.value); setPage(1); }}
          >
            <option value="">كل أنواع المرجع</option>
            {REFERENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className="flex gap-2">
            <input
              type="date" title="من"
              className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterFrom}
              onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
            />
            <input
              type="date" title="إلى"
              className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterTo}
              onChange={e => { setFilterTo(e.target.value); setPage(1); }}
            />
          </div>
          {(filterQ || filterType || filterWarehouse || filterRefType || filterFrom || filterTo) && (
            <button
              onClick={() => { setFilterQ(''); setFilterType(''); setFilterWarehouse(''); setFilterRefType(''); setFilterFrom(''); setFilterTo(''); setPage(1); }}
              className="text-xs text-slate-500 hover:text-red-500 border border-slate-200 rounded-lg px-3 py-2 hover:border-red-200 transition-colors"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* ── Movements Table ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  'التاريخ', 'SKU', 'المنتج',
                  'نوع الحركة', 'نوع المرجع', 'السبب',
                  'قبل', 'الفرق', 'بعد',
                  'تكلفة الوحدة', 'أثر القيمة',
                  'المستودع', 'المرجع',
                ].map(h => (
                  <th key={h} className="px-3 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap sticky top-0 bg-slate-50">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={13} className="px-4 py-14 text-center text-slate-400">جارٍ التحميل…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-14 text-center text-slate-400">لا توجد حركات تطابق الفلاتر</td></tr>
              ) : items.map(m => {
                const isPositive = m.quantity > 0;
                const typeBadge  = TYPE_BADGE[m.movementType] ?? 'bg-slate-100 text-slate-500 ring-slate-200';
                return (
                  <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Date */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p className="text-xs text-slate-600">
                        {new Date(m.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(m.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    {/* SKU */}
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">{m.sku}</td>
                    {/* Product */}
                    <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[130px] truncate" title={m.product?.nameEn ?? ''}>
                      {m.product?.nameEn ?? <span className="text-slate-300">—</span>}
                    </td>
                    {/* Movement Type */}
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${typeBadge}`}>
                        {TYPE_LABEL[m.movementType] ?? m.movementType}
                      </span>
                    </td>
                    {/* Reference Type */}
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {m.referenceType ? (
                        <span className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 text-[10px]">
                          {REF_LABEL[m.referenceType] ?? m.referenceType}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Reason */}
                    <td className="px-3 py-2.5 text-xs text-slate-400">
                      {m.reasonCode ? REASON_CODES.find(r => r.value === m.reasonCode)?.label ?? m.reasonCode : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Qty Before */}
                    <td className="px-3 py-2.5 tabular-nums text-xs text-slate-500 text-left">
                      {m.qtyBefore != null ? fmtNum(m.qtyBefore) : '—'}
                    </td>
                    {/* Delta */}
                    <td className={`px-3 py-2.5 font-bold tabular-nums text-sm text-left ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isPositive ? '+' : ''}{fmtNum(m.quantity)}
                    </td>
                    {/* Qty After */}
                    <td className={`px-3 py-2.5 tabular-nums font-semibold text-sm text-left ${(m.qtyAfter ?? 0) < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      {m.qtyAfter != null ? fmtNum(m.qtyAfter) : '—'}
                    </td>
                    {/* Unit Cost */}
                    <td className="px-3 py-2.5 tabular-nums text-xs text-slate-600 text-left">
                      {m.unitCost ? fmtCur(m.unitCost) : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Cost Impact */}
                    <td className={`px-3 py-2.5 tabular-nums text-xs font-medium text-left ${
                      m.costImpact == null ? 'text-slate-300'
                      : m.costImpact > 0 ? 'text-blue-600' : 'text-red-500'
                    }`}>
                      {m.costImpact != null
                        ? (m.costImpact > 0 ? '+' : '') + fmtCur(m.costImpact)
                        : '—'}
                    </td>
                    {/* Warehouse */}
                    <td className="px-3 py-2.5 text-xs text-slate-500">{m.warehouse?.name ?? <span className="text-slate-300">—</span>}</td>
                    {/* Reference */}
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                      {m.reference ?? <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {total > 100 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <button
              className="px-3 py-1.5 border rounded-lg hover:bg-slate-50 disabled:opacity-40 text-xs"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              السابق
            </button>
            <span className="text-xs">صفحة {page} من {totalPages} · {total.toLocaleString('ar-SA')} حركة</span>
            <button
              className="px-3 py-1.5 border rounded-lg hover:bg-slate-50 disabled:opacity-40 text-xs"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
            >
              التالي
            </button>
          </div>
        )}
      </div>

      {/* ── New Movement Modal ───────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 mb-4 sm:mb-0 max-h-[90vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="font-semibold text-slate-800">حركة مخزون جديدة</h2>
                <p className="text-xs text-slate-400 mt-0.5">أدخل تفاصيل الحركة بدقة للحفاظ على دقة الجرد</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  {formError}
                </div>
              )}

              {/* Section 1: بيانات الحركة */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">بيانات الحركة</p>
                <div className="grid grid-cols-2 gap-3">

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      SKU <span className="text-red-500">*</span>
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={movSku}
                      onChange={e => setMovSku(e.target.value)}
                      placeholder="Z123456789"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">نوع الحركة <span className="text-red-500">*</span></label>
                    <select
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={movType}
                      onChange={e => setMovType(e.target.value)}
                    >
                      {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">الكمية <span className="text-red-500">*</span></label>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="number"
                      value={movQty}
                      onChange={e => setMovQty(e.target.value)}
                      min="1"
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

                </div>
              </div>

              {/* Section 2: نوع المرجع + السبب */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">التصنيف المحاسبي</p>
                <div className="grid grid-cols-2 gap-3">

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">نوع المرجع</label>
                    <select
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={movRefType}
                      onChange={e => setMovRefType(e.target.value)}
                    >
                      <option value="">— اختر —</option>
                      {REFERENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">سبب الحركة</label>
                    <select
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={movReasonCode}
                      onChange={e => setMovReasonCode(e.target.value)}
                    >
                      <option value="">— اختر —</option>
                      {REASON_CODES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      تكلفة الوحدة
                      <span className="text-slate-400 font-normal mr-1">(للتقييم)</span>
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="number"
                      min="0"
                      step="0.01"
                      value={movUnitCost}
                      onChange={e => setMovUnitCost(e.target.value)}
                      placeholder="0.00"
                    />
                    {costEst && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        إجمالي التكلفة: {Number(costEst).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س
                      </p>
                    )}
                  </div>

                  <div>
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

              {/* Section 3: الأثر على المخزون (live preview) */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">الأثر على المخزون</p>
                {loadingQty ? (
                  <div className="h-14 flex items-center justify-center text-xs text-slate-400">جاري الفحص…</div>
                ) : currentQty !== null ? (
                  <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${isNegative ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 mb-0.5">قبل</p>
                      <p className="text-lg font-bold text-slate-700 tabular-nums">{fmtNum(currentQty)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 mb-0.5">الحركة</p>
                      <p className={`text-base font-bold tabular-nums ${qtyDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {qtyDelta >= 0 ? '+' : ''}{fmtNum(qtyDelta)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 mb-0.5">بعد</p>
                      <p className={`text-lg font-bold tabular-nums ${isNegative ? 'text-red-600' : 'text-slate-900'}`}>
                        {projected !== null ? fmtNum(projected) : '—'}
                      </p>
                    </div>
                  </div>
                ) : movSku.trim() ? (
                  <div className="h-10 flex items-center justify-center text-xs text-slate-400">اكتب SKU لمعاينة الأثر</div>
                ) : (
                  <div className="h-10 flex items-center justify-center text-xs text-slate-400">ابدأ بإدخال SKU</div>
                )}

                {isNegative && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={13} className="shrink-0" />
                    المخزون غير كافٍ — سيصبح سالباً. يتطلب صلاحية المشرف.
                  </div>
                )}
              </div>

            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={createMovement}
                disabled={saving}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-w-[100px] font-medium"
              >
                {saving ? 'جارٍ…' : 'تسجيل الحركة'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
