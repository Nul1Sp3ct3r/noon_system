'use client';

import { useEffect, useState, useCallback } from 'react';
import { journals } from '@/lib/api';
import type { JournalEntry } from '@/lib/types';

interface LineInput {
  accountAr: string;
  debit: string;
  credit: string;
}

const emptyLine = (): LineInput => ({ accountAr: '', debit: '', credit: '' });

const fmt = (v: string) => parseFloat(v || '0').toFixed(2);

export default function JournalPage() {
  const [items, setItems]         = useState<JournalEntry[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [showForm, setShowForm]   = useState(false);

  const [entryDate, setEntryDate]       = useState('');
  const [description, setDescription]   = useState('');
  const [lines, setLines]               = useState<LineInput[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving]             = useState(false);
  const [formError, setFormError]       = useState('');

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await journals.list({ page: p, limit: 20 });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  const totalPages = Math.ceil(total / 20);

  const lineDebitTotal  = lines.reduce((s, l) => s + parseFloat(l.debit  || '0'), 0);
  const lineCreditTotal = lines.reduce((s, l) => s + parseFloat(l.credit || '0'), 0);
  const balanced = Math.abs(lineDebitTotal - lineCreditTotal) < 0.001;

  function updateLine(i: number, field: keyof LineInput, value: string) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }
  function addLine()    { setLines(prev => [...prev, emptyLine()]); }
  function removeLine(i: number) { setLines(prev => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!entryDate)       { setFormError('تاريخ القيد مطلوب'); return; }
    if (lines.length < 2) { setFormError('يجب إدخال سطرين على الأقل'); return; }
    if (!balanced)        { setFormError(`القيد غير متوازن: مدين ${lineDebitTotal.toFixed(2)} ≠ دائن ${lineCreditTotal.toFixed(2)}`); return; }
    const validLines = lines.filter(l => l.accountAr.trim());
    if (validLines.length < 2) { setFormError('يجب ملء حقل الحساب في كل سطر'); return; }

    setSaving(true);
    try {
      await journals.create({
        entryDate,
        description: description || undefined,
        lines: validLines.map(l => ({
          accountAr: l.accountAr.trim(),
          debit:     parseFloat(l.debit  || '0'),
          credit:    parseFloat(l.credit || '0'),
        })),
      });
      setShowForm(false);
      setEntryDate('');
      setDescription('');
      setLines([emptyLine(), emptyLine()]);
      load(1);
      setPage(1);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('هل تريد حذف هذا القيد؟')) return;
    try {
      await journals.remove(id);
      load(page);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'خطأ في الحذف');
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">القيود المحاسبية</h1>
          <p className="text-sm text-gray-500 mt-1">دفتر الأستاذ — القيود المزدوجة</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setFormError(''); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {showForm ? 'إلغاء' : '+ قيد جديد'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">إنشاء قيد محاسبي جديد</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ القيد *</label>
              <input
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="وصف القيد..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 mb-1 px-1">
              <span className="col-span-6">الحساب</span>
              <span className="col-span-2 text-left">مدين</span>
              <span className="col-span-2 text-left">دائن</span>
              <span className="col-span-2" />
            </div>

            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <input
                  className="col-span-6 border border-gray-300 rounded px-2 py-1.5 text-sm"
                  placeholder="اسم الحساب"
                  value={l.accountAr}
                  onChange={e => updateLine(i, 'accountAr', e.target.value)}
                />
                <input
                  className="col-span-2 border border-gray-300 rounded px-2 py-1.5 text-sm text-left"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={l.debit}
                  onChange={e => updateLine(i, 'debit', e.target.value)}
                />
                <input
                  className="col-span-2 border border-gray-300 rounded px-2 py-1.5 text-sm text-left"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={l.credit}
                  onChange={e => updateLine(i, 'credit', e.target.value)}
                />
                <div className="col-span-2 flex gap-1">
                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-red-500 hover:text-red-700 text-xs px-2"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="grid grid-cols-12 gap-2 mt-2 border-t pt-2">
              <span className="col-span-6 text-sm font-medium text-gray-700">الإجمالي</span>
              <span className={`col-span-2 text-sm font-bold text-left ${balanced ? 'text-green-600' : 'text-red-600'}`}>
                {lineDebitTotal.toFixed(2)}
              </span>
              <span className={`col-span-2 text-sm font-bold text-left ${balanced ? 'text-green-600' : 'text-red-600'}`}>
                {lineCreditTotal.toFixed(2)}
              </span>
              <div className="col-span-2">
                {balanced
                  ? <span className="text-green-600 text-xs">✓ متوازن</span>
                  : <span className="text-red-500 text-xs">غير متوازن</span>
                }
              </div>
            </div>

            <button
              type="button"
              onClick={addLine}
              className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
            >
              + إضافة سطر
            </button>
          </div>

          {formError && <p className="text-red-600 text-sm">{formError}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !balanced}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ القيد'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">لا توجد قيود محاسبية بعد</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-gray-600">#</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">التاريخ</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الوصف</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">إجمالي مدين</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">إجمالي دائن</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">السطور</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(entry => {
                const debitSum  = entry.lines.reduce((s, l) => s + parseFloat(l.debit),  0);
                const creditSum = entry.lines.reduce((s, l) => s + parseFloat(l.credit), 0);
                return (
                  <>
                    <tr
                      key={entry.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    >
                      <td className="px-4 py-3 text-gray-500">{entry.id}</td>
                      <td className="px-4 py-3 font-mono">{entry.entryDate}</td>
                      <td className="px-4 py-3 text-gray-700">{entry.description || '—'}</td>
                      <td className="px-4 py-3 text-left font-mono">{debitSum.toFixed(2)}</td>
                      <td className="px-4 py-3 text-left font-mono">{creditSum.toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-500">{entry.lines.length}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={ev => { ev.stopPropagation(); handleDelete(entry.id); }}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                    {expanded === entry.id && (
                      <tr key={`${entry.id}-lines`}>
                        <td colSpan={7} className="bg-gray-50 px-6 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-gray-500 text-xs">
                                <th className="text-right py-1">الحساب</th>
                                <th className="text-left py-1">مدين</th>
                                <th className="text-left py-1">دائن</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entry.lines.map(line => (
                                <tr key={line.id} className="border-t border-gray-200">
                                  <td className="py-1 text-gray-700">{line.accountAr}</td>
                                  <td className="py-1 text-left font-mono">
                                    {parseFloat(line.debit) > 0 ? fmt(line.debit) : ''}
                                  </td>
                                  <td className="py-1 text-left font-mono">
                                    {parseFloat(line.credit) > 0 ? fmt(line.credit) : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-sm text-gray-600">
            صفحة {page} من {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
