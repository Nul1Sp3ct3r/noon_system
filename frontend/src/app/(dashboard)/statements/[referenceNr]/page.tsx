'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  FileText, RefreshCw, AlertCircle, ChevronRight,
  CheckCircle2, AlertTriangle, TrendingUp, Package,
  DollarSign, Receipt, ShieldCheck, Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { statements as api } from '@/lib/api';
import type { StatementDetail } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAR = (n: number | null | undefined, fallback = '—') =>
  n == null ? fallback :
  n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';

const NUM = (n: number | null | undefined, fallback = '—') =>
  n == null ? fallback :
  n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    matched:  ['bg-emerald-50 text-emerald-700 border-emerald-200', 'مطابق'],
    rounding: ['bg-amber-50 text-amber-700 border-amber-200',       'فرق تقريب'],
    review:   ['bg-red-50 text-red-600 border-red-200',             'يحتاج مراجعة'],
  };
  const [cls, label] = map[status] ?? ['bg-slate-50 text-slate-600 border-slate-200', status];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, className = '' }: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
        <Icon size={14} className="text-slate-500 shrink-0" />
        <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = 'slate', tooltip }: {
  label: string; value: string; sub?: string;
  color?: 'slate' | 'emerald' | 'blue' | 'amber' | 'violet' | 'red' | 'orange';
  tooltip?: string;
}) {
  const bg: Record<string, string> = {
    slate:   'bg-slate-50 border-slate-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    blue:    'bg-blue-50 border-blue-200',
    amber:   'bg-amber-50 border-amber-200',
    violet:  'bg-violet-50 border-violet-200',
    red:     'bg-red-50 border-red-200',
    orange:  'bg-orange-50 border-orange-200',
  };
  const vl: Record<string, string> = {
    slate:   'text-slate-800',
    emerald: 'text-emerald-800',
    blue:    'text-blue-800',
    amber:   'text-amber-800',
    violet:  'text-violet-800',
    red:     'text-red-700',
    orange:  'text-orange-800',
  };
  return (
    <div className={`rounded-xl border p-4 ${bg[color]}`}>
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <p className="text-xs text-slate-500 font-medium leading-snug">{label}</p>
        {tooltip && (
          <span title={tooltip} className="text-slate-300 hover:text-slate-500 cursor-help mt-0.5">
            <Info size={11} />
          </span>
        )}
      </div>
      <p className={`text-base font-bold tabular-nums ${vl[color]}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Reconciliation row ───────────────────────────────────────────────────────

function ReconRow({ label, value, note, bold, color }: {
  label: string; value: string; note?: string;
  bold?: boolean; color?: string;
}) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-slate-100 last:border-0 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-sm text-slate-600">{label}</span>
      <div className="text-right">
        <span className={`text-sm tabular-nums ${color ?? 'text-slate-800'}`}>{value}</span>
        {note && <p className="text-[10px] text-slate-400 mt-0.5">{note}</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatementDetailPage() {
  const params        = useParams();
  const referenceNr   = decodeURIComponent(params.referenceNr as string);
  const [data, setData]     = useState<StatementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const d = await api.detail(referenceNr);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل تفاصيل الكشف');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [referenceNr]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64" dir="rtl">
        <div className="text-center">
          <RefreshCw size={24} className="mx-auto text-slate-300 animate-spin mb-3" />
          <p className="text-slate-400 text-sm">جارٍ تحميل الكشف…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6" dir="rtl">
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const d = data;
  const profitLabel = d.vatRegistered ? 'الربح التشغيلي' : 'الربح الصافي';
  const profitValue = d.vatRegistered ? d.operationalProfit : d.profitAfterVat;

  return (
    <div className="p-6 space-y-5 max-w-[1200px] mx-auto" dir="rtl">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/statements" className="hover:text-slate-700 transition-colors">كشوفات نون</Link>
        <ChevronRight size={12} className="rotate-180" />
        <span className="font-mono text-slate-700 font-medium">{d.referenceNr}</span>
      </div>

      {/* ── Page header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2 font-mono">
            {d.referenceNr}
          </h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {d.statementDate && (
              <span className="text-sm text-slate-500">{d.statementDate}</span>
            )}
            <StatusBadge status={d.status} />
            {d.vatEstimated && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                ضريبة تقديرية
              </span>
            )}
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
          <RefreshCw size={12} />
          إعادة تحميل
        </button>
      </div>

      {/* ── 1. ملخص الكشف ── */}
      <Section title="ملخص الكشف" icon={FileText}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 text-sm">
          {[
            ['رقم المرجع', <span className="font-mono text-xs">{d.referenceNr}</span>],
            ['تاريخ الكشف', d.statementDate ?? '—'],
            ['ملف الاستيراد', <span className="font-mono text-[11px] text-slate-500 break-all">{d.fileName ?? '—'}</span>],
            ['دُفعة الاستيراد', <span className="font-mono text-[11px] text-slate-500">{d.importBatchId}</span>],
            ['نوع الملف', d.importType ?? '—'],
            ['تاريخ الرفع', d.importedAt ? new Date(d.importedAt).toLocaleString('ar-SA') : '—'],
            ['حالة المطابقة', <StatusBadge status={d.status} />],
            ['حالة الدُفعة', <span className={d.batchStatus === 'completed' ? 'text-emerald-700 font-medium text-xs' : 'text-red-600 text-xs'}>{d.batchStatus === 'completed' ? 'مكتمل' : (d.batchStatus ?? '—')}</span>],
          ].map(([k, v], i) => (
            <div key={i}>
              <p className="text-[11px] text-slate-400 font-medium mb-0.5">{k}</p>
              <div className="text-slate-800 text-sm">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2 text-sm">
          {[
            ['طلبات order', d.orderRowsCount],
            ['تحديثات order_update', d.orderUpdateRowsCount],
            ['دفعات بنكية متجاهلة', d.ignoredPaymentRowsCount],
            ['تحويلات رصيد متجاهلة', d.ignoredBalanceTransferRowsCount],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <p className="text-[11px] text-slate-400 font-medium">{k}</p>
              <p className="text-slate-800 font-semibold">{String(v)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 2 + 3. Reconciliation + Profitability (side-by-side on wide screens) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── 2. مطابقة نون ── */}
        <Section title="مطابقة نون" icon={CheckCircle2}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MetricCard label="صافي العوائد"        value={SAR(d.netProceeds)}   color="blue"    tooltip="مجموع Net Proceeds لطلبات order وorder_update" />
            <MetricCard label="رسوم نون (بدون VAT)"  value={SAR(d.feesExclVat)}  color="amber"   tooltip="الرسوم قبل ضريبة القيمة المضافة" />
            <MetricCard label="إجمالي الكشف"         value={SAR(d.statementTotal)} color="slate"  tooltip="صافي العوائد − رسوم نون = إجمالي الكشف" />
            <MetricCard label="ضريبة الرسوم"         value={SAR(d.statementVat)} color={d.vatEstimated ? 'orange' : 'violet'} tooltip={d.vatEstimated ? 'قيمة تقديرية = رسوم × 15%' : 'قيمة فعلية من الكشف'} sub={d.vatEstimated ? 'تقدير' : 'فعلي'} />
            <MetricCard label="صافي بعد VAT"         value={SAR(d.netAfterVat)}  color="emerald" tooltip="إجمالي الكشف − ضريبة الرسوم" />
            <MetricCard label="إجمالي TV"             value={SAR(d.tvTotal)}      color="slate"   tooltip="مجموع عمود Total من ملف Transaction View" />
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">فرق المطابقة</span>
              <div className="text-right">
                <span className={`font-bold tabular-nums ${Math.abs(d.difference) <= 0.2 ? 'text-emerald-700' : Math.abs(d.difference) <= 0.5 ? 'text-amber-700' : 'text-red-600'}`}>
                  {d.difference >= 0 ? '+' : ''}{NUM(d.difference)} ر.س
                </span>
                <StatusBadge status={d.status} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              الفرق = صافي بعد VAT − إجمالي TV · مقبول ≤ 0.50 ر.س
            </p>
          </div>
        </Section>

        {/* ── 3. الربحية ── */}
        <Section title="الربحية" icon={TrendingUp}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MetricCard label="صافي العوائد"          value={SAR(d.netProceeds)}    color="blue"  />
            <MetricCard label="رسوم نون (بدون VAT)"   value={SAR(d.feesExclVat)}   color="amber" />
            <MetricCard
              label="تكلفة البضاعة (COGS)"
              value={d.hasCogs ? SAR(d.totalCogs) : '—'}
              color="slate"
              sub={d.hasCogs ? undefined : 'أضف أسعار التكلفة للمنتجات'}
            />
            {d.vatRegistered ? (
              <>
                <MetricCard label="الربح التشغيلي"      value={d.operationalProfit != null ? SAR(d.operationalProfit) : '—'} color={d.operationalProfit != null && d.operationalProfit >= 0 ? 'emerald' : 'red'} tooltip="إجمالي الكشف − COGS (قبل VAT)" />
                <MetricCard label="ضريبة الرسوم (قابلة للاسترداد)" value={SAR(d.statementVat)} color="violet" tooltip="ضريبة المدخلات على رسوم نون" />
                <MetricCard label="الربح بعد VAT"         value={d.profitAfterVat != null ? SAR(d.profitAfterVat) : '—'} color={d.profitAfterVat != null && d.profitAfterVat >= 0 ? 'emerald' : 'red'} tooltip="صافي بعد VAT − COGS" />
              </>
            ) : (
              <MetricCard label="الربح الصافي"           value={d.profitAfterVat != null ? SAR(d.profitAfterVat) : '—'} color={d.profitAfterVat != null && d.profitAfterVat >= 0 ? 'emerald' : 'red'} tooltip="صافي بعد VAT − COGS" />
            )}
          </div>
          {!d.hasCogs && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
              <AlertTriangle size={12} className="shrink-0" />
              لم يتم تحديد تكلفة بضاعة لمنتجات هذا الكشف. أضف أسعار التكلفة في صفحة المنتجات.
            </div>
          )}
          {d.vatRegistered && (
            <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-xs text-violet-700 mt-2">
              المنشأة مسجلة للضريبة — يمكن استرداد ضريبة رسوم نون ({SAR(d.statementVat)})
            </div>
          )}
        </Section>
      </div>

      {/* ── 4. تفاصيل الرسوم ── */}
      <Section title="تفاصيل الرسوم" icon={Receipt}>
        {d.hasFeeDetail ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['نوع الرسوم', 'الوصف', 'بدون VAT', 'VAT', 'شامل VAT'].map(h => (
                    <th key={h} className="px-3 py-2 text-right font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.feeLines.map((f, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500">{f.feeType}</td>
                    <td className="px-3 py-2 text-slate-700">{f.description ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{NUM(f.exclVat)}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-400">{NUM(f.vatAmount)}</td>
                    <td className="px-3 py-2 tabular-nums font-medium text-amber-700">{NUM(f.inclVat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="الرسوم (بدون VAT)"    value={SAR(d.feesExclVat)}  color="amber"  />
            <MetricCard label="الرسوم (شامل VAT)"    value={SAR(d.feesInclVat)}  color="amber"  />
            <MetricCard label="ضريبة الرسوم (VAT)"   value={SAR(d.statementVat)} color="violet" />
            <MetricCard label="صافي الكشف"            value={SAR(d.statementTotal)} color="slate" />
          </div>
        )}
        {!d.hasFeeDetail && (
          <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1">
            <Info size={11} />
            استورد الكشف الشهري للحصول على تفصيل كامل للرسوم (عمولة نون، FBN، تخزين…)
          </p>
        )}
      </Section>

      {/* ── 7. تفاصيل VAT ── */}
      <Section title="تفاصيل ضريبة القيمة المضافة" icon={ShieldCheck}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <MetricCard label="ضريبة المخرجات (مبيعات)" value={SAR(d.vatOnSales)}      color="blue"    tooltip="صافي العوائد × 15/115" />
          <MetricCard label="ضريبة المدخلات (رسوم)"   value={SAR(d.inputVat)}        color="violet"  tooltip="ضريبة رسوم نون (قابلة للاسترداد)" />
          <MetricCard label="صافي ضريبة القيمة المضافة" value={SAR(d.netVatLiability)} color={d.netVatLiability >= 0 ? 'amber' : 'emerald'} tooltip="ضريبة المخرجات − ضريبة المدخلات" />
          {d.vatRegistered && (
            <MetricCard label="الوضع"  value={d.vatRegistered ? 'مسجل للضريبة' : 'غير مسجل'} color="emerald" />
          )}
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-xs text-slate-500">
          <p className="font-medium text-slate-700 mb-2">معادلة الحساب</p>
          <div className="space-y-1 font-mono text-[11px]">
            <p>ضريبة المخرجات = صافي العوائد × (15 ÷ 115) = {NUM(d.vatOnSales)}</p>
            <p>ضريبة المدخلات = ضريبة رسوم نون = {NUM(d.inputVat)}</p>
            <p className="font-semibold text-slate-700">صافي الضريبة = {NUM(d.vatOnSales)} − {NUM(d.inputVat)} = {NUM(d.netVatLiability)} ر.س</p>
          </div>
        </div>
      </Section>

      {/* ── 5. تفاصيل الطلبات ── */}
      <Section title={`تفاصيل الطلبات (${d.orderRows.length})`} icon={Package}>
        {d.orderRows.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <Package size={28} className="mx-auto text-slate-200 mb-2" />
            <p>لا توجد تفاصيل طلبات — أعد استيراد الملف لربط الطلبات بالكشف</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['رقم الطلب', 'SKU', 'المنتج', 'الحالة', 'صافي العوائد', 'الرسوم', 'التكلفة', 'الربح', 'التاريخ'].map(h => (
                    <th key={h} className="px-3 py-2 text-right font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.orderRows.map((o, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600 whitespace-nowrap">{o.orderNr}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{o.sku ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[180px] truncate text-slate-700" title={o.productTitle ?? undefined}>{o.productTitle ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        o.itemStatus === 'delivered' ? 'bg-emerald-50 text-emerald-700' :
                        o.itemStatus === 'returned'  ? 'bg-red-50 text-red-600' :
                        'bg-slate-50 text-slate-500'
                      }`}>
                        {o.itemStatus === 'delivered' ? 'مُسلَّم' : o.itemStatus === 'returned' ? 'مُرجَع' : o.itemStatus ?? '—'}
                      </span>
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${o.netProceeds >= 0 ? 'text-slate-700' : 'text-red-600'}`}>{NUM(o.netProceeds)}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-400">{o.fees ? NUM(o.fees) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{NUM(o.cogs)}</td>
                    <td className={`px-3 py-2 tabular-nums font-medium ${o.profit != null && o.profit >= 0 ? 'text-emerald-700' : o.profit != null ? 'text-red-600' : 'text-slate-300'}`}>
                      {NUM(o.profit)}
                    </td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                      {o.orderedDate ?? o.deliveredDate ?? o.returnedDate ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── 6. تحديثات الطلبات ── */}
      {d.updateRows.length > 0 && (
        <Section title={`تحديثات الطلبات — order_update (${d.updateRows.length})`} icon={AlertTriangle}>
          <p className="text-xs text-slate-500 mb-3">
            تحديثات تؤثر على رسوم الكشف فقط ولا تعكس مبيعات جديدة
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-amber-50 border-b border-amber-200">
                <tr>
                  {['رقم الطلب', 'SKU', 'المنتج', 'المبلغ (صافي)', 'التاريخ'].map(h => (
                    <th key={h} className="px-3 py-2 text-right font-semibold text-amber-700 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {d.updateRows.map((o, i) => (
                  <tr key={i} className="hover:bg-amber-50/50">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{o.orderNr}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{o.sku ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate text-slate-700">{o.productTitle ?? '—'}</td>
                    <td className={`px-3 py-2 tabular-nums font-medium ${o.netProceeds >= 0 ? 'text-slate-700' : 'text-red-600'}`}>{NUM(o.netProceeds)}</td>
                    <td className="px-3 py-2 text-slate-400">{o.orderedDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── 8. سجل الاستيراد ── */}
      <Section title="سجل الاستيراد" icon={DollarSign}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 text-sm">
          {[
            ['اسم الملف',     <span className="font-mono text-[11px] text-slate-600 break-all">{d.fileName ?? '—'}</span>],
            ['تاريخ الرفع',   d.importedAt ? new Date(d.importedAt).toLocaleString('ar-SA') : '—'],
            ['معرف الدُفعة',  <span className="font-mono text-[11px] text-slate-500">{d.importBatchId}</span>],
            ['الصفوف المستوردة', String(d.rowsImported)],
          ].map(([k, v], i) => (
            <div key={i}>
              <p className="text-[11px] text-slate-400 font-medium mb-0.5">{k}</p>
              <div className="text-slate-800">{v}</div>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}
