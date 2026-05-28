'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Save, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { products as api } from '@/lib/api';
import type { Product } from '@/lib/types';

interface EditableRow {
  id: number;
  sku: string;
  partnerSku: string;
  nameAr: string;
  nameEn: string;
  brand: string;
  unitCost: string;
  extraCosts: string;
  costIncludesVat: boolean;
  notes: string;
  dirty: boolean;
}

export default function CostsPage() {
  const [rows, setRows]       = useState<EditableRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [inputQ, setInputQ]   = useState('');
  const [q, setQ]             = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setQ(inputQ); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [inputQ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.list({ q, page, limit: 100 });
      setTotal(res.total);
      setRows(res.items.map((p: Product) => ({
        id: p.id,
        sku: p.sku,
        partnerSku: p.partnerSku ?? '',
        nameAr: p.nameAr ?? '',
        nameEn: p.nameEn ?? '',
        brand: p.brand ?? '',
        unitCost: p.unitCost ?? '',
        extraCosts: p.extraCosts ?? '',
        costIncludesVat: p.costIncludesVat,
        notes: p.notes ?? '',
        dirty: false,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  function update(idx: number, field: keyof EditableRow, value: string | boolean) {
    setRows(r => r.map((row, i) =>
      i === idx ? { ...row, [field]: value, dirty: true } : row
    ));
    setSaved(false);
  }

  async function saveAll() {
    const dirty = rows.filter(r => r.dirty);
    if (dirty.length === 0) return;
    setSaving(true);
    setError('');
    try {
      await Promise.all(dirty.map(r =>
        api.update(r.id, {
          partnerSku:      r.partnerSku || undefined,
          unitCost:        r.unitCost ? parseFloat(r.unitCost).toFixed(4) : undefined,
          extraCosts:      r.extraCosts ? parseFloat(r.extraCosts).toFixed(4) : undefined,
          costIncludesVat: r.costIncludesVat,
          notes:           r.notes || undefined,
        })
      ));
      setRows(r => r.map(row => ({ ...row, dirty: false })));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / 100);
  const dirtyCount = rows.filter(r => r.dirty).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">إدارة التكاليف</h1>
          <p className="text-slate-500 text-sm mt-1">تحديث تكاليف المنتجات بشكل مجمّع</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-emerald-600 text-sm">
              <CheckCircle2 size={15} />
              تم الحفظ
            </span>
          )}
          <button
            onClick={saveAll}
            disabled={saving || dirtyCount === 0}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Save size={15} />
            {saving ? 'جارٍ الحفظ…' : `حفظ التغييرات${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
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
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['SKU', 'الاسم', 'الماركة', 'SKU الشريك', 'سعر التكلفة (ر.س)', 'تكاليف إضافية (ر.س)', 'شامل ض.ق.م', 'ملاحظات'].map(h => (
                  <th key={h} className="table-th text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">لا توجد منتجات</td></tr>
              ) : rows.map((row, idx) => (
                <tr key={row.id} className={row.dirty ? 'bg-amber-50' : 'hover:bg-slate-50'}>
                  <td className="table-td font-mono text-xs">{row.sku}</td>
                  <td className="table-td text-xs max-w-[150px] truncate">{row.nameAr || row.nameEn || '—'}</td>
                  <td className="table-td text-xs">{row.brand || '—'}</td>
                  <td className="table-td">
                    <input
                      className="input text-xs w-28 py-1"
                      value={row.partnerSku}
                      onChange={e => update(idx, 'partnerSku', e.target.value)}
                      placeholder="SKU"
                    />
                  </td>
                  <td className="table-td">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input text-xs w-24 py-1"
                      value={row.unitCost}
                      onChange={e => update(idx, 'unitCost', e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="table-td">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input text-xs w-24 py-1"
                      value={row.extraCosts}
                      onChange={e => update(idx, 'extraCosts', e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="table-td text-center">
                    <input
                      type="checkbox"
                      checked={row.costIncludesVat}
                      onChange={e => update(idx, 'costIncludesVat', e.target.checked)}
                      className="w-4 h-4 rounded accent-brand-600"
                    />
                  </td>
                  <td className="table-td">
                    <input
                      className="input text-xs w-40 py-1"
                      value={row.notes}
                      onChange={e => update(idx, 'notes', e.target.value)}
                      placeholder="ملاحظات…"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 100 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <button className="btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</button>
            <span>صفحة {page} من {totalPages} · {total.toLocaleString('ar-SA')} منتج</span>
            <button className="btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>التالي</button>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400 text-center">
        الصفوف المميّزة بالأصفر تحتوي تغييرات غير محفوظة · اضغط «حفظ التغييرات» لحفظ الكل دفعة واحدة
      </p>
    </div>
  );
}
