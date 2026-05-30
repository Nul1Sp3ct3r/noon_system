'use client';

import { useEffect, useState } from 'react';
import { platformAdmin } from '@/lib/api';
import { PlatformAdminGuard } from '@/components/platform-admin-guard';
import type { Plan } from '@/lib/types';
import { CheckCircle2, RefreshCw, AlertCircle, Layers, Zap } from 'lucide-react';

export default function PlansPage() {
  return (
    <PlatformAdminGuard>
      <PlansContent />
    </PlatformAdminGuard>
  );
}

function PlansContent() {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [seeding, setSeeding] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setPlans(await platformAdmin.listPlans());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }

  async function seed() {
    setSeeding(true);
    try {
      await platformAdmin.seedPlans();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل إنشاء الباقات');
    } finally {
      setSeeding(false);
    }
  }

  useEffect(() => { load(); }, []);

  const basic = plans.find(p => p.code === 'basic');
  const pro   = plans.find(p => p.code === 'pro');

  // Derive comparison from pro features minus basic
  const basicFeatures = basic?.features ?? [];
  const proOnlyFeatures = (pro?.features ?? []).filter(f => !basicFeatures.includes(f));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الباقات</h1>
          <p className="text-slate-500 text-sm mt-1">خطط الاشتراك في PreciseFlow</p>
        </div>
        <div className="flex items-center gap-2">
          {plans.length === 0 && (
            <button onClick={seed} disabled={seeding} className="btn-primary text-sm">
              {seeding ? 'جارٍ الإنشاء…' : 'إنشاء الباقات الافتراضية'}
            </button>
          )}
          <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} /> تحديث
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading && (
        <p className="text-slate-400 text-center py-16">جارٍ التحميل…</p>
      )}

      {!loading && plans.length === 0 && (
        <div className="card p-12 text-center">
          <Layers size={40} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-2">لا توجد باقات بعد</p>
          <p className="text-slate-400 text-sm">اضغط على "إنشاء الباقات الافتراضية" لإضافة Basic وPro</p>
        </div>
      )}

      {!loading && plans.length > 0 && (
        <>
          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Basic */}
            {basic && (
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Layers size={20} className="text-slate-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-slate-900">Basic</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${basic.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {basic.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </div>
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-bold text-slate-900">{Number(basic.monthlyPrice).toLocaleString('ar-SA')}</span>
                  <span className="text-slate-500 text-sm">ر.س / شهرياً</span>
                </div>
                <p className="text-slate-400 text-xs mb-6">
                  أو {Number(basic.yearlyPrice).toLocaleString('ar-SA')} ر.س سنوياً
                </p>
                <ul className="space-y-2">
                  {basic.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pro */}
            {pro && (
              <div className="card p-6 border-brand-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-brand-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                  الأكثر شيوعاً
                </div>
                <div className="flex items-center gap-3 mb-4 mt-2">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
                    <Zap size={20} className="text-brand-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-slate-900">Pro</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pro.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {pro.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </div>
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-bold text-brand-700">{Number(pro.monthlyPrice).toLocaleString('ar-SA')}</span>
                  <span className="text-slate-500 text-sm">ر.س / شهرياً</span>
                </div>
                <p className="text-slate-400 text-xs mb-6">
                  أو {Number(pro.yearlyPrice).toLocaleString('ar-SA')} ر.س سنوياً
                </p>
                <ul className="space-y-2">
                  {pro.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle2 size={14} className={proOnlyFeatures.includes(f) ? 'text-brand-600 shrink-0' : 'text-emerald-500 shrink-0'} />
                      {f}
                      {proOnlyFeatures.includes(f) && (
                        <span className="text-[9px] font-bold text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded">PRO</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>

          {/* Comparison table */}
          {basic && pro && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">مقارنة الباقات</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="table-th">الميزة</th>
                      <th className="table-th text-center w-28">Basic</th>
                      <th className="table-th text-center w-28 text-brand-600">Pro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pro.features.map((f, i) => {
                      const inBasic = basic.features.includes(f);
                      return (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                          <td className="table-td">{f}</td>
                          <td className="table-td text-center">
                            {inBasic
                              ? <CheckCircle2 size={16} className="text-emerald-500 mx-auto" />
                              : <span className="text-slate-300">—</span>
                            }
                          </td>
                          <td className="table-td text-center">
                            <CheckCircle2 size={16} className="text-brand-600 mx-auto" />
                          </td>
                        </tr>
                      );
                    })}
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
