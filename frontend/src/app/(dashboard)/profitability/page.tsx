'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { profitability as api, downloadExport } from '@/lib/api';
import type { ProfitabilityRow, StatementFeeSummary } from '@/lib/types';
import { Badge, profitBadge } from '@/components/ui/badge';

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

export default function ProfitabilityPage() {
  const [rows, setRows]             = useState<ProfitabilityRow[]>([]);
  const [stmtFees, setStmtFees]     = useState<StatementFeeSummary>(EMPTY_STMT);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => {
    api.list()
      .then(r => { setRows(r.rows); setStmtFees(r.statementFees ?? EMPTY_STMT); })
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل بيانات الربحية'))
      .finally(() => setLoading(false));
  }, []);

  const fmt  = (n: number) => n.toFixed(2);
  const fmtN = (n: number) => n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">تحليل الربحية</h1>
          <p className="text-slate-500 text-sm mt-1">ربحية لكل SKU · مرتبة تنازلياً حسب الربح للوحدة</p>
        </div>
        <button
          onClick={async () => { try { await downloadExport('profitability'); } catch(e) { setError(String(e)); } }}
          disabled={loading}
          className="btn-ghost flex items-center gap-1.5 text-sm border border-slate-200"
        >
          <Download size={14} />
          تصدير Excel
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="card overflow-x-auto mb-6">
        <table className="w-full">
          <thead>
            <tr>
              {['SKU', 'الاسم', 'الوحدات', 'الإيرادات', 'الرسوم', 'تكلفة البضاعة', 'الربح', 'الربح / وحدة', 'التصنيف'].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">لا توجد بيانات</td></tr>
            ) : rows.map(r => {
              const { label, variant } = profitBadge(r.badge);
              return (
                <tr key={r.sku} className="hover:bg-slate-50">
                  <td className="table-td font-mono text-xs">{r.sku}</td>
                  <td className="table-td">{r.nameEn ?? '—'}</td>
                  <td className="table-td">{r.units}</td>
                  <td className="table-td">{fmt(r.revenue)}</td>
                  <td className="table-td text-amber-600">{fmt(r.fees)}</td>
                  <td className="table-td text-orange-600">{fmt(r.cogs)}</td>
                  <td className={`table-td font-medium ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(r.profit)}</td>
                  <td className={`table-td font-semibold ${r.profitPerUnit >= 2 ? 'text-emerald-600' : r.profitPerUnit >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                    {fmt(r.profitPerUnit)} ر.س
                  </td>
                  <td className="table-td"><Badge label={label} variant={variant} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Statement-level fees — cannot be allocated per SKU */}
      {!loading && stmtFees.total > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">رسوم نون من الملف الشهري</h2>
              <p className="text-xs text-slate-400 mt-0.5">رسوم على مستوى الكشف — لا يمكن تخصيصها لـ SKU محدد</p>
            </div>
            <div className="text-left">
              <p className="text-xs text-slate-400">إجمالي الرسوم (شامل VAT)</p>
              <p className="text-lg font-bold text-red-600">{fmtN(stmtFees.total)} ر.س</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
            {Object.entries(stmtFees.byCategory).map(([cat, amount]) => (
              <div key={cat} className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium">{FEE_CAT_LABELS[cat] ?? cat}</p>
                <p className="text-base font-bold text-amber-800 mt-1">{fmtN(amount)} ر.س</p>
              </div>
            ))}
          </div>

          {stmtFees.rows.length > 0 && (
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
                      <td className="table-td text-xs tabular-nums">{fmtN(f.exclVat)}</td>
                      <td className="table-td text-xs tabular-nums text-slate-400">{fmtN(f.vatAmount)}</td>
                      <td className="table-td text-xs tabular-nums font-medium text-red-600">{fmtN(f.inclVat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
