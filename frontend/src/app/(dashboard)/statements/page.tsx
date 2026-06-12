'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText, RefreshCw, AlertCircle, CheckCircle2, AlertTriangle,
  Search, Filter, TrendingUp, DollarSign, BarChart2, Eye,
  ChevronDown, ChevronUp, Percent,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { statements as api } from '@/lib/api';
import type { StatementRow, StatementKpis } from '@/lib/types';
import { FinancialPeriodFilter, usePeriodFilter, periodToParams } from '@/components/ui/financial-period-filter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAR = (n: number | null | undefined, fallback = '—') =>
  n == null ? fallback : n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';

const NUM = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    matched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rounding: 'bg-amber-50 text-amber-700 border-amber-200',
    review:  'bg-red-50 text-red-600 border-red-200',
  };
  const label: Record<string, string> = {
    matched: 'مطابق',
    rounding: 'فرق تقريب',
    review:  'يحتاج مراجعة',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${map[status] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
      {label[status] ?? status}
    </span>
  );
}

function ProfitBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-300 text-xs">—</span>;
  const color = value >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold';
  return <span className={`tabular-nums text-xs ${color}`}>{NUM(value)}</span>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = 'slate', icon: Icon,
}: {
  label: string; value: string; sub?: string;
  color?: 'slate' | 'emerald' | 'blue' | 'amber' | 'violet' | 'red';
  icon: LucideIcon;
}) {
  const bg: Record<string, string> = {
    slate:   'bg-slate-50 border-slate-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    blue:    'bg-blue-50 border-blue-200',
    amber:   'bg-amber-50 border-amber-200',
    violet:  'bg-violet-50 border-violet-200',
    red:     'bg-red-50 border-red-200',
  };
  const ic: Record<string, string> = {
    slate:   'text-slate-400',
    emerald: 'text-emerald-600',
    blue:    'text-blue-600',
    amber:   'text-amber-600',
    violet:  'text-violet-600',
    red:     'text-red-500',
  };
  const vl: Record<string, string> = {
    slate:   'text-slate-800',
    emerald: 'text-emerald-800',
    blue:    'text-blue-800',
    amber:   'text-amber-800',
    violet:  'text-violet-800',
    red:     'text-red-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${bg[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <Icon size={15} className={ic[color]} />
      </div>
      <p className={`text-lg font-bold tabular-nums ${vl[color]}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatementsPage() {
  const [kpiPeriod, setKpiPeriod] = usePeriodFilter();
  const [kpis, setKpis]       = useState<StatementKpis | null>(null);
  const [rows, setRows]       = useState<StatementRow[]>([]);
  const [vatReg, setVatReg]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filters
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [startDate, setStart]   = useState('');
  const [endDate, setEnd]       = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const kpiPeriodKey = [kpiPeriod.periodType, kpiPeriod.year, kpiPeriod.month, kpiPeriod.from, kpiPeriod.to].join(':');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [k, data] = await Promise.all([
        api.kpis(periodToParams(kpiPeriod)),
        api.list({ search: search || undefined, status: status || undefined, startDate: startDate || undefined, endDate: endDate || undefined }),
      ]);
      setKpis(k);
      setRows(data.statements);
      setVatReg(data.vatRegistered);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل الكشوفات');
    } finally {
      setLoading(false);
    }
  }, [search, status, startDate, endDate, kpiPeriodKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  function toggleExpand(ref: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(ref) ? n.delete(ref) : n.add(ref);
      return n;
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText size={20} className="text-orange-600" />
            كشوفات نون
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            الكشوفات المالية المستوردة من Transaction View — مطابقة وربحية لكل دورة
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* ── KPI period filter ── */}
      <FinancialPeriodFilter value={kpiPeriod} onChange={setKpiPeriod} />

      {/* ── KPI cards ── */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard label="عدد الكشوفات"            value={kpis.totalStatements.toLocaleString('ar-SA')}        color="slate"   icon={FileText}     />
          <KpiCard label="مطابقة"                   value={kpis.matchedStatements.toLocaleString('ar-SA')}      color="emerald" icon={CheckCircle2} />
          <KpiCard label="تحتاج مراجعة"             value={kpis.reviewStatements.toLocaleString('ar-SA')}       color="red"     icon={AlertTriangle} />
          <KpiCard label="إجمالي صافي نون"          value={SAR(kpis.totalNetProceeds)}                          color="blue"    icon={DollarSign}   />
          <KpiCard label="إجمالي الرسوم"            value={SAR(kpis.totalFees)}                                 color="amber"   icon={BarChart2}    />
          <KpiCard label="ضريبة الرسوم"             value={SAR(kpis.totalVat)}                                  color="violet"  icon={Percent}      />
          <KpiCard
            label={kpis.vatRegistered ? 'الربح التشغيلي' : 'الربح الصافي'}
            value={SAR(kpis.totalProfit)}
            color={kpis.totalProfit >= 0 ? 'emerald' : 'red'}
            icon={TrendingUp}
          />
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
          <Search size={14} className="text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم الكشف…"
            className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
          />
          <button
            onClick={() => setShowFilters(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-50"
          >
            <Filter size={11} />
            فلاتر
            {showFilters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>

        {showFilters && (
          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100 bg-slate-50/50">
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">الحالة</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none bg-white text-slate-700"
              >
                <option value="">الكل</option>
                <option value="matched">مطابق</option>
                <option value="rounding">فرق تقريب</option>
                <option value="review">يحتاج مراجعة</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">من تاريخ</label>
              <input type="date" value={startDate} onChange={e => setStart(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none bg-white text-slate-700" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">إلى تاريخ</label>
              <input type="date" value={endDate} onChange={e => setEnd(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none bg-white text-slate-700" />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setSearch(''); setStatus(''); setStart(''); setEnd(''); }}
                className="w-full text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-white transition-colors"
              >
                مسح الفلاتر
              </button>
            </div>
          </div>
        )}

        {/* ── Table ── */}
        {error && (
          <div className="mx-4 my-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  '', 'رقم الكشف', 'التاريخ', 'صافي العوائد',
                  'رسوم نون', 'إجمالي الكشف', 'ضريبة الرسوم',
                  'صافي بعد VAT', 'تكلفة البضاعة',
                  vatReg ? 'الربح التشغيلي' : 'الربح الصافي',
                  'حالة المطابقة', 'تاريخ الرفع', '',
                ].map(h => (
                  <th key={h} className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center">
                    <RefreshCw size={18} className="mx-auto text-slate-300 animate-spin mb-2" />
                    <p className="text-slate-400 text-xs">جارٍ التحميل…</p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-20 text-center">
                    <FileText size={32} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-slate-600 font-semibold text-sm">لا توجد كشوفات بعد</p>
                    <p className="text-slate-400 text-xs mt-1 mb-4">
                      ارفع ملف Transaction View من نون لإنشاء كشوف مطابقة
                    </p>
                    <Link
                      href="/import"
                      className="inline-flex items-center gap-1.5 text-xs px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
                    >
                      الذهاب للاستيراد
                    </Link>
                  </td>
                </tr>
              ) : rows.map(row => {
                const isExpanded = expanded.has(row.referenceNr);
                return (
                  <>
                    <tr key={row.referenceNr} className="hover:bg-slate-50 transition-colors">
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => toggleExpand(row.referenceNr)}
                          className="p-1 text-slate-300 hover:text-slate-600 rounded"
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/statements/${encodeURIComponent(row.referenceNr)}`}
                          className="font-mono text-[11px] text-blue-700 hover:text-blue-900 hover:underline whitespace-nowrap"
                        >
                          {row.referenceNr}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {row.statementDate ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-xs text-slate-700">{NUM(row.netProceeds)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-xs text-red-600">{NUM(row.feesExclVat)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-xs font-semibold text-slate-800">{NUM(row.statementTotal)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-xs text-slate-500">
                        {NUM(row.statementVat)}
                        {row.vatEstimated && (
                          <span className="text-[9px] text-amber-500 mr-0.5" title="قيمة تقديرية">~</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-xs font-bold text-emerald-700">{NUM(row.netAfterVat)}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {row.cogs != null
                          ? <span className="tabular-nums text-slate-600">{NUM(row.cogs)}</span>
                          : <span className="text-slate-300 text-[11px]">غير محدد</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <ProfitBadge value={row.activeProfit} />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-400 whitespace-nowrap">
                        {row.importedAt ? new Date(row.importedAt).toLocaleDateString('ar-SA') : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/statements/${encodeURIComponent(row.referenceNr)}`}
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors"
                          title="عرض التفاصيل"
                        >
                          <Eye size={12} />
                          <span>تفاصيل</span>
                        </Link>
                      </td>
                    </tr>

                    {/* Expanded quick-view */}
                    {isExpanded && (
                      <tr key={`${row.referenceNr}-exp`} className="bg-slate-50/80">
                        <td colSpan={13} className="px-5 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-1.5 text-[12px]">
                            <span className="text-slate-500">طلبات: <b className="text-slate-800">{row.orderRowsCount}</b></span>
                            <span className="text-slate-500">تحديثات: <b className="text-slate-800">{row.orderUpdateRowsCount}</b></span>
                            <span className="text-slate-500">دفعات متجاهلة: <b className="text-amber-700">{row.ignoredPaymentRowsCount}</b></span>
                            <span className="text-slate-500">تحويلات متجاهلة: <b className="text-amber-700">{row.ignoredBalanceTransferRowsCount}</b></span>
                            <span className="text-slate-500">الرسوم شامل VAT: <b className="text-red-600">{NUM(row.feesInclVat)}</b></span>
                            <span className="text-slate-500">الفرق: <b className={Math.abs(row.difference) <= 0.2 ? 'text-emerald-600' : 'text-amber-600'}>{row.difference >= 0 ? '+' : ''}{NUM(row.difference)}</b></span>
                            <span className="text-slate-500">ملف: <b className="text-slate-700 font-mono text-[11px]">{row.fileName ?? '—'}</b></span>
                            {vatReg && row.operationalProfit != null && (
                              <span className="text-slate-500">الربح التشغيلي: <b className="text-violet-700">{NUM(row.operationalProfit)}</b></span>
                            )}
                            {!vatReg && row.profitAfterVat != null && (
                              <span className="text-slate-500">الربح بعد VAT: <b className="text-emerald-700">{NUM(row.profitAfterVat)}</b></span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">{rows.length} كشف</p>
            <p className="text-xs text-slate-400">
              {vatReg ? 'يتم عرض الربح التشغيلي (قبل VAT)' : 'يتم عرض الربح بعد استقطاع VAT الرسوم'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

