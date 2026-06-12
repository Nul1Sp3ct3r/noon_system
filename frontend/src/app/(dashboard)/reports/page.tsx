'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { reports as api, downloadExport, orgSettings } from '@/lib/api';
import type { PlRow, SalesRow, FeesRow, StatementFeeSummary, CompanySettings } from '@/lib/types';
import { FinancialPeriodFilter, usePeriodFilter, periodToParams, periodToDateRange } from '@/components/ui/financial-period-filter';

type Tab = 'pl' | 'sales' | 'fees';

const FEE_CAT_LABELS: Record<string, string> = {
  referralFee:    'عمولة نون',
  fbnOutboundFee: 'رسوم FBN الصادرة',
  storageFee:     'رسوم التخزين الشهري',
  returnFee:      'رسوم إدارة المرتجعات',
  damageFee:      'رسوم المرتجعات التالفة',
  removalFee:     'رسوم إزالة RTV',
  compensation:   'تعويض أضرار المخزون',
  other:          'رسوم أخرى',
};

const EMPTY_STMT: StatementFeeSummary = { total: 0, totalExclVat: 0, totalVat: 0, byCategory: {}, rows: [] };

export default function ReportsPage() {
  const [period, setPeriod] = usePeriodFilter();
  const [tab, setTab]   = useState<Tab>('pl');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [plRows, setPlRows]       = useState<PlRow[]>([]);
  const [salesRows, setSalesRows] = useState<SalesRow[]>([]);
  const [feesRows, setFeesRows]   = useState<FeesRow[]>([]);
  const [stmtFees, setStmtFees]   = useState<StatementFeeSummary>(EMPTY_STMT);
  const [sortBy, setSortBy]       = useState('revenue');
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings]   = useState<CompanySettings>({ vatRegistered: false, vatNumber: null, profitMode: 'expense' });

  const periodKey = [period.periodType, period.year, period.month, period.from, period.to].join(':');

  useEffect(() => {
    orgSettings.get().then(setSettings).catch(() => {});
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const type = tab === 'pl' ? 'pl' : tab === 'sales' ? 'sales' : 'fees';
      const params = tab === 'pl'
        ? periodToParams(period)
        : periodToDateRange(period);
      await downloadExport(type, params);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التصدير');
    } finally {
      setExporting(false);
    }
  }

  const fmt = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt0 = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  useEffect(() => {
    setLoading(true);
    setError('');
    const dateRange = periodToDateRange(period);
    const load =
      tab === 'pl'    ? () => api.pl(periodToParams(period)).then(r => setPlRows(r)) :
      tab === 'sales' ? () => api.sales({ ...dateRange, sortBy }).then(r => setSalesRows(r)) :
                        () => api.fees({ ...dateRange }).then(r => { setFeesRows(r.items); setStmtFees(r.statementFees ?? EMPTY_STMT); });

    load()
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل التقرير'))
      .finally(() => setLoading(false));
  }, [tab, periodKey, sortBy]);

  const plTotals = plRows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      totalFees: a.totalFees + r.totalFees,
      feesBeforeVat: a.feesBeforeVat + r.feesBeforeVat,
      vatOnFees: a.vatOnFees + r.vatOnFees,
      cogs: a.cogs + r.cogs,
      netProfit: a.netProfit + r.netProfit,
      operationalProfit: a.operationalProfit + r.operationalProfit,
    }),
    { revenue: 0, totalFees: 0, feesBeforeVat: 0, vatOnFees: 0, cogs: 0, netProfit: 0, operationalProfit: 0 },
  );

  const salesTotals = salesRows.reduce(
    (a, r) => ({ units: a.units + r.units, revenue: a.revenue + r.revenue, fees: a.fees + r.fees, cogs: a.cogs + r.cogs, profit: a.profit + r.profit }),
    { units: 0, revenue: 0, fees: 0, cogs: 0, profit: 0 },
  );

  const feesTotals = feesRows.reduce(
    (a, r) => ({ units: a.units + r.units, referralFees: a.referralFees + r.referralFees, fbnFees: a.fbnFees + r.fbnFees, totalFees: a.totalFees + r.totalFees }),
    { units: 0, referralFees: 0, fbnFees: 0, totalFees: 0 },
  );
  const grandTotalFees = feesTotals.totalFees + stmtFees.total;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-900">التقارير</h1>
        <button
          onClick={handleExport}
          disabled={exporting || loading}
          className="btn-ghost flex items-center gap-1.5 text-sm border border-slate-200"
        >
          <Download size={14} />
          {exporting ? 'جارٍ…' : 'تصدير Excel'}
        </button>
      </div>

      {/* Period filter */}
      <FinancialPeriodFilter value={period} onChange={setPeriod} className="mb-6" />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          { id: 'pl',    label: 'الأرباح والخسائر' },
          { id: 'sales', label: 'المبيعات بالمنتج' },
          { id: 'fees',  label: 'الرسوم بالمنتج' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* P&L Tab */}
      {tab === 'pl' && (
        <>
          {/* KPI cards — layout changes based on VAT registration */}
          {!settings.vatRegistered ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'الإيرادات',     value: plTotals.revenue,   color: 'text-emerald-600' },
                { label: 'الرسوم',        value: plTotals.totalFees, color: 'text-amber-600' },
                { label: 'تكلفة البضاعة', value: plTotals.cogs,      color: 'text-orange-600' },
                {
                  label: 'صافي الربح',
                  value: plTotals.netProfit,
                  color: plTotals.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600',
                  note: 'يشمل ضريبة رسوم نون',
                },
              ].map(({ label, value, color, note }) => (
                <div key={label} className="card p-4">
                  <p className="text-xs text-slate-500 font-medium">{label}</p>
                  <p className={`text-xl font-bold mt-1 ${color}`}>{fmt(value)} ر.س</p>
                  {note && <p className="text-[10px] text-slate-400 mt-1">{note}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className="card p-4">
                <p className="text-xs text-slate-500 font-medium">الإيرادات</p>
                <p className="text-xl font-bold mt-1 text-emerald-600">{fmt(plTotals.revenue)} ر.س</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500 font-medium">الرسوم قبل الضريبة</p>
                <p className="text-xl font-bold mt-1 text-amber-600">{fmt(plTotals.feesBeforeVat)} ر.س</p>
                <p className="text-[10px] text-slate-400 mt-1">ضريبة الرسوم: {fmt(plTotals.vatOnFees)} ر.س</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500 font-medium">تكلفة البضاعة</p>
                <p className="text-xl font-bold mt-1 text-orange-600">{fmt(plTotals.cogs)} ر.س</p>
              </div>
              <div className="card p-4 border-2 border-blue-200 bg-blue-50">
                <p className="text-xs text-blue-600 font-medium">الربح التشغيلي</p>
                <p className={`text-xl font-bold mt-1 ${plTotals.operationalProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {fmt(plTotals.operationalProfit)} ر.س
                </p>
              </div>
              <div className="card p-4 border-2 border-emerald-200 bg-emerald-50">
                <p className="text-xs text-emerald-600 font-medium">ضريبة قابلة للاسترداد</p>
                <p className="text-xl font-bold mt-1 text-emerald-700">{fmt(plTotals.vatOnFees)} ر.س</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500 font-medium">الربح بعد احتساب الضريبة كمصروف</p>
                <p className={`text-xl font-bold mt-1 ${plTotals.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {fmt(plTotals.netProfit)} ر.س
                </p>
              </div>
            </div>
          )}


          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {settings.vatRegistered ? (
                    ['الشهر', 'الإيرادات', 'الرسوم قبل VAT', 'VAT الرسوم', 'تكلفة البضاعة', 'الربح التشغيلي', 'الربح (الضريبة كمصروف)'].map(h => (
                      <th key={h} className="table-th">{h}</th>
                    ))
                  ) : (
                    ['الشهر', 'الإيرادات', 'الرسوم', 'تكلفة البضاعة', 'مجمل الربح', 'صافي الربح'].map(h => (
                      <th key={h} className="table-th">{h}</th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={settings.vatRegistered ? 7 : 6} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
                ) : plRows.length === 0 ? (
                  <tr><td colSpan={settings.vatRegistered ? 7 : 6} className="table-td text-center py-10 text-slate-400">لا توجد بيانات لهذه السنة</td></tr>
                ) : plRows.map(r => (
                  <tr key={r.month} className="hover:bg-slate-50">
                    <td className="table-td font-medium">{r.month}</td>
                    <td className="table-td text-emerald-600">{fmt(r.revenue)}</td>
                    {settings.vatRegistered ? (
                      <>
                        <td className="table-td text-amber-600">{fmt(r.feesBeforeVat)}</td>
                        <td className="table-td text-slate-500">{fmt(r.vatOnFees)}</td>
                        <td className="table-td text-orange-600">{fmt(r.cogs)}</td>
                        <td className={`table-td font-semibold ${r.operationalProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                          {fmt(r.operationalProfit)}
                        </td>
                        <td className={`table-td font-semibold ${r.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {fmt(r.netProfit)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="table-td text-amber-600">{fmt(r.totalFees)}</td>
                        <td className="table-td text-orange-600">{fmt(r.cogs)}</td>
                        <td className="table-td">{fmt(r.grossProfit)}</td>
                        <td className={`table-td font-semibold ${r.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {fmt(r.netProfit)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Sales Tab */}
      {tab === 'sales' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 flex-1 ml-4">
              {[
                { label: 'وحدات', value: salesTotals.units.toLocaleString('ar-SA'), color: 'text-slate-700' },
                { label: 'إيرادات', value: `${fmt(salesTotals.revenue)} ر.س`, color: 'text-emerald-600' },
                { label: 'رسوم', value: `${fmt(salesTotals.fees)} ر.س`, color: 'text-amber-600' },
                { label: 'تكلفة', value: `${fmt(salesTotals.cogs)} ر.س`, color: 'text-orange-600' },
                { label: 'ربح', value: `${fmt(salesTotals.profit)} ر.س`, color: salesTotals.profit >= 0 ? 'text-emerald-600' : 'text-red-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="card p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`font-bold text-sm mt-0.5 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <select className="input w-36 text-sm flex-shrink-0" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="revenue">ترتيب: الإيرادات</option>
              <option value="profit">ترتيب: الربح</option>
              <option value="units">ترتيب: الوحدات</option>
            </select>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['كود التاجر / SKU', 'الاسم', 'الماركة', 'الوحدات', 'الإيرادات', 'الرسوم', 'التكلفة', 'الربح'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
                ) : salesRows.length === 0 ? (
                  <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">لا توجد بيانات</td></tr>
                ) : salesRows.map(r => (
                  <tr key={r.sku} className="hover:bg-slate-50">
                    <td className="table-td">
                      {r.partnerSku && <div className="font-mono text-xs font-semibold text-brand-700">{r.partnerSku}</div>}
                      <div className="font-mono text-xs text-slate-500">{r.sku}</div>
                    </td>
                    <td className="table-td">{r.name || '—'}</td>
                    <td className="table-td">{r.brand || '—'}</td>
                    <td className="table-td">{r.units.toLocaleString('ar-SA')}</td>
                    <td className="table-td text-emerald-600">{fmt0(r.revenue)}</td>
                    <td className="table-td text-amber-600">{fmt0(r.fees)}</td>
                    <td className="table-td text-orange-600">{fmt0(r.cogs)}</td>
                    <td className={`table-td font-semibold ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmt0(r.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Fees Tab */}
      {tab === 'fees' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'وحدات',                  value: feesTotals.units.toLocaleString('ar-SA'),   color: 'text-slate-700' },
              { label: 'عمولة + FBN (بالطلب)',   value: `${fmt(feesTotals.totalFees)} ر.س`,         color: 'text-amber-600' },
              { label: 'رسوم الكشف الشهري',       value: `${fmt(stmtFees.total)} ر.س`,              color: 'text-amber-600' },
              { label: 'إجمالي الرسوم',           value: `${fmt(grandTotalFees)} ر.س`,              color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-4">
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['كود التاجر / SKU', 'الماركة', 'الوحدات', 'الإيرادات', 'عمولة نون', 'رسوم FBN', 'إجمالي الرسوم', 'نسبة الرسوم'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
                ) : feesRows.length === 0 ? (
                  <tr><td colSpan={8} className="table-td text-center py-10 text-slate-400">لا توجد بيانات</td></tr>
                ) : feesRows.map(r => (
                  <tr key={r.sku} className="hover:bg-slate-50">
                    <td className="table-td">
                      {r.partnerSku && <div className="font-mono text-xs font-semibold text-brand-700">{r.partnerSku}</div>}
                      <div className="font-mono text-xs text-slate-500">{r.sku}</div>
                    </td>
                    <td className="table-td">{r.brand || '—'}</td>
                    <td className="table-td">{r.units.toLocaleString('ar-SA')}</td>
                    <td className="table-td text-emerald-600">{fmt0(r.revenue)}</td>
                    <td className="table-td text-amber-600">{fmt0(r.referralFees)}</td>
                    <td className="table-td text-amber-600">{fmt0(r.fbnFees)}</td>
                    <td className="table-td text-red-600 font-medium">{fmt0(r.totalFees)}</td>
                    <td className="table-td">
                      <span className={`font-semibold ${r.feeRate > 30 ? 'text-red-600' : r.feeRate > 20 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {r.feeRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── رسوم نون من الملف الشهري ── */}
          {!loading && stmtFees.total > 0 && (
            <div className="card p-5 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-slate-800">رسوم نون من الملف الشهري</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Statement Fee · Service Fee — على مستوى الكشف، لا تُخصَّص لـ SKU</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-slate-400">الإجمالي شامل VAT</p>
                  <p className="text-xl font-bold text-red-600">{fmt(stmtFees.total)} ر.س</p>
                  <p className="text-xs text-slate-400 mt-0.5">بدون VAT: {fmt(stmtFees.totalExclVat)} · VAT: {fmt(stmtFees.totalVat)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
                {Object.entries(stmtFees.byCategory).map(([cat, amount]) => (
                  <div key={cat} className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                    <p className="text-xs text-amber-700 font-medium">{FEE_CAT_LABELS[cat] ?? cat}</p>
                    <p className="text-base font-bold text-amber-800 mt-1">{fmt(amount)} ر.س</p>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['نوع الرسوم', 'الوصف', 'الفئة', 'بدون VAT', 'VAT', 'شامل VAT'].map(h => (
                        <th key={h} className="table-th text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stmtFees.rows.map((f, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="table-td text-xs text-slate-500">{f.feeType}</td>
                        <td className="table-td text-xs">{f.description || '—'}</td>
                        <td className="table-td text-xs text-amber-700">{FEE_CAT_LABELS[f.category] ?? f.category}</td>
                        <td className="table-td text-xs tabular-nums">{fmt(f.exclVat)}</td>
                        <td className="table-td text-xs tabular-nums text-slate-400">{fmt(f.vatAmount)}</td>
                        <td className="table-td text-xs tabular-nums font-medium text-red-600">{fmt(f.inclVat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
