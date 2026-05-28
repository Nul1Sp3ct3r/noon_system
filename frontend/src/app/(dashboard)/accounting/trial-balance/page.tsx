'use client';

import { useEffect, useState, useCallback } from 'react';
import { accounting } from '@/lib/api';
import type { TrialBalance } from '@/lib/types';

const TYPE_LABELS: Record<string, string> = {
  asset: 'أصول', liability: 'خصوم', equity: 'حقوق الملكية',
  revenue: 'إيرادات', expense: 'مصاريف',
};

export default function TrialBalancePage() {
  const [data, setData]       = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await accounting.trialBalance({
        from: from || undefined,
        to:   to   || undefined,
      });
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ميزان المراجعة</h1>
        <p className="text-sm text-gray-500 mt-1">Trial Balance — القيود المرحّلة</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
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
        <button onClick={load}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm">
          تحديث
        </button>
        {from || to ? (
          <button onClick={() => { setFrom(''); setTo(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-4 py-1.5 rounded-lg">
            مسح
          </button>
        ) : null}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : data ? (
        <>
          {/* Balance indicator */}
          <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${data.balanced ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <span className={`text-lg font-bold ${data.balanced ? 'text-green-700' : 'text-red-700'}`}>
              {data.balanced ? '✓ الميزان متوازن' : '✗ الميزان غير متوازن'}
            </span>
            <span className="text-sm text-gray-600">
              إجمالي مدين: {fmt(data.totalDebit)} | إجمالي دائن: {fmt(data.totalCredit)}
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">الكود</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">اسم الحساب</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">النوع</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">مدين</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">دائن</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map(row => (
                  <tr key={row.account.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-blue-700">{row.account.code}</td>
                    <td className="px-4 py-2.5 text-gray-800">
                      {row.account.nameAr}
                      {row.account.nameEn && <span className="text-xs text-gray-400 mr-2">{row.account.nameEn}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{TYPE_LABELS[row.account.accountType]}</td>
                    <td className="px-4 py-2.5 text-left font-mono text-xs">
                      {row.debit > 0 ? fmt(row.debit) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-left font-mono text-xs">
                      {row.credit > 0 ? fmt(row.credit) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-left font-mono text-xs font-semibold ${row.balance > 0 ? 'text-blue-700' : row.balance < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {row.balance !== 0 ? fmt(Math.abs(row.balance)) + (row.balance > 0 ? ' م' : ' د') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-bold text-gray-700">الإجمالي</td>
                  <td className="px-4 py-3 text-left font-bold font-mono text-sm">{fmt(data.totalDebit)}</td>
                  <td className="px-4 py-3 text-left font-bold font-mono text-sm">{fmt(data.totalCredit)}</td>
                  <td className="px-4 py-3 text-left font-bold font-mono text-sm text-gray-500">
                    {fmt(Math.abs(data.totalDebit - data.totalCredit))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-gray-400 text-center">
            {data.rows.length} حساب لها أرصدة | {from || to ? `الفترة: ${from || '—'} إلى ${to || '—'}` : 'كل الفترات'}
          </p>
        </>
      ) : null}
    </div>
  );
}
