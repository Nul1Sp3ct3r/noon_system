'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, AlertCircle, Plus, X, Download, Lock, Folders, Link, Unlink } from 'lucide-react';
import { products as api, productFamilies as familiesApi, downloadExport } from '@/lib/api';
import { getUser, canEditCosts, canManageFamilies } from '@/lib/auth';
import { translateError, MSG } from '@/lib/errors';
import { useToast } from '@/lib/toast-context';
import type { Product, ProductFamily } from '@/lib/types';

interface ProductForm {
  sku: string;
  partnerSku: string;
  nameAr: string;
  nameEn: string;
  brand: string;
  family: string;
  unitCost: string;
  extraCosts: string;
  costIncludesVat: boolean;
  notes: string;
}

const emptyForm = (): ProductForm => ({
  sku: '', partnerSku: '', nameAr: '', nameEn: '',
  brand: '', family: '', unitCost: '', extraCosts: '', costIncludesVat: false, notes: '',
});

export default function ProductsPage() {
  const router    = useRouter();
  const { toast } = useToast();
  const user = getUser();
  const canCost        = canEditCosts(user);
  const canFamilies    = canManageFamilies(user);

  const [items, setItems]     = useState<Product[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [inputQ, setInputQ]   = useState('');
  const [q, setQ]             = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [showModal, setShowModal]   = useState(false);
  const [editId, setEditId]         = useState<number | null>(null);
  const [form, setForm]             = useState<ProductForm>(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');

  // Family section state
  const [productFamily, setProductFamily] = useState<{ familyId: number; familyName: string } | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [allFamilies, setAllFamilies]     = useState<ProductFamily[]>([]);
  const [showFamilySelector, setShowFamilySelector] = useState(false);
  const [linkingFamily, setLinkingFamily] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setQ(inputQ); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [inputQ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.list({ q, page, limit: 50 });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(translateError(err, MSG.LOAD_FAIL));
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  async function loadProductFamily(productId: number) {
    setFamilyLoading(true);
    setProductFamily(null);
    try {
      const data = await familiesApi.byProduct(productId);
      setProductFamily(data);
    } catch {
      /* ignore */
    } finally {
      setFamilyLoading(false);
    }
  }

  async function loadAllFamilies() {
    try {
      const data = await familiesApi.list();
      setAllFamilies(data);
    } catch { /* ignore */ }
  }

  async function linkToFamily(familyId: number) {
    if (!editId) return;
    setLinkingFamily(true);
    try {
      await familiesApi.addProducts(familyId, [editId]);
      toast('تم ربط المنتج بالمجموعة', 'success');
      loadProductFamily(editId);
      setShowFamilySelector(false);
    } catch (err) {
      toast(translateError(err, 'فشل الربط'), 'error');
    } finally {
      setLinkingFamily(false);
    }
  }

  async function unlinkFromFamily() {
    if (!editId || !productFamily) return;
    setLinkingFamily(true);
    try {
      await familiesApi.removeProduct(productFamily.familyId, editId);
      toast('تم إزالة المنتج من المجموعة', 'success');
      setProductFamily(null);
    } catch (err) {
      toast(translateError(err, 'فشل الإزالة'), 'error');
    } finally {
      setLinkingFamily(false);
    }
  }

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setFormError('');
    setProductFamily(null);
    setShowFamilySelector(false);
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setEditId(p.id);
    setShowFamilySelector(false);
    loadProductFamily(p.id);
    loadAllFamilies();
    setForm({
      sku: p.sku,
      partnerSku: p.partnerSku ?? '',
      nameAr: p.nameAr ?? '',
      nameEn: p.nameEn ?? '',
      brand: p.brand ?? '',
      family: '',
      unitCost:       p.unitCost ?? '',
      extraCosts:     p.extraCosts ?? '',
      costIncludesVat: p.costIncludesVat,
      notes:          p.notes ?? '',
    });
    setFormError('');
    setShowModal(true);
  }

  async function save() {
    if (!form.sku.trim()) { setFormError('يجب إدخال SKU'); return; }
    setSaving(true);
    setFormError('');
    try {
      const dto = {
        sku: form.sku.trim(),
        partnerSku: form.partnerSku || undefined,
        nameAr: form.nameAr || undefined,
        nameEn: form.nameEn || undefined,
        brand: form.brand || undefined,
        family: form.family || undefined,
        unitCost:       form.unitCost   ? parseFloat(form.unitCost).toFixed(4)   : undefined,
        extraCosts:     form.extraCosts ? parseFloat(form.extraCosts).toFixed(4) : undefined,
        costIncludesVat: form.costIncludesVat,
        notes:          form.notes || undefined,
      };
      if (editId !== null) {
        await api.update(editId, dto);
      } else {
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

  const totalPages = Math.ceil(total / 50);
  const set = (field: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">المنتجات</h1>
          <p className="text-slate-500 text-sm mt-1">{total.toLocaleString('ar-SA')} منتج</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => { try { await downloadExport('products'); } catch {} }}
            className="btn-ghost flex items-center gap-1.5 text-sm border border-slate-200"
          >
            <Download size={14} />
            تصدير Excel
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={15} />
            منتج جديد
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute top-2.5 right-3 text-slate-400" />
            <input
              className="input pr-9 text-sm"
              placeholder="بحث بـ SKU أو الاسم أو الماركة…"
              value={inputQ}
              onChange={e => setInputQ(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['SKU', 'الاسم', 'الماركة', 'التكلفة', 'ت. إضافية', 'تاريخ الإضافة'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="table-td text-center py-10 text-slate-400">
                  {q ? `لا توجد نتائج لـ "${q}"` : 'لا توجد منتجات'}
                </td></tr>
              ) : items.map(p => (
                <tr
                  key={p.id}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => openEdit(p)}
                >
                  <td className="table-td font-mono text-xs">{p.sku}</td>
                  <td className="table-td">{p.nameAr ?? p.nameEn ?? '—'}</td>
                  <td className="table-td">{p.brand ?? '—'}</td>
                  <td className="table-td">
                    {p.unitCost ? (
                      <span>
                        {p.unitCost} ر.س
                        {p.extraCosts && <span className="text-xs text-slate-400 mr-1">+{p.extraCosts}</span>}
                        {p.costIncludesVat && (
                          <span className="text-xs text-slate-400 mr-1">(شامل ض.ق.م)</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="table-td">{p.extraCosts ? `${p.extraCosts} ر.س` : '—'}</td>
                  <td className="table-td text-slate-400">{new Date(p.createdAt).toLocaleDateString('ar-SA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 50 && (
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{editId !== null ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">SKU <span className="text-red-500">*</span></label>
                  <input className="input text-xs font-mono" value={form.sku} onChange={set('sku')} placeholder="Z123456789" disabled={editId !== null} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">SKU الشريك</label>
                  <input className="input text-xs" value={form.partnerSku} onChange={set('partnerSku')} placeholder="MY-SKU-001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الاسم (عربي)</label>
                  <input className="input" value={form.nameAr} onChange={set('nameAr')} placeholder="اسم المنتج بالعربية" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الاسم (إنجليزي)</label>
                  <input className="input" value={form.nameEn} onChange={set('nameEn')} placeholder="Product name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الماركة</label>
                  <input className="input" value={form.brand} onChange={set('brand')} placeholder="Samsung" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الفئة</label>
                  <input className="input" value={form.family} onChange={set('family')} placeholder="Electronics" />
                </div>
                {canCost ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">سعر التكلفة (ر.س)</label>
                      <input className="input" type="number" min="0" step="0.01" value={form.unitCost} onChange={set('unitCost')} placeholder="99.99" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">تكاليف إضافية/وحدة (ر.س)</label>
                      <input className="input" type="number" min="0" step="0.01" value={form.extraCosts} onChange={set('extraCosts')} placeholder="5.00" />
                    </div>
                    <div className="flex items-center gap-2 pt-4 col-span-2">
                      <input
                        type="checkbox"
                        id="costIncludesVat"
                        checked={form.costIncludesVat}
                        onChange={set('costIncludesVat')}
                        className="w-4 h-4 rounded accent-brand-600"
                      />
                      <label htmlFor="costIncludesVat" className="text-sm text-slate-600">التكلفة تشمل ض.ق.م</label>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                    <Lock size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed whitespace-pre-line">{MSG.NO_PERM_COST}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
                  <input className="input text-xs" value={form.notes} onChange={set('notes')} placeholder="ملاحظات خاصة بهذا المنتج" />
                </div>
              </div>

              {/* Family section — only shown when editing an existing product */}
              {editId !== null && (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Folders size={14} className="text-brand-600 shrink-0" />
                    <span className="text-xs font-semibold text-slate-700">المجموعة</span>
                  </div>

                  {familyLoading ? (
                    <p className="text-xs text-slate-400">جارٍ التحميل…</p>
                  ) : productFamily ? (
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => router.push(`/product-families/${productFamily.familyId}`)}
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        {productFamily.familyName}
                      </button>
                      {canFamilies && (
                        <button
                          type="button"
                          onClick={unlinkFromFamily}
                          disabled={linkingFamily}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                        >
                          <Unlink size={12} />
                          إزالة من المجموعة
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {canFamilies && !showFamilySelector && (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowFamilySelector(true)}
                            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                          >
                            <Link size={12} />
                            ربط بمجموعة
                          </button>
                          <span className="text-slate-300 text-xs">·</span>
                          <button
                            type="button"
                            onClick={() => { setShowModal(false); router.push('/product-families'); }}
                            className="text-xs text-slate-500 hover:text-slate-700"
                          >
                            إنشاء مجموعة جديدة
                          </button>
                        </>
                      )}
                      {!canFamilies && (
                        <span className="text-xs text-slate-400">لا توجد مجموعة</span>
                      )}
                    </div>
                  )}

                  {showFamilySelector && canFamilies && (
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {allFamilies.length === 0 ? (
                        <p className="text-xs text-slate-400">لا توجد مجموعات — أنشئ مجموعة أولاً</p>
                      ) : allFamilies.map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => linkToFamily(f.id)}
                          disabled={linkingFamily}
                          className="w-full text-right text-xs px-2 py-1.5 rounded hover:bg-brand-50 text-slate-700 hover:text-brand-700 transition-colors disabled:opacity-50"
                        >
                          {f.name}
                          <span className="text-slate-400 mr-1">({f.productCount} منتج)</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowFamilySelector(false)}
                        className="text-xs text-slate-400 hover:text-slate-600 mt-1"
                      >
                        إلغاء
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost text-sm">إلغاء</button>
              <button onClick={save} disabled={saving} className="btn-primary text-sm min-w-[100px]">
                {saving ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
