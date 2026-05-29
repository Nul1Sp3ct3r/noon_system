'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, RefreshCw, TrendingUp, TrendingDown, ShoppingCart,
  Package, Receipt, Calculator, Users, CheckCircle2, XCircle,
  AlertTriangle, Clock, Upload, FileText, BookOpen, Plus,
  BarChart2, Settings, Database, Shield, ChevronDown, ChevronUp,
  Layers, Wallet, Scale, BadgeDollarSign, X,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { admin as api, type AdminDashboard } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

// ── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt0 = (n: number) =>
  n.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(+y, +mo - 1, 1).toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' });
}

function healthColor(n: number, warn = 1, critical = 10): string {
  if (n === 0)          return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (n < critical)     return 'text-amber-600 bg-amber-50 border-amber-200';
  return               'text-red-600 bg-red-50 border-red-200';
}

function healthDot(n: number, warn = 1, critical = 10): string {
  if (n === 0)     return 'bg-emerald-500';
  if (n < critical) return 'bg-amber-500';
  return            'bg-red-500';
}

const ACTION_LABELS: Record<string, string> = {
  import_weekly:          'تم استيراد أسبوعي',
  import_monthly:         'تم استيراد شهري',
  import_inventory:       'تم استيراد مخزون',
  expense_create:         'تمت إضافة مصروف',
  expense_update:         'تم تعديل مصروف',
  product_cost_update:    'تم تعديل تكلفة منتج',
  journal_create:         'تم إنشاء قيد محاسبي',
  admin_update_user:      'تم تعديل مستخدم',
  invoice_create:         'تم إنشاء فاتورة',
  invoice_update:         'تم تعديل فاتورة',
  warehouse_create:       'تم إنشاء مخزن',
  warehouse_update:       'تم تعديل مخزن',
  movement_create:        'تم تسجيل حركة مخزون',
  movement_adjust:        'تم تعديل مخزون',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'مشرف عام',
  admin:       'مدير',
  user:        'مستخدم',
};

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

interface UserRow {
  id: number; username: string; fullName: string | null;
  role: string; isActive: boolean; lastLogin: string | null;
}

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color, trend,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; trend?: 'up' | 'down' | null;
}) {
  const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
    blue:   { bg: 'bg-blue-50',    icon: 'text-blue-600',    border: 'border-blue-100' },
    green:  { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
    amber:  { bg: 'bg-amber-50',   icon: 'text-amber-600',   border: 'border-amber-100' },
    red:    { bg: 'bg-red-50',     icon: 'text-red-600',     border: 'border-red-100' },
    purple: { bg: 'bg-violet-50',  icon: 'text-violet-600',  border: 'border-violet-100' },
    slate:  { bg: 'bg-slate-100',  icon: 'text-slate-600',   border: 'border-slate-200' },
  };
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <div className={`card p-4 border ${c.border}`}>
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${c.bg}`}>
          <Icon size={18} className={c.icon} />
        </div>
        {trend === 'up'   && <TrendingUp  size={14} className="text-emerald-500 mt-1" />}
        {trend === 'down' && <TrendingDown size={14} className="text-red-500 mt-1" />}
      </div>
      <p className="text-xs text-slate-500 font-medium mt-3">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-0.5 truncate">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function HealthCard({
  label, count, icon: Icon, href, warn, critical,
}: {
  label: string; count: number; icon: React.ElementType;
  href: string; warn?: number; critical?: number;
}) {
  const router = useRouter();
  const cls = healthColor(count, warn, critical);
  const dot = healthDot(count, warn, critical);
  return (
    <button
      onClick={() => router.push(href)}
      className={`w-full text-right rounded-xl border p-3.5 flex items-center justify-between gap-3 transition-all hover:shadow-sm ${cls}`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <Icon size={15} className="shrink-0 opacity-70" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-lg font-bold">{fmt0(count)}</span>
    </button>
  );
}

function AlertItem({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
      <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-500" />
      <span className="flex-1">{msg}</span>
      <button onClick={onDismiss} className="shrink-0 hover:text-amber-600">
        <X size={12} />
      </button>
    </div>
  );
}

function QuickActionBtn({
  label, icon: Icon, href, color,
}: {
  label: string; icon: React.ElementType; href: string; color: string;
}) {
  const router = useRouter();
  const colorMap: Record<string, string> = {
    blue:   'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700',
    green:  'hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700',
    amber:  'hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700',
    purple: 'hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700',
    slate:  'hover:bg-slate-100 hover:border-slate-300 hover:text-slate-700',
  };
  return (
    <button
      onClick={() => router.push(href)}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 p-4 text-slate-600 transition-all ${colorMap[color] ?? colorMap.slate}`}
    >
      <Icon size={20} />
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [dash, setDash]             = useState<AdminDashboard | null>(null);
  const [users, setUsers]           = useState<UserRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [usersOpen, setUsersOpen]   = useState(false);
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([api.dashboard(), api.users() as Promise<UserRow[]>])
      .then(([d, u]) => { setDash(d); setUsers(u); })
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل البيانات'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const dismiss = (key: string) =>
    setDismissed(prev => new Set([...prev, key]));

  // Build alerts from health data
  const alerts: Array<{ key: string; msg: string }> = [];
  if (dash) {
    const h = dash.health;
    if (h.failedImports > 0)       alerts.push({ key: 'failedImports',    msg: `يوجد ${h.failedImports} استيراد فاشل` });
    if (h.productsMissingCost > 0) alerts.push({ key: 'missingCost',      msg: `يوجد ${h.productsMissingCost} منتج بدون تكلفة` });
    if (h.outOfStock > 0)          alerts.push({ key: 'outOfStock',       msg: `يوجد ${h.outOfStock} صنف نفد مخزونه` });
    if (h.lowStock > 0)            alerts.push({ key: 'lowStock',         msg: `يوجد ${h.lowStock} صنف بمخزون منخفض` });
    if (h.draftJournals > 0)       alerts.push({ key: 'draftJournals',    msg: `يوجد ${h.draftJournals} قيد غير مرحّل` });
    if (h.draftExpenses > 0)       alerts.push({ key: 'draftExpenses',    msg: `يوجد ${h.draftExpenses} مصروف في مسودة` });
  }
  const activeAlerts = alerts.filter(a => !dismissed.has(a.key));
  const kpis = dash?.kpis;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">مركز التحكم</h1>
          <p className="text-slate-500 text-sm mt-0.5">الإدارة المالية والتشغيلية</p>
        </div>
        <button
          onClick={load}
          className="btn-ghost flex items-center gap-1.5 text-xs"
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Row 1: Executive KPIs ── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">مؤشرات الأداء — الشهر الحالي</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="مبيعات الشهر"
            value={kpis ? `${fmt(kpis.monthlySales)} ر.س` : '—'}
            icon={TrendingUp}
            color="blue"
          />
          <KpiCard
            label="صافي الربح"
            value={kpis ? `${fmt(kpis.netProfit)} ر.س` : '—'}
            icon={BadgeDollarSign}
            color={kpis && kpis.netProfit >= 0 ? 'green' : 'red'}
            trend={kpis ? (kpis.netProfit >= 0 ? 'up' : 'down') : null}
          />
          <KpiCard
            label="المصروفات الشهرية"
            value={kpis ? `${fmt(kpis.monthlyExpenses)} ر.س` : '—'}
            icon={Receipt}
            color="amber"
          />
          <KpiCard
            label="عدد الطلبات"
            value={kpis ? fmt0(kpis.orderCount) : '—'}
            sub="طلب مسلّم"
            icon={ShoppingCart}
            color="purple"
          />
          <KpiCard
            label="قيمة المخزون"
            value={kpis ? `${fmt(kpis.inventoryValue)} ر.س` : '—'}
            icon={Layers}
            color="slate"
          />
          <KpiCard
            label="ضريبة القيمة المضافة"
            value={kpis ? `${fmt(kpis.vatPayable)} ر.س` : '—'}
            sub="مستحقة للدفع"
            icon={Scale}
            color="red"
          />
        </div>
      </div>

      {/* ── Row 2: System Health + Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Health center */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={15} className="text-slate-600" />
            <h2 className="font-semibold text-slate-800 text-sm">صحة النظام</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <HealthCard label="استيرادات فاشلة"    count={dash?.health.failedImports ?? 0}      icon={XCircle}        href="/import"    critical={1} />
            <HealthCard label="منتجات بدون تكلفة"  count={dash?.health.productsMissingCost ?? 0} icon={AlertTriangle}  href="/products"  critical={10} />
            <HealthCard label="نفاد مخزون"          count={dash?.health.outOfStock ?? 0}          icon={Package}        href="/inventory" critical={5} />
            <HealthCard label="مخزون منخفض"         count={dash?.health.lowStock ?? 0}            icon={AlertCircle}    href="/inventory" critical={10} />
            <HealthCard label="قيود غير مرحّلة"    count={dash?.health.draftJournals ?? 0}       icon={BookOpen}       href="/journal"   critical={1} />
            <HealthCard label="مصروفات في مسودة"   count={dash?.health.draftExpenses ?? 0}       icon={Receipt}        href="/expenses"  critical={5} />
          </div>
        </div>

        {/* Alerts */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-500" />
            <h2 className="font-semibold text-slate-800 text-sm">تنبيهات النظام</h2>
            {activeAlerts.length > 0 && (
              <span className="mr-auto text-xs bg-amber-500 text-white rounded-full px-2 py-0.5">{activeAlerts.length}</span>
            )}
          </div>
          {activeAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-slate-400">
              <CheckCircle2 size={28} className="text-emerald-400 mb-2" />
              <p className="text-sm">لا توجد تنبيهات — النظام سليم</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeAlerts.map(a => (
                <AlertItem key={a.key} msg={a.msg} onDismiss={() => dismiss(a.key)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales vs Expenses bar chart */}
        <div className="card p-4 lg:col-span-2">
          <h2 className="font-semibold text-slate-800 text-sm mb-4">المبيعات مقابل المصروفات — آخر 6 أشهر</h2>
          {dash?.trend && dash.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dash.trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v, name) => [
                    `${fmt(Number(v ?? 0))} ر.س`,
                    name === 'sales' ? 'مبيعات' : name === 'expenses' ? 'مصروفات' : 'ربح',
                  ]}
                  labelFormatter={l => monthLabel(String(l))}
                  contentStyle={{ fontSize: 11, direction: 'rtl' }}
                />
                <Bar dataKey="sales"    fill="#6366f1" radius={[3, 3, 0, 0]} name="مبيعات" />
                <Bar dataKey="expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} name="مصروفات" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">لا توجد بيانات كافية</div>
          )}
        </div>

        {/* Expenses by category pie */}
        <div className="card p-4">
          <h2 className="font-semibold text-slate-800 text-sm mb-4">توزيع المصروفات</h2>
          {dash?.expensesByCategory && dash.expensesByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={dash.expensesByCategory}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%" cy="50%"
                  outerRadius={70}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                  style={{ fontSize: 9 }}
                >
                  {dash.expensesByCategory.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [`${fmt(Number(v ?? 0))} ر.س`]}
                  contentStyle={{ fontSize: 11, direction: 'rtl' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">لا توجد مصروفات هذا الشهر</div>
          )}
        </div>
      </div>

      {/* ── Row 4: Net Profit trend + Activity Timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Net profit line chart */}
        <div className="card p-4">
          <h2 className="font-semibold text-slate-800 text-sm mb-4">صافي الربح الشهري</h2>
          {dash?.trend && dash.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={dash.trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v) => [`${fmt(Number(v ?? 0))} ر.س`, 'الربح']}
                  labelFormatter={l => monthLabel(String(l))}
                  contentStyle={{ fontSize: 11, direction: 'rtl' }}
                />
                <Line
                  type="monotone" dataKey="profit"
                  stroke="#10b981" strokeWidth={2.5}
                  dot={{ r: 3, fill: '#10b981' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">لا توجد بيانات كافية</div>
          )}
        </div>

        {/* Activity Timeline */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800 text-sm">آخر النشاطات</h2>
          </div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {loading ? (
              <p className="text-slate-400 text-xs text-center py-8">جارٍ التحميل…</p>
            ) : dash?.recentActivities.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-8">لا توجد نشاطات</p>
            ) : dash?.recentActivities.map(a => (
              <div key={a.id} className="flex items-start gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-1.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-slate-700 font-medium truncate">
                    {ACTION_LABELS[a.action] ?? a.action}
                    {a.entityType && <span className="text-slate-400 font-normal"> · {a.entityType}</span>}
                  </p>
                  <p className="text-slate-400 mt-0.5">
                    {a.user?.fullName ?? a.user?.username ?? 'نظام'}
                    {' · '}
                    {new Date(a.createdAt).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 5: Quick Actions + Settings shortcuts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quick actions */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={14} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800 text-sm">إجراءات سريعة</h2>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <QuickActionBtn label="استيراد أسبوعي"  icon={Upload}   href="/import"    color="blue"   />
            <QuickActionBtn label="مصروف جديد"       icon={Receipt}  href="/expenses"  color="amber"  />
            <QuickActionBtn label="فاتورة جديدة"     icon={FileText} href="/invoices"  color="green"  />
            <QuickActionBtn label="قيد محاسبي"       icon={BookOpen} href="/journal"   color="purple" />
            <QuickActionBtn label="منتج جديد"        icon={Package}  href="/products"  color="slate"  />
            <QuickActionBtn label="مخزون"            icon={Layers}   href="/inventory" color="slate"  />
            <QuickActionBtn label="التقارير"         icon={TrendingUp} href="/reports" color="blue"   />
            <QuickActionBtn label="الطلبات"          icon={ShoppingCart} href="/orders" color="slate" />
          </div>
        </div>

        {/* Settings shortcuts */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings size={14} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800 text-sm">إعدادات النظام</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <QuickActionBtn label="دليل الحسابات"       icon={Database}    href="/accounts"                 color="slate" />
            <QuickActionBtn label="الفترات المحاسبية"   icon={Clock}       href="/accounting/periods"       color="slate" />
            <QuickActionBtn label="ضريبة القيمة المضافة" icon={Calculator}  href="/vat-center"               color="slate" />
            <QuickActionBtn label="الاستيراد"            icon={Upload}      href="/import"                   color="slate" />
            <QuickActionBtn label="التسويات"             icon={Wallet}      href="/settlements"              color="slate" />
            <QuickActionBtn label="الإدارة"              icon={Shield}      href="/admin"                    color="slate" />
          </div>
        </div>
      </div>

      {/* ── Row 6: Users management (collapsible) ── */}
      <div className="card">
        <button
          onClick={() => setUsersOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Users size={15} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800 text-sm">إدارة المستخدمين</h2>
            <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{users.length}</span>
          </div>
          {usersOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </button>
        {usersOpen && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['اسم المستخدم', 'الاسم الكامل', 'الدور', 'الحالة', 'آخر دخول'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="table-td text-center py-8 text-slate-400">جارٍ التحميل…</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5} className="table-td text-center py-8 text-slate-400">لا توجد مستخدمون</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="table-td font-mono text-xs">{u.username}</td>
                    <td className="table-td">{u.fullName ?? '—'}</td>
                    <td className="table-td">
                      <Badge
                        label={ROLE_LABELS[u.role] ?? u.role}
                        variant={u.role === 'super_admin' ? 'red' : u.role === 'admin' ? 'blue' : 'slate'}
                      />
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <Badge label={u.isActive ? 'نشط' : 'معطل'} variant={u.isActive ? 'green' : 'slate'} />
                      </div>
                    </td>
                    <td className="table-td text-slate-400 text-xs">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
