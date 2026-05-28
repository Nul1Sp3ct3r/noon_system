'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  AlertCircle, BookOpen, Download, RefreshCw,
  TrendingDown, Package, AlertTriangle, Clock,
  DollarSign, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { inventory as api, downloadInventoryExport } from '@/lib/api';
import type { InventoryStockDetail, InventoryDashboard, Warehouse, StockStatus } from '@/lib/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock:     'متوفر',
  low_stock:    'مخزون منخفض',
  out_of_stock: 'نفاد المخزون',
};

const STATUS_CLASS: Record<StockStatus, string> = {
  in_stock:     'bg-emerald-50 text-emerald-700 ring-emerald-200',
  low_stock:    'bg-amber-50 text-amber-700 ring-amber-200',
  out_of_stock: 'bg-red-50 text-red-700 ring-red-200',
};

const fmt  = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : n.toLocaleString('ar-SA', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtCur = (n: number | null | undefined) => n == null ? '—' : `${fmt(n)} ر.س`;
const fmtPct = (n: number | null | undefined) => n == null ? '—' : `${fmt(n, 1)}%`;
const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 bg-white flex items-start gap-3 ${color}`}>
      <div className="p-2 rounded-lg bg-white/60">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-current/70 truncate">{title}</p>
        <p className="text-xl font-bold text-current mt-0.5">{value}</p>
        {sub && <p className="text-xs text-current/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────

function AlertBanner({ title, items, color, onClose }: {
  title: string; items: { sku: string; nameEn: string | null }[];
  color: string; onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className={`rounded-lg border p-3 text-sm ${color}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle size={15} className="shrink-0" />
          {title} ({items.length})
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(v => !v)} className="p-1 hover:bg-black/5 rounded">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded">
            <X size={14} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.slice(0, 20).map(i => (
            <span key={i.sku} className="inline-flex items-center gap-1 rounded bg-black/5 px-2 py-0.5 text-xs font-mono">
              {i.sku}{i.nameEn ? ` · ${i.nameEn}` : ''}
            </span>
          ))}
          {items.length > 20 && <span className="text-xs opacity-70">+{items.length - 20} أخرى</span>}
        </div>
      )}
    </div>
  );
}

// ─── Adjustment Modal ─────────────────────────────────────────────────────────

function AdjustModal({ row, onClose, onSaved }: {
  row: InventoryStockDetail; onClose: () => void; onSaved: () => void;
}) {
  const [newQty, setNewQty] = useState(String(row.qty));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const diff = parseInt(newQty || '0', 10) - row.qty;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const nq = parseInt(newQty, 10);
    if (isNaN(nq))          { setErr('أدخل رقماً صحيحاً'); return; }
    if (!reason.trim())     { setErr('السبب مطلوب'); return; }
    setSaving(true);
    try {
      await api.adjustStock({
        sku: row.sku,
        warehouseId: row.warehouse?.id,
        newQty: nq,
        reason: reason.trim(),
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">تسوية المخزون</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">SKU</span>
              <span className="font-mono font-medium">{row.sku}</span>
            </div>
            {row.warehouse && (
              <div className="flex justify-between">
                <span className="text-slate-500">المستودع</span>
                <span>{row.warehouse.name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">الكمية الحالية في النظام</span>
              <span className="font-bold">{row.qty}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">الكمية الفعلية <span className="text-red-500">*</span></label>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
              required
            />
          </div>

          {newQty !== '' && !isNaN(parseInt(newQty)) && (
            <div className={`rounded-lg p-3 text-sm font-medium text-center ${
              diff === 0 ? 'bg-slate-50 text-slate-500' :
              diff > 0   ? 'bg-emerald-50 text-emerald-700' :
                           'bg-red-50 text-red-700'
            }`}>
              {diff === 0 ? 'لا يوجد فرق' : diff > 0 ? `إضافة +${diff}` : `خصم ${diff}`}
              {row.unitCost && diff !== 0
                ? ` · أثر القيمة: ${fmtCur(Math.abs(diff) * parseFloat(row.unitCost))}`
                : ''}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">سبب التسوية <span className="text-red-500">*</span></label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="جرد دوري، تلف، خطأ نظام..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
            />
          </div>

          {err && <p className="text-red-600 text-xs">{err}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">إلغاء</button>
            <button
              type="submit"
              disabled={saving || diff === 0}
              className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ التسوية'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [dashboard, setDashboard] = useState<InventoryDashboard | null>(null);
  const [items, setItems]         = useState<InventoryStockDetail[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [adjustRow, setAdjustRow] = useState<InventoryStockDetail | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [q, setQ]                       = useState('');
  const [warehouseId, setWarehouseId]   = useState('');
  const [stockStatus, setStockStatus]   = useState('');
  const [missingCost, setMissingCost]   = useState(false);
  const [staleStock, setStaleStock]     = useState(false);
  const [negativeMargin, setNegMargin]  = useState(false);

  // Dismissed alerts
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const loadDashboard = useCallback(async () => {
    try {
      const d = await api.dashboard();
      setDashboard(d);
    } catch { /* non-critical */ }
  }, []);

  const loadStock = useCallback(async (resetPage = false) => {
    const p = resetPage ? 1 : page;
    if (resetPage) setPage(1);
    setLoading(true);
    setError('');
    try {
      const res = await api.stockEnriched({
        q: q || undefined,
        warehouseId: warehouseId ? parseInt(warehouseId) : undefined,
        stockStatus: stockStatus || undefined,
        missingCost:    missingCost    || undefined,
        staleStock:     staleStock     || undefined,
        negativeMargin: negativeMargin || undefined,
        page: p,
        limit: 50,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [q, warehouseId, stockStatus, missingCost, staleStock, negativeMargin, page]);

  useEffect(() => {
    api.warehouses().then(setWarehouses).catch(() => {});
    loadDashboard();
  }, [loadDashboard]);

  // Debounce q, instant for selects/toggles
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadStock(true), 300);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  useEffect(() => { loadStock(true); }, [warehouseId, stockStatus, missingCost, staleStock, negativeMargin]);
  useEffect(() => { if (!loading) loadStock(); }, [page]);

  async function handleExport() {
    setExporting(true);
    try { await downloadInventoryExport(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'فشل التصدير'); }
    finally { setExporting(false); }
  }

  const totalPages = Math.ceil(total / 50);
  const kpis = dashboard?.kpis;
  const alerts = dashboard?.alerts;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">مركز تحكم المخزون</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total.toLocaleString('ar-SA')} صنف · إجمالي القيمة {fmtCur(kpis?.totalValue)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <Download size={15} />
            {exporting ? 'جارٍ...' : 'تصدير Excel'}
          </button>
          <Link
            href="/inventory/movements"
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <BookOpen size={15} />
            دفتر الحركات
          </Link>
          <button
            onClick={() => { loadDashboard(); loadStock(); }}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50"
            title="تحديث"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            title="إجمالي قيمة المخزون"
            value={fmtCur(kpis.totalValue)}
            icon={DollarSign}
            color="border-blue-200 text-blue-700"
          />
          <KpiCard
            title="إجمالي الأصناف"
            value={kpis.totalSkus.toLocaleString('ar-SA')}
            icon={Package}
            color="border-slate-200 text-slate-700"
          />
          <KpiCard
            title="نفاد المخزون"
            value={kpis.outOfStock}
            sub="صنف"
            icon={AlertCircle}
            color={kpis.outOfStock > 0 ? 'border-red-200 text-red-700' : 'border-slate-200 text-slate-500'}
          />
          <KpiCard
            title="مخزون منخفض"
            value={kpis.lowStock}
            sub="صنف"
            icon={TrendingDown}
            color={kpis.lowStock > 0 ? 'border-amber-200 text-amber-700' : 'border-slate-200 text-slate-500'}
          />
          <KpiCard
            title="بدون تكلفة"
            value={kpis.missingCost}
            sub="صنف"
            icon={AlertTriangle}
            color={kpis.missingCost > 0 ? 'border-orange-200 text-orange-700' : 'border-slate-200 text-slate-500'}
          />
          <KpiCard
            title="مخزون راكد ≥60 يوم"
            value={kpis.staleInventory}
            sub="صنف"
            icon={Clock}
            color={kpis.staleInventory > 0 ? 'border-purple-200 text-purple-700' : 'border-slate-200 text-slate-500'}
          />
        </div>
      )}

      {/* Alerts */}
      {alerts && (
        <div className="space-y-2">
          {!dismissed.has('zeroSales') && alerts.zeroStockRecentSales.length > 0 && (
            <AlertBanner
              title="نفد المخزون مع وجود مبيعات في آخر 30 يوم"
              items={alerts.zeroStockRecentSales}
              color="border border-red-200 bg-red-50 text-red-800"
              onClose={() => setDismissed(s => new Set([...s, 'zeroSales']))}
            />
          )}
          {!dismissed.has('costPrice') && alerts.costExceedsPrice.length > 0 && (
            <AlertBanner
              title="التكلفة أعلى من سعر البيع (خسارة محققة)"
              items={alerts.costExceedsPrice}
              color="border border-red-200 bg-red-50 text-red-800"
              onClose={() => setDismissed(s => new Set([...s, 'costPrice']))}
            />
          )}
          {!dismissed.has('missingCost') && alerts.missingCostInStock.length > 0 && (
            <AlertBanner
              title="أصناف في المخزون بدون تكلفة محددة"
              items={alerts.missingCostInStock}
              color="border border-orange-200 bg-orange-50 text-orange-800"
              onClose={() => setDismissed(s => new Set([...s, 'missingCost']))}
            />
          )}
          {!dismissed.has('stale') && alerts.noMovement60Days.length > 0 && (
            <AlertBanner
              title="لا توجد حركة منذ 60 يوماً أو أكثر"
              items={alerts.noMovement60Days}
              color="border border-purple-200 bg-purple-50 text-purple-800"
              onClose={() => setDismissed(s => new Set([...s, 'stale']))}
            />
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap gap-3">
          <input
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="بحث بـ SKU، الاسم، الماركة"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
          >
            <option value="">كل المستودعات</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={stockStatus}
            onChange={e => setStockStatus(e.target.value)}
          >
            <option value="">كل الحالات</option>
            <option value="in_stock">متوفر</option>
            <option value="low_stock">مخزون منخفض</option>
            <option value="out_of_stock">نفاد المخزون</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={missingCost} onChange={e => setMissingCost(e.target.checked)} className="rounded" />
            بدون تكلفة
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={staleStock} onChange={e => setStaleStock(e.target.checked)} className="rounded" />
            راكد ≥60 يوم
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={negativeMargin} onChange={e => setNegMargin(e.target.checked)} className="rounded" />
            {'تكلفة > سعر بيع'}
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {[
                'SKU', 'الاسم', 'الماركة', 'المستودع',
                'الكمية', 'تكلفة الوحدة', 'آخر تكلفة شراء', 'سعر البيع',
                'هامش الربح', 'القيمة الإجمالية', 'آخر حركة', 'الحالة', '',
              ].map(h => (
                <th key={h} className="px-3 py-3 text-right text-xs font-medium text-slate-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-400">جارٍ التحميل…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-400">لا توجد نتائج</td></tr>
            ) : items.map(row => (
              <tr
                key={`${row.sku}-${row.warehouse?.id ?? 'null'}`}
                className={`hover:bg-slate-50 transition-colors ${
                  row.costExceedsPrice ? 'bg-red-50/30' :
                  !row.hasCost && row.qty > 0 ? 'bg-orange-50/30' :
                  row.isStale && row.qty > 0 ? 'bg-purple-50/20' : ''
                }`}
              >
                <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{row.sku}</td>
                <td className="px-3 py-2.5 text-slate-700 max-w-[160px] truncate" title={row.nameEn ?? ''}>
                  {row.nameEn ?? row.nameAr ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-slate-500">{row.brand ?? '—'}</td>
                <td className="px-3 py-2.5 text-slate-500">{row.warehouse?.name ?? '—'}</td>
                <td className={`px-3 py-2.5 font-semibold tabular-nums ${
                  row.qty <= 0 ? 'text-red-600' :
                  row.qty <= 5 ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  {row.qty.toLocaleString('ar-SA')}
                </td>
                <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                  {row.unitCost ? `${parseFloat(row.unitCost).toFixed(2)} ر.س` : <span className="text-orange-500 text-xs">بدون تكلفة</span>}
                </td>
                <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                  {row.lastPurchaseCost ? `${parseFloat(row.lastPurchaseCost).toFixed(2)} ر.س` : '—'}
                </td>
                <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                  {row.sellingPrice ? `${parseFloat(row.sellingPrice).toFixed(2)} ر.س` : '—'}
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {row.expectedMarginPct == null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className={`font-medium ${
                      row.expectedMarginPct < 0 ? 'text-red-600' :
                      row.expectedMarginPct < 10 ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {fmtPct(row.expectedMarginPct)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-medium tabular-nums text-slate-700">
                  {fmtCur(row.totalValue)}
                </td>
                <td className="px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                  {fmtDate(row.lastMovementDate)}
                  {row.isStale && row.qty > 0 && (
                    <span className="mr-1 text-purple-500" title="راكد منذ 60+ يوم">⏸</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_CLASS[row.stockStatus]}`}>
                    {STATUS_LABEL[row.stockStatus]}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => setAdjustRow(row)}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
                  >
                    تسوية
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <button
              className="px-3 py-1.5 border rounded-lg hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              السابق
            </button>
            <span>صفحة {page} من {totalPages} · إجمالي {total.toLocaleString('ar-SA')} صنف</span>
            <button
              className="px-3 py-1.5 border rounded-lg hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages || loading}
            >
              التالي
            </button>
          </div>
        )}
      </div>

      {/* Adjustment Modal */}
      {adjustRow && (
        <AdjustModal
          row={adjustRow}
          onClose={() => setAdjustRow(null)}
          onSaved={() => { loadDashboard(); loadStock(); }}
        />
      )}
    </div>
  );
}
