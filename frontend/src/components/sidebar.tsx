'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Package, ShoppingCart, FileText,
  Warehouse, BarChart2, Calculator, TrendingUp,
  CreditCard, ShieldCheck, LogOut, Upload, BookOpen,
  ListTree, Scale, BookMarked, Lock, Receipt,
  ChevronDown, Settings, Users, Layers, BadgeDollarSign, CreditCard as PayCard,
  Folders,
} from 'lucide-react';
import { clsx } from 'clsx';
import { auth } from '@/lib/api';
import { clearTokens, getUser, isPlatformAdmin } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem  { href: string; label: string; icon: LucideIcon }
interface NavGroup { id: string; label: string; icon: LucideIcon; items: NavItem[] }

// ─── Navigation structure ─────────────────────────────────────────────────────
// Routes /calculator and /costs are preserved — just removed from sidebar nav.

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'sales',
    label: 'المبيعات',
    icon: ShoppingCart,
    items: [
      { href: '/orders',        label: 'الطلبات',  icon: ShoppingCart },
      { href: '/invoices',      label: 'الفواتير', icon: FileText     },
      { href: '/settlements',   label: 'التسويات', icon: CreditCard   },
      { href: '/profitability', label: 'الربحية',  icon: TrendingUp   },
    ],
  },
  {
    id: 'inventory',
    label: 'إدارة المخزون',
    icon: Warehouse,
    items: [
      { href: '/products',            label: 'المنتجات',         icon: Package   },
      { href: '/product-families',    label: 'مجموعات المنتجات', icon: Folders   },
      { href: '/inventory',           label: 'المخزون',           icon: Warehouse },
      { href: '/inventory/movements', label: 'دفتر الحركات',      icon: ListTree  },
      { href: '/import',              label: 'الاستيراد',         icon: Upload    },
    ],
  },
  {
    id: 'finance',
    label: 'المالية',
    icon: BookOpen,
    items: [
      { href: '/statements', label: 'كشوفات نون',            icon: FileText   },
      { href: '/expenses',   label: 'المصروفات',             icon: Receipt    },
      { href: '/vat-center', label: 'ضريبة القيمة المضافة', icon: Calculator },
      { href: '/reports',    label: 'التقارير المالية',      icon: BarChart2  },
    ],
  },
  {
    id: 'advanced',
    label: 'المحاسبة المتقدمة',
    icon: BookMarked,
    items: [
      { href: '/accounts',                 label: 'دليل الحسابات',    icon: ListTree   },
      { href: '/journal',                  label: 'القيود المحاسبية', icon: BookOpen   },
      { href: '/accounting/ledger',        label: 'دفتر الأستاذ',     icon: BookMarked },
      { href: '/accounting/trial-balance', label: 'ميزان المراجعة',   icon: Scale      },
    ],
  },
  {
    id: 'settings',
    label: 'الإعدادات',
    icon: Settings,
    items: [
      { href: '/settings',           label: 'إعدادات الشركة',    icon: Settings    },
      { href: '/admin',              label: 'الإدارة',            icon: ShieldCheck },
      { href: '/accounting/periods', label: 'الفترات المحاسبية', icon: Lock        },
    ],
  },
];

// ─── Route-match helper ───────────────────────────────────────────────────────
// Use href + '/' for prefix matching so that /inventory doesn't highlight
// when on /inventory/movements (only the most-specific item matches).

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  // Initialise open groups from current pathname (SSR-safe)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const g of NAV_GROUPS) {
      if (g.items.some(i => isActive(pathname, i.href))) initial.add(g.id);
    }
    return initial;
  });

  // Auto-expand the group that contains the active route on navigation
  useEffect(() => {
    for (const g of NAV_GROUPS) {
      if (g.items.some(i => isActive(pathname, i.href))) {
        setOpenGroups(prev => {
          if (prev.has(g.id)) return prev;
          return new Set([...prev, g.id]);
        });
        break;
      }
    }
  }, [pathname]);

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleLogout() {
    await auth.logout();
    clearTokens();
    router.push('/login');
  }

  const user         = getUser();
  const showPlatform = isPlatformAdmin(user);
  const dashActive   = pathname === '/dashboard';

  return (
    <aside className="fixed inset-y-0 right-0 w-60 bg-sidebar flex flex-col z-30 select-none">

      {/* ── Brand ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">P</span>
        </div>
        <div className="min-w-0">
          <p className="text-white font-bold text-sm leading-tight">PreciseFlow</p>
          <p className="text-slate-500 text-[10px] tracking-wider uppercase mt-0.5">التدفق الدقيق</p>
        </div>
      </div>

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">

        {/* Dashboard — standalone link */}
        <Link
          href="/dashboard"
          className={clsx(
            'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            dashActive
              ? 'bg-brand-600 text-white'
              : 'text-slate-400 hover:bg-white/10 hover:text-white',
          )}
        >
          <LayoutDashboard size={15} className="shrink-0" />
          <span>لوحة التحكم</span>
        </Link>

        {/* Divider */}
        <div className="h-px bg-white/5 mx-1 my-2" />

        {/* Collapsible groups */}
        {NAV_GROUPS.map(group => {
          const isOpen       = openGroups.has(group.id);
          const groupActive  = group.items.some(i => isActive(pathname, i.href));
          const GroupIcon    = group.icon;

          return (
            <div key={group.id} className="space-y-0.5">

              {/* Group header button */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs font-semibold',
                  groupActive
                    ? 'text-slate-200 bg-white/5'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <GroupIcon size={14} className="shrink-0" />
                  <span className="tracking-wide">{group.label}</span>
                  {/* Active indicator dot */}
                  {groupActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                  )}
                </div>
                <ChevronDown
                  size={12}
                  className={clsx(
                    'shrink-0 text-slate-600 transition-transform duration-200',
                    isOpen ? 'rotate-0' : '-rotate-90',
                  )}
                />
              </button>

              {/* Animated child items */}
              <div
                className={clsx(
                  'overflow-hidden transition-all duration-200 ease-in-out',
                  isOpen ? 'max-h-[400px]' : 'max-h-0',
                )}
              >
                <div className="pr-2 pb-1 space-y-0.5">
                  {group.items.map(item => {
                    const ItemIcon  = item.icon;
                    const itemActive = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={clsx(
                          'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                          itemActive
                            ? 'bg-brand-600 text-white'
                            : 'text-slate-400 hover:bg-white/10 hover:text-white',
                        )}
                      >
                        <ItemIcon size={13} className="shrink-0 opacity-80" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>

            </div>
          );
        })}

      </nav>

      {/* ── Platform Admin (super_admin / platform_admin only) ──────────────── */}
      {showPlatform && (
        <div className="px-2.5 pb-2 border-t border-white/10">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest px-3 py-2 mt-2">
            إدارة المنصة
          </p>
          {[
            { href: '/admin/merchants',    label: 'إدارة التجار',  icon: Users           },
            { href: '/admin/plans',        label: 'الباقات',       icon: Layers          },
            { href: '/admin/subscriptions',label: 'الاشتراكات',    icon: BadgeDollarSign },
            { href: '/admin/payments',     label: 'المدفوعات',     icon: PayCard         },
          ].map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors mb-0.5',
                  active
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-slate-500 hover:bg-white/10 hover:text-slate-300',
                )}
              >
                <Icon size={13} className="shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Logout ─────────────────────────────────────────────────────────── */}
      <div className="px-2.5 py-3 border-t border-white/10 shrink-0">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-white/10 hover:text-slate-300 transition-colors"
        >
          <LogOut size={14} className="shrink-0" />
          <span>تسجيل الخروج</span>
        </button>
      </div>

    </aside>
  );
}
