'use client';

import { useEffect, useState, useCallback } from 'react';
import { journals, accounts } from '@/lib/api';
import type { JournalEntry, Account } from '@/lib/types';

interface LineInput {
  accountId: string;
  accountAr: string;
  debit: string;
  credit: string;
  notes: string;
}

const emptyLine = (): LineInput => ({ accountId: '', accountAr: '', debit: '', credit: '', notes: '' });

const fmt = (v: string | number) => parseFloat(String(v) || '0').toFixed(2);

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'مسودة',  cls: 'bg-yellow-100 text-yellow-800' },
  posted:   { label: 'مرحّل',  cls: 'bg-green-100 text-green-800'  },
  reversed: { label: 'محوّل',  cls: 'bg-gray-100 text-gray-600'    },
};

export default function JournalPage() {
  const [items, setItems]       = useState<JournalEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [stats, setStats] = useState<{ total: number; posted: number; draft: number; totalDebit: number; totalCredit: number } | null>(null);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);

  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo, setFilterTo]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterQ, setFilterQ]         = useState('');

  const [entryDate, setEntryDate]     = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference]     = useState('');
  const [status, setStatus]           = useState<'draft' | 'posted'>('posted');
  const [lines, setLines]             = useState<LineInput[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');

  const loadAccounts = useCallback(async () => {
    try {
      const res = await accounts.list({ activeOnly: true });
      setAllAccounts(res);
    } catch { /* non-fatal */ }
  }, []);

  const loadStats = useCallback(async () => {
    try { setStats(await journals.stats()); } catch { /* non-fatal */ }
  }, []);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await journals.list({
        page: p, limit: 20,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        status: filterStatus || undefined,
        q: filterQ || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  }, [filterFrom, filterTo, filterStatus, filterQ]);

  useEffect(() => { load(page); }, [page, load]);
  useEffect(() => { loadStats(); loadAccounts(); }, [loadStats, loadAccounts]);

  const totalPages = Math.ceil(total / 20);

  const lineDebitTotal  = lines.reduce((s, l) => s + parseFloat(l.debit  || '0'), 0);
  const lineCreditTotal = lines.reduce((s, l) => s + parseFloat(l.credit || '0'), 0);
  const balanced = Math.abs(lineDebitTotal - lineCreditTotal) < 0.001;

  function updateLine(i: number, field: keyof LineInput, value: string) {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l;
      const updated = { ...l, [field]: value };
      if (field === 'accountId' && value) {
        const acc = allAccounts.find(a => a.id === parseInt(value));
        if (acc) updated.accountAr = acc.nameAr;
      }
      return updated;
    }));
  }
  function addLine()           { setLines(prev => [...prev, emptyLine()]); }
  function removeLine(i: number) { setLines(prev => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!entryDate)       { setFormError('تاريخ القيد مطلوب'); return; }
    if (lines.length < 2) { setFormError('يجب إدخال سطرين على الأقل'); return; }
    if (!balanced)        { setFormError(`القيد غير متوازن: مدين ${lineDebitTotal.toFixed(2)} ≠ دائن ${lineCreditTotal.toFixed(2)}`); return; }
    const validLines = lines.filter(l => l.accountAr.trim() || l.accountId);
    if (validLines.length < 2) { setFormError('يجب ملء حقل الحساب في كل سطر'); return; }

    setSaving(true);
    try {
      await journals.create({
        entryDate,
        description: description || undefined,
        reference:   reference   || undefined,
        status,
        lines: validLines.map(l => ({
          accountId: l.accountId ? parseInt(l.accountId) : undefined,
          accountAr: l.accountAr.trim(),
          debit:     parseFloat(l.debit  || '0'),
          credit:    parseFloat(l.credit || '0'),
          notes:     l.notes || undefined,
        })),
      });
      setShowForm(false);
      setEntryDate(''); setDescription(''); setReference('');
      setLines([emptyLine(), emptyLine()]); setStatus('posted');
      load(1); setPage(1); loadStats();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function handlePost(id: number) {
    try { await journals.post(id); load(page); loadStats(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'خطأ'); }
  }

  async function handleReverse(id: number) {
    if (!confirm('هل تريد محو هذا القيد؟ سيُنشأ قيد عكسي.')) return;
    try { await journals.reverse(id); load(page); loadStats(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'خطأ'); }
  }

  async function handleDelete(id: number) {
    if (!confirm('هل تريد حذف هذا القيد؟')) return;
    try { await journals.remove(id); load(page); loadStats(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'خطأ'); }
  }

  function applyFilters() { setPage(1); load(1); }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">القيود المحاسبية</h1>
          <p className="text-sm text-gray-500 mt-1">دفتر الأستاذ — القيد المزدوج</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setFormError(''); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {showForm ? 'إلغاء' : '+ قيد جديد'}
        </button>
      </div>

      {/* KPI stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'إجمالي القيود', value: stats.total.toLocaleString() },
            { label: 'مرحّلة',        value: stats.posted.toLocaleString() },
            { label: 'مسودة',         value: stats.draft.toLocaleString() },
            { label: 'إجمالي مدين',   value: Number(stats.totalDebit).toLocaleString('ar-SA', { minimumFractionDigits: 2 }) },
            { label: 'إجمالي دائن',   value: Number(stats.totalCredit).toLocaleString('ar-SA', { minimumFractionDigits: 2 }) },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-gray-800 mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">من</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">إلى</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">الحالة</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">الكل</option>
            <option value="draft">مسودة</option>
            <option value="posted">مرحّل</option>
            <option value="reversed">محوّل</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">بحث</label>
          <input type="text" value={filterQ} onChange={e => setFilterQ(e.target.value)}
            placeholder="رقم القيد / الوصف / المرجع..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52" />
        </div>
        <button onClick={applyFilters}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm">
          تطبيق
        </button>
      </div>

      {/* New Journal Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">إنشاء قيد محاسبي جديد</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ القيد *</label>
              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="وصف القيد..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المرجع</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                placeholder="رقم فاتورة / مرجع..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الحالة</label>
              <select value={status} onChange={e => setStatus(e.target.value as 'draft' | 'posted')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="posted">مرحّل</option>
                <option value="draft">مسودة</option>
              </select>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 mb-1 px-1">
              <span className="col-span-4">الحساب</span>
              <span className="col-span-3">الاسم (يُملأ تلقائياً)</span>
              <span className="col-span-1 text-left">مدين</span>
              <span className="col-span-1 text-left">دائن</span>
              <span className="col-span-2">ملاحظة</span>
              <span className="col-span-1" />
            </div>

            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <select
                  className="col-span-4 border border-gray-300 rounded px-2 py-1.5 text-sm"
                  value={l.accountId}
                  onChange={e => updateLine(i, 'accountId', e.target.value)}
                >
                  <option value="">-- اختر الحساب --</option>
                  {allAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>
                  ))}
                </select>
                <input
                  className="col-span-3 border border-gray-300 rounded px-2 py-1.5 text-sm bg-gray-50"
                  placeholder="أو اكتب اسم الحساب"
                  value={l.accountAr}
                  onChange={e => updateLine(i, 'accountAr', e.target.value)}
                />
                <input
                  className="col-span-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-left"
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={l.debit}
                  onChange={e => updateLine(i, 'debit', e.target.value)}
                />
                <input
                  className="col-span-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-left"
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={l.credit}
                  onChange={e => updateLine(i, 'credit', e.target.value)}
                />
                <input
                  className="col-span-2 border border-gray-300 rounded px-2 py-1.5 text-sm"
                  placeholder="ملاحظة"
                  value={l.notes}
                  onChange={e => updateLine(i, 'notes', e.target.value)}
                />
                <div className="col-span-1 flex items-center justify-center">
                  {lines.length > 2 && (
                    <button type="button" onClick={() => removeLine(i)}
                      className="text-red-500 hover:text-red-700 text-xs px-1">✕</button>
                  )}
                </div>
              </div>
            ))}

            <div className="grid grid-cols-12 gap-2 mt-2 border-t pt-2">
              <span className="col-span-7 text-sm font-medium text-gray-700">الإجمالي</span>
              <span className={`col-span-1 text-sm font-bold text-left ${balanced ? 'text-green-600' : 'text-red-600'}`}>
                {lineDebitTotal.toFixed(2)}
              </span>
              <span className={`col-span-1 text-sm font-bold text-left ${balanced ? 'text-green-600' : 'text-red-600'}`}>
                {lineCreditTotal.toFixed(2)}
              </span>
              <div className="col-span-3">
                {balanced ? <span className="text-green-600 text-xs">✓ متوازن</span>
                          : <span className="text-red-500 text-xs">غير متوازن</span>}
              </div>
            </div>

            <button type="button" onClick={addLine}
              className="mt-2 text-blue-600 hover:text-blue-800 text-sm">
              + إضافة سطر
            </button>
          </div>

          {formError && <p className="text-red-600 text-sm">{formError}</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={saving || !balanced}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium">
              {saving ? 'جاري الحفظ...' : 'حفظ القيد'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">لا توجد قيود محاسبية</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-right font-medium text-gray-600">رقم القيد</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">التاريخ</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">الوصف</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">المرجع</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">الحالة</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">مدين</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">دائن</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(entry => {
                const debitSum  = entry.lines.reduce((s, l) => s + parseFloat(l.debit),  0);
                const creditSum = entry.lines.reduce((s, l) => s + parseFloat(l.credit), 0);
                const st = STATUS_LABELS[entry.status] ?? STATUS_LABELS.draft;
                return (
                  <>
                    <tr
                      key={entry.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    >
                      <td className="px-3 py-3 font-mono text-blue-700 text-xs">
                        {entry.journalNumber ?? `#${entry.id}`}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{entry.entryDate}</td>
                      <td className="px-3 py-3 text-gray-700 max-w-[160px] truncate">{entry.description || '—'}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{entry.reference || '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-left font-mono text-xs">{debitSum.toFixed(2)}</td>
                      <td className="px-3 py-3 text-left font-mono text-xs">{creditSum.toFixed(2)}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          {entry.status === 'draft' && (
                            <button onClick={() => handlePost(entry.id)}
                              className="text-green-600 hover:text-green-800 text-xs px-1.5 py-0.5 border border-green-300 rounded">
                              ترحيل
                            </button>
                          )}
                          {entry.status === 'posted' && (
                            <button onClick={() => handleReverse(entry.id)}
                              className="text-orange-500 hover:text-orange-700 text-xs px-1.5 py-0.5 border border-orange-300 rounded">
                              محو
                            </button>
                          )}
                          {entry.status !== 'posted' && (
                            <button onClick={() => handleDelete(entry.id)}
                              className="text-red-400 hover:text-red-600 text-xs px-1.5 py-0.5 border border-red-200 rounded">
                              حذف
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === entry.id && (
                      <tr key={`${entry.id}-lines`}>
                        <td colSpan={8} className="bg-gray-50 px-6 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-gray-500 text-xs">
                                <th className="text-right py-1">كود</th>
                                <th className="text-right py-1">الحساب</th>
                                <th className="text-left py-1">مدين</th>
                                <th className="text-left py-1">دائن</th>
                                <th className="text-right py-1">ملاحظة</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entry.lines.map(line => (
                                <tr key={line.id} className="border-t border-gray-200">
                                  <td className="py-1 text-xs font-mono text-gray-500">
                                    {line.account?.code ?? '—'}
                                  </td>
                                  <td className="py-1 text-gray-700">
                                    {line.account?.nameAr ?? line.accountAr}
                                  </td>
                                  <td className="py-1 text-left font-mono text-xs">
                                    {parseFloat(line.debit) > 0 ? fmt(line.debit) : ''}
                                  </td>
                                  <td className="py-1 text-left font-mono text-xs">
                                    {parseFloat(line.credit) > 0 ? fmt(line.credit) : ''}
                                  </td>
                                  <td className="py-1 text-xs text-gray-500">{line.notes || ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {entry.createdBy && (
                            <p className="text-xs text-gray-400 mt-2">
                              أُنشئ بواسطة: {entry.createdBy.fullName ?? entry.createdBy.username}
                            </p>
                          )}
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
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40">السابق</button>
          <span className="text-sm text-gray-600">صفحة {page} من {totalPages} ({total} قيد)</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40">التالي</button>
        </div>
      )}
    </div>
  );
}
