'use client';

import { useEffect, useState, useCallback } from 'react';
import { accounting } from '@/lib/api';
import type { AccountingPeriod } from '@/lib/types';

const MONTHS_AR = [
  '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  const [newYear, setNewYear]   = useState(new Date().getFullYear());
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setPeriods(await accounting.periods());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(period: AccountingPeriod) {
    const key = `${period.periodYear}-${period.periodMonth}`;
    const action = period.isClosed ? 'فتح' : 'إغلاق';
    if (!confirm(`هل تريد ${action} الفترة ${MONTHS_AR[period.periodMonth]} ${period.periodYear}؟`)) return;
    setToggling(key);
    try {
      await accounting.togglePeriod(period.periodYear, period.periodMonth, !period.isClosed);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'خطأ');
    } finally {
      setToggling(null);
    }
  }

  async function handleCreate() {
    const existing = periods.find(p => p.periodYear === newYear && p.periodMonth === newMonth);
    if (existing) { alert('هذه الفترة موجودة بالفعل'); return; }
    setCreating(true);
    try {
      await accounting.togglePeriod(newYear, newMonth, false);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'خطأ');
    } finally {
      setCreating(false);
    }
  }

  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">الفترات المحاسبية</h1>
        <p className="text-sm text-gray-500 mt-1">إدارة قفل / فتح الفترات المحاسبية</p>
      </div>

      {/* Quick current period */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-sm font-medium text-blue-800">الفترة الحالية</p>
          <p className="text-lg font-bold text-blue-900">{MONTHS_AR[currentMonth]} {currentYear}</p>
        </div>
        {(() => {
          const cur = periods.find(p => p.periodYear === currentYear && p.periodMonth === currentMonth);
          if (!cur) return (
            <button onClick={handleCreate} disabled={creating}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">
              {creating ? 'جاري...' : 'إنشاء الفترة الحالية'}
            </button>
          );
          return (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${cur.isClosed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {cur.isClosed ? 'مغلقة' : 'مفتوحة'}
            </span>
          );
        })()}
      </div>

      {/* Add period */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">السنة</label>
          <input type="number" value={newYear} min={2020} max={2099}
            onChange={e => setNewYear(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">الشهر</label>
          <select value={newMonth} onChange={e => setNewMonth(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {MONTHS_AR.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <button onClick={handleCreate} disabled={creating}
          className="bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm">
          {creating ? 'جاري...' : 'إنشاء فترة'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : periods.length === 0 ? (
        <div className="text-center py-16 text-gray-400">لا توجد فترات محاسبية — أنشئ الفترة الحالية أعلاه</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الفترة</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">الحالة</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">تاريخ الإغلاق</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">أُغلق بواسطة</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periods.map(p => {
                const key = `${p.periodYear}-${p.periodMonth}`;
                const isCurrent = p.periodYear === currentYear && p.periodMonth === currentMonth;
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${isCurrent ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {MONTHS_AR[p.periodMonth]} {p.periodYear}
                      {isCurrent && <span className="mr-2 text-xs text-blue-600 font-normal">— الفترة الحالية</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${p.isClosed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {p.isClosed ? 'مغلقة' : 'مفتوحة'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.closedAt ? new Date(p.closedAt).toLocaleDateString('ar-SA') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.closedBy ? (p.closedBy.fullName ?? p.closedBy.username) : '—'}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <button
                        onClick={() => handleToggle(p)}
                        disabled={toggling === key}
                        className={`text-xs px-3 py-1 rounded border ${p.isClosed
                          ? 'border-green-300 text-green-700 hover:bg-green-50'
                          : 'border-red-300 text-red-600 hover:bg-red-50'
                        } disabled:opacity-40`}
                      >
                        {toggling === key ? '...' : p.isClosed ? 'فتح الفترة' : 'إغلاق الفترة'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">تنبيه</p>
        <p>إغلاق الفترة يمنع إنشاء أو تعديل القيود المحاسبية لذلك الشهر. تأكد من مراجعة الميزان قبل الإغلاق.</p>
      </div>
    </div>
  );
}
