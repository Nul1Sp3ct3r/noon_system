'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Download, Info } from 'lucide-react';
import { vatCenter as api, downloadExport } from '@/lib/api';
import { translateError } from '@/lib/errors';
import type { VatRow } from '@/lib/types';

const YEAR = new Date().getFullYear();

export default function VatCenterPage() {
  const [rows, setRows]       = useState<VatRow[]>([]);
  const [year, setYear]       = useState(YEAR);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [exporting, setExporting] = useState(false);
  const [showTip, setShowTip]     = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.breakdown(year)
      .then(d => setRows(d.months))
      .catch(err => setError(translateError(err, 'فشل تحميل بيانات الضريبة')))
      .finally(() => setLoading(false));
  }, [year]);

  const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totals = rows.reduce(
    (a, r) => ({
      outputVat:       a.outputVat       + r.outputVat,
      inputVatNoon:    a.inputVatNoon    + r.inputVatNoon,
      inputVatSupplier: a.inputVatSupplier + r.inputVatSupplier,
      netVat:          a.netVat          + r.netVat,
    }),
    { outputVat: 0, inputVatNoon: 0, inputVatSupplier: 0, netVat: 0 },
  );

  const isPayable = totals.netVat >= 0;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">مركز ضريبة القيمة المضافة</h1>
          <p className="text-sm text-slate-500 mt-1">
            المستحق للهيئة = ضريبة المخرجات − ضريبة مدخلات نون − ضريبة مدخلات الموردين
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-28 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[YEAR, YEAR - 1, YEAR - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={async () => {
              setExporting(true);
              try { await downloadExport('vat', { year }); }
              catch (e) { setError(translateError(e)); }
              finally { setExporting(false); }
            }}
            disabled={exporting || loading}
            className="btn-ghost flex items-center gap-1.5 text-sm border border-slate-200"
          >
            <Download size={14} />
            {exporting ? 'جارٍ…' : 'تصدير Excel'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Output VAT */}
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-medium">ضريبة المخرجات</p>
          <p className="text-xl font-bold mt-1 text-red-600">{fmt(totals.outputVat)} ر.س</p>
          <p className="text-[10px] text-slate-400 mt-1">على مبيعاتك لنون</p>
        </div>

        {/* Noon input VAT */}
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-medium">ضريبة مدخلات نون</p>
          <p className="text-xl font-bold mt-1 text-emerald-600">{fmt(totals.inputVatNoon)} ر.س</p>
          <p className="text-[10px] text-slate-400 mt-1">VAT على رسوم نون</p>
        </div>

        {/* Supplier input VAT */}
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-medium">ضريبة مدخلات الموردين</p>
          <p className="text-xl font-bold mt-1 text-emerald-600">{fmt(totals.inputVatSupplier)} ر.س</p>
          <p className="text-[10px] text-slate-400 mt-1">VAT على فواتير الشراء</p>
        </div>

        {/* MAIN CARD — المستحق للهيئة */}
        <div className={`card p-4 border-2 ${isPayable ? 'border-orange-300 bg-orange-50' : 'border-emerald-300 bg-emerald-50'}`}>
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold text-slate-700">المستحق للهيئة</p>
            {/* Tooltip trigger */}
            <div className="relative">
              <button
                onClick={() => setShowTip(v => !v)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="تفاصيل الحساب"
              >
                <Info size={14} />
              </button>
              {showTip && (
                <div className="absolute left-0 top-5 z-10 w-64 rounded-lg bg-slate-800 text-white text-xs p-3 shadow-xl leading-relaxed">
                  هذا الرقم هو المبلغ المتوقع سداده في إقرار ضريبة القيمة المضافة، قبل أي تعديلات يدوية.
                  <br /><br />
                  المعادلة: ضريبة المخرجات − مدخلات نون − مدخلات الموردين
                  <button onClick={() => setShowTip(false)} className="block mt-2 text-slate-400 hover:text-white">إغلاق</button>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-0.5">ضريبة المخرجات − ضريبة المدخلات القابلة للاسترداد</p>
          <p className={`text-2xl font-bold mt-2 ${isPayable ? 'text-orange-700' : 'text-emerald-700'}`}>
            {fmt(totals.netVat)} ر.س
          </p>

          <span className={`inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            isPayable
              ? 'bg-orange-200 text-orange-800'
              : 'bg-emerald-200 text-emerald-800'
          }`}>
            {isPayable ? 'مستحق دفعه للهيئة' : 'رصيد ضريبي قابل للترحيل/الاسترداد'}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {[
                'الشهر',
                'المبيعات شاملة الضريبة',
                'ضريبة المخرجات',
                'رسوم نون (ق.ض.)',
                'ضريبة مدخلات نون',
                'فواتير الموردين (ق.ض.)',
                'ضريبة مدخلات الموردين',
                'المستحق للهيئة',
              ].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
            {/* Formula row */}
            <tr className="bg-slate-100 border-t border-slate-200">
              <td className="table-td text-xs text-slate-400 font-medium" colSpan={2}>المعادلة</td>
              <td className="table-td text-xs text-red-500 font-semibold">ضريبة المخرجات</td>
              <td className="table-td text-xs text-slate-400">—</td>
              <td className="table-td text-xs text-emerald-600 font-semibold">− مدخلات نون</td>
              <td className="table-td text-xs text-slate-400">—</td>
              <td className="table-td text-xs text-emerald-600 font-semibold">− مدخلات الموردين</td>
              <td className="table-td text-xs text-orange-600 font-semibold">= المستحق للهيئة</td>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">لا توجد بيانات لهذه السنة</td></tr>
            ) : rows.map(r => (
              <tr key={r.month} className="hover:bg-slate-50">
                <td className="table-td font-medium">{r.month}</td>
                <td className="table-td">{fmt(r.salesInclVat)}</td>
                <td className="table-td text-red-600 font-medium">{fmt(r.outputVat)}</td>
                <td className="table-td text-slate-500">{fmt(r.noonFeesExcl)}</td>
                <td className="table-td text-emerald-600">{fmt(r.inputVatNoon)}</td>
                <td className="table-td text-slate-500">
                  {r.inputVatSupplier > 0 ? fmt(r.inputVatSupplier / 1.15 * 1.15) : '—'}
                </td>
                <td className="table-td text-emerald-600">{fmt(r.inputVatSupplier)}</td>
                <td className={`table-td font-bold ${r.netVat >= 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {fmt(r.netVat)}
                  {r.netVat >= 0
                    ? <span className="mr-1 text-[9px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded">دفع</span>
                    : <span className="mr-1 text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">رصيد</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
          {/* Totals row */}
          {!loading && rows.length > 1 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                <td className="table-td text-slate-700">الإجمالي</td>
                <td className="table-td">—</td>
                <td className="table-td text-red-600">{fmt(totals.outputVat)}</td>
                <td className="table-td">—</td>
                <td className="table-td text-emerald-600">{fmt(totals.inputVatNoon)}</td>
                <td className="table-td">—</td>
                <td className="table-td text-emerald-600">{fmt(totals.inputVatSupplier)}</td>
                <td className={`table-td text-lg ${isPayable ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {fmt(totals.netVat)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
