'use client';

import { useState } from 'react';
import { Calculator, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { calculator, CalcResult } from '@/lib/api';

const fmt = (n: number) =>
  n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CalculatorPage() {
  const [form, setForm] = useState({
    cost:            '',
    costIncludesVat: false,
    commissionRate:  '8',
    shippingFee:     '0',
    storageFee:      '0',
    adsFee:          '0',
    otherFees:       '0',
    targetMargin:    '20',
  });
  const [result, setResult]   = useState<CalcResult | null>(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  function set(key: string, value: string | boolean) {
    setForm(f => ({ ...f, [key]: value }));
    setResult(null);
    setError('');
  }

  async function handleCalculate() {
    if (!form.cost || isNaN(Number(form.cost))) {
      setError('يرجى إدخال تكلفة صحيحة');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await calculator.calculate({
        cost:            parseFloat(form.cost),
        costIncludesVat: form.costIncludesVat,
        commissionRate:  parseFloat(form.commissionRate) || 0,
        shippingFee:     parseFloat(form.shippingFee)  || 0,
        storageFee:      parseFloat(form.storageFee)   || 0,
        adsFee:          parseFloat(form.adsFee)       || 0,
        otherFees:       parseFloat(form.otherFees)    || 0,
        targetMargin:    parseFloat(form.targetMargin) || 0,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ في الحساب');
    } finally {
      setLoading(false);
    }
  }

  const profitable = result && result.netProfit > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">حاسبة التسعير</h1>
        <p className="text-slate-500 text-sm mt-1">احسب سعر البيع المثالي لتحقيق الهامش المستهدف</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="card p-6 space-y-5">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Calculator size={18} className="text-brand-600" />
            بيانات المنتج
          </h2>

          {/* Cost */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">تكلفة الوحدة (ر.س)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost}
              onChange={e => set('cost', e.target.value)}
              className="input w-full"
              placeholder="مثال: 50.00"
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="costIncludesVat"
                checked={form.costIncludesVat}
                onChange={e => set('costIncludesVat', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="costIncludesVat" className="text-sm text-slate-600">
                التكلفة تشمل ضريبة القيمة المضافة (15%)
              </label>
            </div>
          </div>

          {/* Commission */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">نسبة العمولة لنون (%)</label>
            <input
              type="number"
              min="0"
              max="99"
              step="0.1"
              value={form.commissionRate}
              onChange={e => set('commissionRate', e.target.value)}
              className="input w-full"
            />
          </div>

          {/* Target Margin */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">هامش الربح المستهدف (%)</label>
            <input
              type="number"
              min="0"
              max="99"
              step="0.1"
              value={form.targetMargin}
              onChange={e => set('targetMargin', e.target.value)}
              className="input w-full"
            />
          </div>

          {/* Fixed Fees */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">رسوم ثابتة إضافية (بدون ضريبة)</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'shippingFee', label: 'رسوم الشحن' },
                { key: 'storageFee',  label: 'رسوم التخزين' },
                { key: 'adsFee',      label: 'رسوم الإعلانات' },
                { key: 'otherFees',   label: 'رسوم أخرى' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-slate-500 mb-1">{label}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={(form as any)[key]}
                    onChange={e => set(key, e.target.value)}
                    className="input w-full text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleCalculate}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Calculator size={16} />
            {loading ? 'جارٍ الحساب…' : 'احسب'}
          </button>
        </div>

        {/* Results */}
        <div className="card p-6">
          <h2 className="font-semibold text-slate-800 mb-4">نتائج التسعير</h2>

          {!result ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              أدخل البيانات واضغط «احسب» لعرض النتائج
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selling price — highlighted */}
              <div className={`rounded-xl p-5 text-center border-2 ${profitable ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
                <p className="text-sm text-slate-500 mb-1">سعر البيع المقترح (شامل الضريبة)</p>
                <p className={`text-4xl font-bold ${profitable ? 'text-emerald-700' : 'text-red-700'}`}>
                  {fmt(result.sellingInclVat)} ر.س
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  بدون الضريبة: {fmt(result.sellingExclVat)} ر.س
                </p>
              </div>

              {/* Breakdown */}
              <div className="space-y-2 text-sm">
                {[
                  { label: 'التكلفة (بدون ضريبة)', value: result.costExclVat, highlight: false },
                  { label: 'الرسوم الثابتة', value: result.fixedFeesExcl, highlight: false },
                  { label: 'عمولة نون', value: result.commissionAmount, highlight: false },
                  { label: 'إجمالي الرسوم (بدون ضريبة)', value: result.feesTotalExcl, highlight: false },
                  { label: 'ضريبة المدخلات (رسوم نون)', value: result.inputVatNoon, highlight: false },
                  { label: 'ضريبة المخرجات', value: result.outputVat, highlight: false },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-medium text-slate-800 font-mono">{fmt(value)} ر.س</span>
                  </div>
                ))}
              </div>

              {/* Net profit */}
              <div className={`rounded-lg p-4 flex items-center justify-between ${profitable ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  {profitable
                    ? <TrendingUp size={18} className="text-emerald-600" />
                    : <TrendingDown size={18} className="text-red-600" />}
                  <span className={`font-semibold text-sm ${profitable ? 'text-emerald-700' : 'text-red-700'}`}>
                    صافي الربح
                  </span>
                </div>
                <div className="text-left rtl:text-right">
                  <p className={`text-xl font-bold ${profitable ? 'text-emerald-700' : 'text-red-700'}`}>
                    {fmt(result.netProfit)} ر.س
                  </p>
                  <p className="text-xs text-slate-500">هامش فعلي: {result.actualMarginPct.toFixed(2)}%</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
