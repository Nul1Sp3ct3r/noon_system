'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, AlertCircle, Plus, X } from 'lucide-react';
import { products as api } from '@/lib/api';
import type { Product } from '@/lib/types';

interface ProductForm {
  sku: string;
  partnerSku: string;
  nameAr: string;
  nameEn: string;
  brand: string;
  family: string;
  unitCost: string;
  costIncludesVat: boolean;
}

const emptyForm = (): ProductForm => ({
  sku: '', partnerSku: '', nameAr: '', nameEn: '',
  brand: '', family: '', unitCost: '', costIncludesVat: false,
});

export default function ProductsPage() {
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
      setError(err instanceof Error ? err.message : 'فشل تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setFormError('');
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setEditId(p.id);
    setForm({
      sku: p.sku,
      partnerSku: p.partnerSku ?? '',
      nameAr: p.nameAr ?? '',
      nameEn: p.nameEn ?? '',
      brand: p.brand ?? '',
      family: '',
      unitCost: p.unitCost ?? '',
      costIncludesVat: p.costIncludesVat,
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
        unitCost: form.unitCost ? parseFloat(form.unitCost).toFixed(4) : undefined,
        costIncludesVat: form.costIncludesVat,
      };
      if (editId !== null) {
        await api.update(editId, dto);
      } else {
        await api.create(dto);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'فشل الحفظ');
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
        <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={15} />
          منتج جديد
        </button>
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
                {['SKU', 'الاسم', 'الماركة', 'التكلفة', 'تاريخ الإضافة'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="table-td text-center py-10 text-slate-400">
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
                        {p.costIncludesVat && (
                          <span className="text-xs text-slate-400 mr-1">(شامل ض.ق.م)</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
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
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">سعر التكلفة (ر.س)</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.unitCost} onChange={set('unitCost')} placeholder="99.99" />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="costIncludesVat"
                    checked={form.costIncludesVat}
                    onChange={set('costIncludesVat')}
                    className="w-4 h-4 rounded accent-brand-600"
                  />
                  <label htmlFor="costIncludesVat" className="text-sm text-slate-600">التكلفة تشمل ض.ق.م</label>
                </div>
              </div>
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
