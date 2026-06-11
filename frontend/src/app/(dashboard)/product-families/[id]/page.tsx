'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowRight, AlertCircle, Package, TrendingUp, DollarSign,
  ShoppingCart, Warehouse, X, Search, Check, Pencil, Trash2,
} from 'lucide-react';
import { productFamilies as api, products as productsApi } from '@/lib/api';
import { getUser, canManageFamilies, canDeleteFamily } from '@/lib/auth';
import { translateError, MSG } from '@/lib/errors';
import { useToast } from '@/lib/toast-context';
import type { ProductFamilyDetail, Product } from '@/lib/types';

const fmt    = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString('ar-SA');

// ─── Product remove confirm ───────────────────────────────────────────────────

function RemoveProductModal({
  sku,
  onConfirm,
  onCancel,
  loading,
}: { sku: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <p className="font-semibold text-slate-800 mb-1">إزالة المنتج من المجموعة</p>
        <p className="text-sm text-slate-500 mb-4">
          هل تريد إزالة <span className="font-mono font-medium">{sku}</span> من هذه المجموعة؟
          لن يتم حذف المنتج.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost text-sm">إلغاء</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'جارٍ الإزالة…' : 'إزالة'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add products modal ───────────────────────────────────────────────────────

function AddProductsModal({
  existingProductIds,
  onAdd,
  onClose,
}: {
  existingProductIds: Set<number>;
  onAdd: (ids: number[]) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ]             = useState('');
  const [items, setItems]     = useState<Product[]>([]);
  const [loadingP, setLoadingP] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    productsApi.list({ limit: 200 }).then(r => { setItems(r.items); setLoadingP(false); });
  }, []);

  const filtered = items.filter(p => {
    if (existingProductIds.has(p.id)) return false;
    if (!q) return true;
    const lq = q.toLowerCase();
    return p.sku.toLowerCase().includes(lq) || (p.nameAr ?? '').toLowerCase().includes(lq) || (p.nameEn ?? '').toLowerCase().includes(lq);
  });

  function toggleProduct(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    try { await onAdd([...selected]); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-semibold text-slate-800">إضافة منتجات</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="p-4 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute top-2 right-2.5 text-slate-400" />
            <input
              className="w-full text-sm pr-8 pl-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="بحث بـ SKU أو الاسم…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
          {loadingP ? (
            <div className="py-10 text-center text-slate-400 text-sm">جارٍ التحميل…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">لا توجد منتجات متاحة</div>
          ) : filtered.map(p => {
            const sel = selected.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProduct(p.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-right ${sel ? 'bg-brand-50' : ''}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${sel ? 'bg-brand-600 border-brand-600' : 'border-slate-300'}`}>
                  {sel && <Check size={10} className="text-white" />}
                </div>
                <span className="font-mono text-xs text-slate-500">{p.sku}</span>
                <span className="text-sm text-slate-700 flex-1 truncate">{p.nameAr ?? p.nameEn ?? ''}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 shrink-0">
          {selected.size > 0
            ? <span className="text-sm text-brand-600 font-medium">تم اختيار {selected.size} منتج</span>
            : <span />
          }
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">إلغاء</button>
            <button onClick={handleAdd} disabled={saving || selected.size === 0} className="btn-primary text-sm">
              {saving ? 'جارٍ الإضافة…' : 'إضافة'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FamilyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const user      = getUser();
  const canEdit   = canManageFamilies(user);
  const canDelete = canDeleteFamily(user);

  const id = parseInt(params.id as string, 10);

  const [family, setFamily]   = useState<ProductFamilyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [showAdd, setShowAdd]       = useState(false);
  const [removeProdId, setRemoveProdId] = useState<{ id: number; sku: string } | null>(null);
  const [removing, setRemoving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(id);
      setFamily(data);
    } catch (err) {
      setError(translateError(err, MSG.LOAD_FAIL));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAddProducts(ids: number[]) {
    await api.addProducts(id, ids);
    setShowAdd(false);
    toast('تم إضافة المنتجات', 'success');
    load();
  }

  async function handleRemoveProduct() {
    if (!removeProdId) return;
    setRemoving(true);
    try {
      await api.removeProduct(id, removeProdId.id);
      setRemoveProdId(null);
      toast('تم إزالة المنتج من المجموعة', 'success');
      load();
    } catch (err) {
      toast(translateError(err, 'فشل الإزالة'), 'error');
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-slate-400">جارٍ التحميل…</div>;
  }

  if (error || !family) {
    return (
      <div className="py-10 text-center">
        <AlertCircle size={24} className="mx-auto mb-2 text-red-400" />
        <p className="text-red-600">{error || 'لم يتم العثور على المجموعة'}</p>
        <button onClick={() => router.back()} className="mt-3 btn-ghost text-sm">
          العودة
        </button>
      </div>
    );
  }

  const existingProductIds = new Set(family.items.map(i => i.productId));

  return (
    <div>
      {/* Breadcrumb */}
      <button
        onClick={() => router.push('/product-families')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 transition-colors"
      >
        <ArrowRight size={14} />
        مجموعات المنتجات
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{family.name}</h1>
          {family.description && <p className="text-slate-500 text-sm mt-1">{family.description}</p>}
          {family.notes && <p className="text-slate-400 text-xs mt-1 italic">{family.notes}</p>}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setShowAdd(true)}
              className="btn-ghost flex items-center gap-1.5 text-sm border border-slate-200"
            >
              <Package size={14} />
              إدارة المنتجات
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => router.push('/product-families')}
              className="btn-ghost flex items-center gap-1.5 text-sm border border-slate-200"
            >
              <Pencil size={14} />
              تعديل
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'الإيرادات', value: `${fmt(family.revenue)} ر.س`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'الرسوم', value: `${fmt(family.fees)} ر.س`, icon: DollarSign, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'التكلفة', value: `${fmt(family.cogs)} ر.س`, icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'الربح', value: `${fmt(family.profit)} ر.س`, icon: TrendingUp, color: family.profit >= 0 ? 'text-brand-600' : 'text-red-600', bg: 'bg-brand-50' },
          { label: 'الطلبات', value: fmtInt(family.units), icon: ShoppingCart, color: 'text-slate-600', bg: 'bg-slate-50' },
          { label: 'المخزون', value: fmtInt(family.inventory), icon: Warehouse, color: 'text-slate-600', bg: 'bg-slate-50' },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-4">
              <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
                <Icon size={16} className={card.color} />
              </div>
              <p className="text-xs text-slate-500 mb-0.5">{card.label}</p>
              <p className={`font-bold text-sm ${card.color}`}>{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Family cost banner */}
      {family.baseCost && (
        <div className="mb-4 flex items-center gap-2 text-sm bg-brand-50 border border-brand-100 rounded-lg px-4 py-2.5">
          <DollarSign size={15} className="text-brand-600 shrink-0" />
          <span className="text-brand-800">
            التكلفة الموحدة للمجموعة:{' '}
            <strong>{parseFloat(family.baseCost).toFixed(2)} ر.س</strong>
            {family.costIncludesVat && <span className="text-brand-500 text-xs mr-1">(شامل ض.ق.م)</span>}
          </span>
        </div>
      )}

      {/* SKU breakdown table */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 text-sm">تفاصيل المنتجات ({family.productCount})</h2>
          {canEdit && (
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              + إضافة منتجات
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['SKU', 'الاسم', 'الماركة', 'التكلفة', 'المبيعات', 'الإيرادات', 'الرسوم', 'التكلفة الإجمالية', 'الربح', 'المخزون', ''].map(h => (
                  <th key={h} className="table-th whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {family.items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="table-td text-center py-8 text-slate-400">
                    لا توجد منتجات في هذه المجموعة
                  </td>
                </tr>
              ) : family.items.map(item => (
                <tr key={item.productId} className="hover:bg-slate-50">
                  <td className="table-td font-mono text-xs">{item.sku}</td>
                  <td className="table-td">{item.nameAr ?? item.nameEn ?? '—'}</td>
                  <td className="table-td text-slate-400">{item.brand ?? '—'}</td>
                  <td className="table-td font-mono text-xs">
                    {item.unitCost ? `${parseFloat(item.unitCost).toFixed(2)} ر.س` : '—'}
                  </td>
                  <td className="table-td text-center">{fmtInt(item.units)}</td>
                  <td className="table-td font-mono text-green-700">{fmt(item.revenue)}</td>
                  <td className="table-td font-mono text-red-600">{fmt(item.fees)}</td>
                  <td className="table-td font-mono text-amber-700">{fmt(item.cogs)}</td>
                  <td className={`table-td font-mono font-semibold ${item.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {fmt(item.profit)}
                  </td>
                  <td className="table-td text-center">{fmtInt(item.stock)}</td>
                  <td className="table-td">
                    {canEdit && (
                      <button
                        onClick={() => setRemoveProdId({ id: item.productId, sku: item.sku })}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                        title="إزالة من المجموعة"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showAdd && (
        <AddProductsModal
          existingProductIds={existingProductIds}
          onAdd={handleAddProducts}
          onClose={() => setShowAdd(false)}
        />
      )}

      {removeProdId && (
        <RemoveProductModal
          sku={removeProdId.sku}
          onConfirm={handleRemoveProduct}
          onCancel={() => setRemoveProdId(null)}
          loading={removing}
        />
      )}
    </div>
  );
}
