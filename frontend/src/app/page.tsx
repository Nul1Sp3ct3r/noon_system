import Link from 'next/link';
import {
  FileSpreadsheet, TrendingUp, Package, Receipt,
  Calculator, BookOpen, BarChart3, CheckCircle2,
  XCircle,
} from 'lucide-react';

// ─── Static data ──────────────────────────────────────────────────────────────

const PAIN_POINTS = [
  { icon: Calculator,      text: 'صعوبة حساب الربحية الحقيقية بعد رسوم نون' },
  { icon: FileSpreadsheet, text: 'رسوم نون غير واضحة ومتداخلة يصعب تتبعها' },
  { icon: Package,         text: 'تتبع المخزون يدوياً وإضاعة الوقت في الجداول' },
  { icon: Receipt,         text: 'احتساب ضريبة القيمة المضافة بشكل خاطئ أو متأخر' },
  { icon: BarChart3,       text: 'صعوبة فهم التسويات والمصاريف الفعلية' },
];

const SOLUTIONS = [
  'استيراد ملفات نون الأسبوعية والشهرية بنقرة واحدة',
  'حساب الربحية الصافية تلقائياً بعد كل الرسوم',
  'إدارة المخزون وحركاته عبر المستودعات',
  'تسجيل المصروفات والفواتير',
  'مركز ضريبة القيمة المضافة',
  'القيود المحاسبية والتقارير المالية',
  'تقارير شاملة قابلة للتصدير في أي وقت',
];

const FEATURES = [
  {
    icon: FileSpreadsheet,
    title: 'استيراد أسبوعي وشهري',
    desc: 'استيراد ملفات نون بشكل تلقائي مع كشف التنسيق الذكي لكل نوع ملف',
  },
  {
    icon: Package,
    title: 'لقطة المخزون',
    desc: 'تتبع المخزون الفعلي وحركاته عبر مستودعات FBN والمرتجعات',
  },
  {
    icon: TrendingUp,
    title: 'ربحية المنتجات',
    desc: 'تحليل ربحية كل منتج بعد رسوم نون والتكاليف والضريبة',
  },
  {
    icon: Calculator,
    title: 'مركز الضريبة',
    desc: 'احتساب ضريبة القيمة المضافة وإعداد الإقرارات الضريبية الدقيقة',
  },
  {
    icon: Receipt,
    title: 'المصروفات والفواتير',
    desc: 'تسجيل وإدارة المصروفات التشغيلية وإصدار الفواتير الاحترافية',
  },
  {
    icon: BookOpen,
    title: 'المحاسبة المتقدمة',
    desc: 'قيود يومية، دفتر أستاذ، ميزان مراجعة، وفترات محاسبية',
  },
];

const COMPARISON: { feature: string; basic: boolean; pro: boolean }[] = [
  { feature: 'استيراد ملفات نون',                basic: true,  pro: true  },
  { feature: 'الطلبات والمبيعات',                basic: true,  pro: true  },
  { feature: 'إدارة المنتجات والمخزون',           basic: true,  pro: true  },
  { feature: 'التقارير المالية',                  basic: true,  pro: true  },
  { feature: 'حساب الربحية',                     basic: true,  pro: true  },
  { feature: 'المصروفات والفواتير',               basic: true,  pro: true  },
  { feature: 'مركز ضريبة القيمة المضافة',         basic: true,  pro: true  },
  { feature: 'القيود المحاسبية',                  basic: false, pro: true  },
  { feature: 'دفتر الأستاذ وميزان المراجعة',      basic: false, pro: true  },
  { feature: 'إدارة الفترات المحاسبية',           basic: false, pro: true  },
  { feature: 'دعم الفريق والصلاحيات',             basic: false, pro: true  },
];

// ─── UI sub-components ────────────────────────────────────────────────────────

function Check({ active }: { active: boolean }) {
  return active
    ? <CheckCircle2 size={18} className="text-emerald-500 mx-auto" />
    : <XCircle size={18} className="text-slate-300 mx-auto" />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm">PreciseFlow</span>
              <span className="text-slate-400 text-xs mr-2">التدفق الدقيق</span>
            </div>
          </div>
          <nav className="flex items-center gap-6">
            <a href="#features" className="text-sm text-slate-600 hover:text-brand-600 transition-colors hidden md:block">
              المميزات
            </a>
            <a href="#pricing" className="text-sm text-slate-600 hover:text-brand-600 transition-colors hidden md:block">
              الأسعار
            </a>
            <Link
              href="/login"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 border border-brand-200 hover:border-brand-400 rounded-lg px-4 py-2 transition-colors"
            >
              تسجيل الدخول
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative bg-slate-900 text-white overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 pointer-events-none" />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-12 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-brand-600/20 border border-brand-500/30 rounded-full px-4 py-1.5 text-brand-300 text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-brand-400" />
            نظام ERP مالي لتجار نون والتجارة الإلكترونية
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-4">
            <span className="text-white">PreciseFlow</span>
          </h1>
          <h2 className="text-2xl md:text-3xl font-bold text-brand-400 mb-6">
            التدفق الدقيق
          </h2>
          <p className="text-xl md:text-2xl text-slate-300 mb-3 leading-relaxed">
            نظام مالي ذكي لتجار نون والتجارة الإلكترونية
          </p>
          <p className="text-slate-500 text-base mb-10">
            استيراد · تحليل · تقارير · محاسبة
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-lg shadow-lg shadow-brand-900/30"
            >
              ابدأ الآن
            </Link>
            <Link
              href="/login"
              className="border border-white/20 hover:border-white/40 hover:bg-white/5 text-white font-medium px-8 py-3.5 rounded-xl transition-colors text-lg"
            >
              تسجيل الدخول
            </Link>
          </div>
        </div>

        {/* Dashboard preview */}
        <div className="relative max-w-4xl mx-auto px-6 pb-16">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm shadow-2xl shadow-black/40">
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'الإيرادات',    color: 'bg-blue-400',    w: '82%' },
                { label: 'صافي الربح',  color: 'bg-emerald-400', w: '63%' },
                { label: 'الطلبات',     color: 'bg-amber-400',   w: '76%' },
                { label: 'الرسوم',      color: 'bg-rose-400',    w: '48%' },
              ].map(({ label, color, w }) => (
                <div key={label} className="bg-white/8 border border-white/10 rounded-xl p-4">
                  <p className="text-slate-400 text-xs mb-2">{label}</p>
                  <div className={`h-4 ${color} rounded-md opacity-70`} style={{ width: w }} />
                  <div className="h-2 bg-white/10 rounded-md mt-1.5" style={{ width: '40%' }} />
                </div>
              ))}
            </div>
            {/* Chart area */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex items-end justify-between gap-1 h-28">
              {[38, 55, 42, 70, 58, 82, 65, 88, 52, 91, 74, 86, 70, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${h}%`,
                    background: `rgba(37, 99, 235, ${0.3 + (h / 100) * 0.5})`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">تحديات تجار نون اليومية</h2>
            <p className="text-slate-500">هل تواجه هذه المشاكل في إدارة متجرك؟</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PAIN_POINTS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-4 bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-red-500" />
                </div>
                <p className="text-slate-700 text-sm leading-relaxed pt-1">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solution ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">
              PreciseFlow — الحل الشامل
            </h2>
            <p className="text-slate-500">كل ما تحتاجه لإدارة الجانب المالي لمتجرك في مكان واحد</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SOLUTIONS.map((sol, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-4 rounded-xl border border-brand-100 bg-brand-50/60 hover:bg-brand-50 transition-colors"
              >
                <CheckCircle2 size={20} className="text-brand-600 shrink-0" />
                <span className="text-slate-700 text-sm">{sol}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">المميزات الرئيسية</h2>
            <p className="text-slate-500">أدوات احترافية مصممة خصيصاً لتجار نون</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:border-brand-200 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
                  <Icon size={22} className="text-brand-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">خطط الأسعار</h2>
            <p className="text-slate-500">طلبات ومنتجات غير محدودة في جميع الخطط</p>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 max-w-3xl mx-auto">

            {/* Basic */}
            <div className="rounded-2xl border-2 border-slate-200 p-8">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 mb-1">Basic</h3>
                <p className="text-slate-500 text-sm">للبائع الفردي — الإدارة اليومية</p>
              </div>
              <div className="mb-2">
                <span className="text-4xl font-bold text-slate-900">149</span>
                <span className="text-slate-500 text-sm mr-1">ر.س / شهرياً</span>
              </div>
              <p className="text-slate-400 text-xs mb-8">أو 1,399 ر.س سنوياً (وفّر شهرين)</p>
              <Link
                href="/login"
                className="block w-full text-center bg-slate-900 hover:bg-slate-800 text-white font-medium py-3.5 rounded-xl transition-colors"
              >
                ابدأ الآن
              </Link>
            </div>

            {/* Pro */}
            <div className="rounded-2xl border-2 border-brand-500 p-8 relative shadow-lg shadow-brand-100">
              <div className="absolute -top-3.5 right-6 bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                الأكثر شيوعاً
              </div>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 mb-1">Pro</h3>
                <p className="text-slate-500 text-sm">للمحاسبة المتقدمة والفرق</p>
              </div>
              <div className="mb-2">
                <span className="text-4xl font-bold text-brand-600">399</span>
                <span className="text-slate-500 text-sm mr-1">ر.س / شهرياً</span>
              </div>
              <p className="text-slate-400 text-xs mb-8">أو 3,999 ر.س سنوياً (وفّر شهرين)</p>
              <Link
                href="/login"
                className="block w-full text-center bg-brand-600 hover:bg-brand-700 text-white font-medium py-3.5 rounded-xl transition-colors"
              >
                ابدأ الآن
              </Link>
            </div>

          </div>

          {/* Comparison table */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden max-w-3xl mx-auto shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">الميزة</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 w-28">Basic</th>
                  <th className="px-6 py-4 text-center text-sm font-bold text-brand-600 w-28">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(({ feature, basic, pro }, i) => (
                  <tr key={feature} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="px-6 py-3.5 text-sm text-slate-700">{feature}</td>
                    <td className="px-6 py-3.5 text-center"><Check active={basic} /></td>
                    <td className="px-6 py-3.5 text-center">
                      {pro
                        ? <CheckCircle2 size={18} className="text-brand-600 mx-auto" />
                        : <XCircle size={18} className="text-slate-300 mx-auto" />
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-brand-600 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
            حوّل ملفات نون إلى قرارات مالية واضحة
          </h2>
          <p className="text-brand-100 text-lg mb-10 leading-relaxed">
            انضم إلى تجار نون الذين يديرون أعمالهم بثقة وبيانات دقيقة
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-brand-50 font-bold px-10 py-4 rounded-xl transition-colors text-lg shadow-lg"
          >
            ابدأ الآن مجاناً
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-sm">P</span>
                </div>
                <div>
                  <p className="text-white font-bold text-sm">PreciseFlow</p>
                  <p className="text-slate-500 text-xs">التدفق الدقيق</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                نظام مالي ذكي لتجار نون والتجارة الإلكترونية
              </p>
            </div>
            {/* Links */}
            <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <Link href="/login" className="hover:text-white transition-colors">
                تسجيل الدخول
              </Link>
              <a href="#pricing" className="hover:text-white transition-colors">
                الأسعار
              </a>
              <a href="#features" className="hover:text-white transition-colors">
                المميزات
              </a>
              <a href="mailto:support@preciseflow.io" className="hover:text-white transition-colors">
                الدعم
              </a>
            </nav>
          </div>
          <div className="border-t border-slate-800 pt-6 text-center text-xs text-slate-600">
            © 2025 PreciseFlow — التدفق الدقيق. جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>

    </div>
  );
}
