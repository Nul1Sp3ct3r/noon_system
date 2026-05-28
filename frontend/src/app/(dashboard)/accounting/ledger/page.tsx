'use client';

import { useEffect, useState, useCallback } from 'react';
import { accounting, accounts } from '@/lib/api';
import type { GeneralLedger, Account } from '@/lib/types';

export default function GeneralLedgerPage() {
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId]   = useState<number | ''>('');
  const [data, setData]               = useState<GeneralLedger | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [from, setFrom]               = useState('');
  const [to, setTo]                   = useState('');

  useEffect(() => {
    accounts.list({ activeOnly: true }).then(setAllAccounts).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true); setError('');
    try {
      const res = await accounting.ledger(selectedId, {
        from: from || undefined,
        to:   to   || undefined,
      });
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  }, [selectedId, from, to]);

  useEffect(() => { if (selectedId) load(); else setData(null); }, [selectedId, load]);

  const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">دفتر الأستاذ العام</h1>
        <p className="text-sm text-gray-500 mt-1">General Ledger — حركات الحساب</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">اختر الحساب</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value ? parseInt(e.target.value) : '')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-72">
            <option value="">— اختر حساباً —</option>
            {allAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">من تاريخ</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">إلى تاريخ</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <button onClick={load} disabled={!selectedId}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-sm">
          عرض
        </button>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-4 py-1.5 rounded-lg">
            مسح
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : data ? (
        <>
          {/* Account header */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-6 py-4 flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-blue-500">الحساب</p>
              <p className="text-lg font-bold text-blue-900">{data.account.code} — {data.account.nameAr}</p>
            </div>
            <div>
              <p className="text-xs text-blue-500">إجمالي مدين</p>
              <p className="text-base font-semibold text-blue-800">{fmt(data.totalDebit)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-500">إجمالي دائن</p>
              <p className="text-base font-semibold text-blue-800">{fmt(data.totalCredit)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-500">الرصيد الختامي</p>
              <p className={`text-base font-bold ${data.closingBalance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {fmt(Math.abs(data.closingBalance))} {data.closingBalance >= 0 ? 'مدين' : 'دائن'}
              </p>
            </div>
          </div>

          {data.entries.length === 0 ? (
            <div className="text-center py-10 text-gray-400">لا توجد حركات لهذا الحساب في الفترة المحددة</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-3 text-right font-medium text-gray-600">رقم القيد</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-600">التاريخ</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-600">الوصف</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-600">المصدر</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-600">مدين</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-600">دائن</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-600">الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.entries.map((entry, idx) => (
                    <tr key={`${entry.journalId}-${entry.id}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-mono text-xs text-blue-700">
                        {entry.journal.journalNumber ?? `#${entry.journalId}`}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{entry.journal.entryDate}</td>
                      <td className="px-3 py-2.5 text-gray-700 max-w-[180px] truncate">
                        {entry.journal.description ?? entry.notes ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">
                        {entry.journal.sourceType ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-left font-mono text-xs text-green-700">
                        {entry.debit > 0 ? fmt(entry.debit) : ''}
                      </td>
                      <td className="px-3 py-2.5 text-left font-mono text-xs text-red-600">
                        {entry.credit > 0 ? fmt(entry.credit) : ''}
                      </td>
                      <td className={`px-3 py-2.5 text-left font-mono text-xs font-semibold ${entry.runningBalance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                        {fmt(Math.abs(entry.runningBalance))} {entry.runningBalance >= 0 ? 'م' : 'د'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={4} className="px-3 py-3 font-bold text-gray-700">الإجمالي</td>
                    <td className="px-3 py-3 text-left font-bold font-mono text-sm text-green-700">{fmt(data.totalDebit)}</td>
                    <td className="px-3 py-3 text-left font-bold font-mono text-sm text-red-600">{fmt(data.totalCredit)}</td>
                    <td className={`px-3 py-3 text-left font-bold font-mono text-sm ${data.closingBalance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                      {fmt(Math.abs(data.closingBalance))} {data.closingBalance >= 0 ? 'م' : 'د'}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
                {data.entries.length} حركة
              </div>
            </div>
          )}
        </>
      ) : !selectedId ? (
        <div className="text-center py-16 text-gray-400">اختر حساباً لعرض حركاته</div>
      ) : null}
    </div>
  );
}
