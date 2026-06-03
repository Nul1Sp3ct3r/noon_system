'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { orgSettings } from '@/lib/api';
import type { CompanySettings } from '@/lib/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettings>({
    vatRegistered: false,
    vatNumber: null,
    profitMode: 'expense',
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  useEffect(() => {
    orgSettings.get()
      .then(s => setSettings(s))
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل الإعدادات'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (settings.vatRegistered && !settings.vatNumber?.trim()) {
      setError('رقم التسجيل الضريبي مطلوب عند تفعيل ضريبة القيمة المضافة');
      return;
    }

    setSaving(true);
    try {
      const updated = await orgSettings.update(settings);
      setSettings(updated);
      setSuccess('تم حفظ الإعدادات بنجاح');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  }

  function handleVatToggle(checked: boolean) {
    setSettings(prev => ({
      ...prev,
      vatRegistered: checked,
      profitMode: checked ? 'recoverable' : 'expense',
      vatNumber: checked ? prev.vatNumber : null,
    }));
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">الإعدادات</h1>

      {loading ? (
        <div className="card p-8 text-center text-slate-400 text-sm">جارٍ التحميل…</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              {success}
            </div>
          )}

          {/* ── VAT Registration ── */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-slate-800 text-base">الضرائب</h2>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.vatRegistered}
                onChange={e => handleVatToggle(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">مسجل في ضريبة القيمة المضافة</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  عند التفعيل، يتم تقسيم رسوم نون إلى مبلغ قبل الضريبة وضريبة قابلة للاسترداد
                </p>
              </div>
            </label>

            {settings.vatRegistered && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  رقم التسجيل الضريبي
                  <span className="text-red-500 mr-1">*</span>
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="300XXXXXXXXX1003"
                  value={settings.vatNumber ?? ''}
                  onChange={e => setSettings(prev => ({ ...prev, vatNumber: e.target.value }))}
                  required={settings.vatRegistered}
                />
              </div>
            )}
          </div>

          {/* ── Profit Calculation Mode ── */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-slate-800 text-base">طريقة احتساب الربح</h2>
            <p className="text-xs text-slate-500">
              تحدد كيفية التعامل مع ضريبة القيمة المضافة على الرسوم عند حساب الربح
            </p>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="profitMode"
                value="expense"
                checked={settings.profitMode === 'expense'}
                onChange={() => setSettings(prev => ({ ...prev, profitMode: 'expense' }))}
                className="mt-0.5 h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">احتساب الضريبة كمصروف</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  الربح = صافي المبيعات − إجمالي الرسوم (شامل الضريبة) − تكلفة البضاعة
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="profitMode"
                value="recoverable"
                checked={settings.profitMode === 'recoverable'}
                onChange={() => setSettings(prev => ({ ...prev, profitMode: 'recoverable' }))}
                className="mt-0.5 h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">استبعاد الضريبة القابلة للاسترداد</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  الربح التشغيلي = صافي المبيعات − الرسوم قبل الضريبة − تكلفة البضاعة
                  {' '}(الضريبة تُعاد كرصيد منفصل)
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary px-6"
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
            </button>
          </div>

        </form>
      )}
    </div>
  );
}
