'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, AlertCircle, Eye, Pencil, Trash2, Package,
  TrendingUp, Lightbulb, X, Search, Check, Loader2,
} from 'lucide-react';
import { productFamilies as api, products as productsApi } from '@/lib/api';
import { getUser, canManageFamilies, canDeleteFamily } from '@/lib/auth';
import { translateError, MSG } from '@/lib/errors';
import { useToast } from '@/lib/toast-context';
import type { ProductFamily, FamilySuggestion, Product } from '@/lib/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString('ar-SA');

// ─── Form ─────────────────────────────────────────────────────────────────────

interface FamilyForm {
  name: string;
  description: string;
  baseCost: string;
  costIncludesVat: boolean;
  notes: string;
}

const emptyForm = (): FamilyForm => ({
  name: '', description: '', baseCost: '', costIncludesVat: false, notes: '',
});

// ─── Product Selector ─────────────────────────────────────────────────────────

function ProductSelector({
  selectedIds,
  onToggle,
}: {
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}) {
  const [q, setQ]           = useState('');
  const [items, setItems]   = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productsApi.list({ limit: 200 }).then(r => { setItems(r.items); setLoading(false); });
  }, []);

  const filtered = items.filter(p => {
    if (!q) return true;
    const lq = q.toLowerCase();
    return (
      p.sku.toLowerCase().includes(lq) ||
      (p.nameAr ?? '').toLowerCase().includes(lq) ||
      (p.nameEn ?? '').toLowerCase().includes(lq)
    );
  });

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="p-2 border-b border-slate-100 bg-slate-50">
        <div className="relative">
          <Search size={13} className="absolute top-2 right-2.5 text-slate-400" />
          <input
            className="w-full text-xs pl-2 pr-7 py-1.5 rounded border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="بحث بـ SKU أو الاسم…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        {selectedIds.size > 0 && (
          <p className="text-xs text-brand-600 mt-1.5 font-medium">تم اختيار {selectedIds.size} منتج</p>
        )}
      </div>
      <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
        {loading ? (
          <div className="py-6 text-center text-slate-400 text-xs">جارٍ التحميل…</div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">لا توجد منتجات</div>
        ) : filtered.map(p => {
          const selected = selectedIds.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-slate-50 transition-colors ${selected ? 'bg-brand-50' : ''}`}
            >
              <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-brand-600 border-brand-600' : 'border-slate-300'}`}>
                {selected && <Check size={10} className="text-white" />}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <span className="font-mono text-xs text-slate-500">{p.sku}</span>
                {(p.nameAr || p.nameEn) && (
                  <span className="text-xs text-slate-700 mr-2">{p.nameAr ?? p.nameEn}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProductFamiliesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const user   = getUser();
  const canEdit   = canManageFamilies(user);
  const canDelete = canDeleteFamily(user);

  const [families, setFamilies]     = useState<ProductFamily[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Form modal
  const [showModal, setShowModal]   = useState(false);
  const [editId, setEditId]         = useState<number | null>(null);
  const [form, setForm]             = useState<FamilyForm>(emptyForm());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const [updateCosts, setUpdateCosts] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId]     = useState<number | null>(null);
  const [deleting, setDeleting]     = useState(false);

  // Suggestions
  const [suggestions, setSuggestions] = useState<FamilySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSugg, setLoadingSugg] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.list();
      setFamilies(data);
    } catch (err) {
      setError(translateError(err, MSG.LOAD_FAIL));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setSelectedIds(new Set());
    setFormError('');
    setUpdateCosts(false);
    setShowModal(true);
  }

  function openEdit(f: ProductFamily) {
    setEditId(f.id);
    setForm({
      name:            f.name,
      description:     f.description ?? '',
      baseCost:        f.baseCost ?? '',
      costIncludesVat: f.costIncludesVat,
      notes:           f.notes ?? '',
    });
    setSelectedIds(new Set());
    setFormError('');
    setUpdateCosts(false);
    setShowModal(true);
  }

  function toggleProduct(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save() {
    if (!form.name.trim()) { setFormError('اسم المجموعة مطلوب'); return; }
    setSaving(true);
    setFormError('');
    try {
      const dto: Record<string, unknown> = {
        name:            form.name.trim(),
        description:     form.description || undefined,
        baseCost:        form.baseCost ? parseFloat(form.baseCost) : undefined,
        costIncludesVat: form.costIncludesVat,
        notes:           form.notes || undefined,
      };
      if (editId !== null) {
        if (updateCosts) dto.updateProductCosts = true;
        await api.update(editId, dto);
        if (selectedIds.size > 0) await api.addProducts(editId, [...selectedIds]);
      } else {
        if (selectedIds.size > 0) dto.productIds = [...selectedIds];
        await api.create(dto);
      }
      setShowModal(false);
      toast(MSG.SAVE_OK, 'success');
      load();
    } catch (err) {
      setFormError(translateError(err, MSG.SAVE_FAIL));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.remove(deleteId);
      setDeleteId(null);
      toast('تم حذف المجموعة', 'success');
      load();
    } catch (err) {
      toast(translateError(err, 'فشل الحذف'), 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function loadSuggestions() {
    setLoadingSugg(true);
    try {
      const data = await api.suggestions();
      setSuggestions(data);
      setShowSuggestions(true);
    } catch {
      toast('فشل تحميل الاقتراحات', 'error');
    } finally {
      setLoadingSugg(false);
    }
  }

  async function createFromSuggestion(s: FamilySuggestion) {
    try {
      await api.create({
        name:       s.suggestedName,
        productIds: s.products.map(p => p.id),
      });
      toast(`تم إنشاء مجموعة "${s.suggestedName}"`, 'success');
      load();
      setSuggestions(prev => prev.filter(x => x.suggestedName !== s.suggestedName));
    } catch (err) {
      toast(translateError(err, 'فشل الإنشاء'), 'error');
    }
  }

  const set = (field: keyof FamilyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? (e as React.ChangeEvent<HTMLInputElement>).target.checked : e.target.value }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">مجموعات المنتجات</h1>
          <p className="text-slate-500 text-sm mt-1">{families.length} مجموعة</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={loadSuggestions}
              disabled={loadingSugg}
              className="btn-ghost flex items-center gap-1.5 text-sm border border-slate-200"
            >
              {loadingSugg ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
              اقتراحات التجميع
            </button>
          )}
          {canEdit && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus size={15} />
              مجموعة جديدة
            </button>
          )}
        </div>
      </div>

      {/* Suggestions panel */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-600" />
              <p className="font-semibold text-amber-800 text-sm">منتجات متشابهة — هل تريد إنشاء مجموعات؟</p>
            </div>
            <button onClick={() => setShowSuggestions(false)} className="text-amber-600 hover:text-amber-800">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {suggestions.map(s => (
              <div key={s.suggestedName} className="flex items-start justify-between bg-white rounded-lg border border-amber-100 p-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-slate-800">{s.suggestedName}</span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                      {s.confidence}% تطابق
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.products.map(p => (
                      <span key={p.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                        {p.sku}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => createFromSuggestion(s)}
                  className="btn-primary text-xs flex-shrink-0"
                >
                  إنشاء مجموعة
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {showSuggestions && suggestions.length === 0 && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-slate-500 text-sm">
          لا توجد اقتراحات — جميع المنتجات إما في مجموعات أو لا توجد منتجات متشابهة
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {['اسم المجموعة', 'المنتجات', 'المبيعات', 'الإيرادات', 'الرسوم', 'الربح', 'المخزون', 'التكلفة الموحدة', 'الإجراءات'].map(h => (
                <th key={h} className="table-th whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : families.length === 0 ? (
              <tr>
                <td colSpan={9} className="table-td text-center py-16 text-slate-400">
                  <Package size={36} className="mx-auto mb-2 opacity-30" />
                  <p>لا توجد مجموعات بعد</p>
                  {canEdit && (
                    <button onClick={openCreate} className="mt-3 btn-primary text-sm inline-flex items-center gap-1.5">
                      <Plus size={14} />
                      إنشاء أول مجموعة
                    </button>
                  )}
                </td>
              </tr>
            ) : families.map(f => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="table-td">
                  <div>
                    <p className="font-medium text-slate-800">{f.name}</p>
                    {f.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{f.description}</p>}
                  </div>
                </td>
                <td className="table-td text-center">{fmtInt(f.productCount)}</td>
                <td className="table-td text-center">{fmtInt(f.units)}</td>
                <td className="table-td font-mono text-green-700">{fmt(f.revenue)} ر.س</td>
                <td className="table-td font-mono text-red-600">{fmt(f.fees)} ر.س</td>
                <td className={`table-td font-mono font-semibold ${f.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmt(f.profit)} ر.س
                </td>
                <td className="table-td text-center">{fmtInt(f.inventory)}</td>
                <td className="table-td">
                  {f.baseCost ? (
                    <span className="font-mono text-slate-700">
                      {parseFloat(f.baseCost).toFixed(2)} ر.س
                      {f.costIncludesVat && <span className="text-[10px] text-slate-400 mr-1">(شامل ض.ق.م)</span>}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="table-td">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => router.push(`/product-families/${f.id}`)}
                      className="p-1.5 rounded hover:bg-brand-50 text-brand-600"
                      title="عرض"
                    >
                      <Eye size={14} />
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => openEdit(f)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                        title="تعديل"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteId(f.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="font-semibold text-slate-800">
                {editId !== null ? 'تعديل المجموعة' : 'مجموعة جديدة'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">اسم المجموعة <span className="text-red-500">*</span></label>
                  <input className="input" value={form.name} onChange={set('name')} placeholder="مثال: صابون 450 جم" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">الوصف</label>
                  <input className="input" value={form.description} onChange={set('description')} placeholder="وصف اختياري للمجموعة" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">التكلفة الموحدة (ر.س)</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.baseCost} onChange={set('baseCost')} placeholder="0.00" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.costIncludesVat}
                      onChange={set('costIncludesVat')}
                      className="w-4 h-4 rounded accent-brand-600"
                    />
                    <span className="text-sm text-slate-600">التكلفة تشمل ض.ق.م</span>
                  </label>
                </div>
                {editId !== null && form.baseCost && (
                  <div className="col-span-2 flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <input
                      type="checkbox"
                      id="updateCosts"
                      checked={updateCosts}
                      onChange={e => setUpdateCosts(e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-600"
                    />
                    <label htmlFor="updateCosts" className="text-sm text-amber-800">
                      تحديث تكلفة جميع المنتجات التابعة لهذه المجموعة
                    </label>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
                  <input className="input text-xs" value={form.notes} onChange={set('notes')} placeholder="ملاحظات اختيارية" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">
                  {editId !== null ? 'إضافة منتجات إلى المجموعة' : 'اختر المنتجات'}
                </label>
                <ProductSelector selectedIds={selectedIds} onToggle={toggleProduct} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowModal(false)} className="btn-ghost text-sm">إلغاء</button>
              <button onClick={save} disabled={saving} className="btn-primary text-sm min-w-[100px]">
                {saving ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">حذف المجموعة</p>
                <p className="text-sm text-slate-500 mt-0.5">سيتم إزالة جميع المنتجات من المجموعة دون حذفها</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="btn-ghost text-sm">إلغاء</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'جارٍ الحذف…' : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
