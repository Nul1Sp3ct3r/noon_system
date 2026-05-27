import { clsx } from 'clsx';

type Variant = 'green' | 'amber' | 'red' | 'slate' | 'blue';

const VARIANTS: Record<Variant, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red:   'bg-red-50 text-red-700 ring-red-200',
  slate: 'bg-slate-50 text-slate-600 ring-slate-200',
  blue:  'bg-blue-50 text-blue-700 ring-blue-200',
};

export function Badge({ label, variant = 'slate' }: { label: string; variant?: Variant }) {
  return (
    <span className={clsx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', VARIANTS[variant])}>
      {label}
    </span>
  );
}

export function profitBadge(badge: string) {
  const MAP: Record<string, { label: string; variant: Variant }> = {
    profitable:   { label: 'مربح',           variant: 'green' },
    low_margin:   { label: 'هامش منخفض',     variant: 'amber' },
    loss:         { label: 'خسارة',          variant: 'red' },
    missing_cost: { label: 'تكلفة مفقودة',   variant: 'slate' },
  };
  return MAP[badge] ?? { label: badge, variant: 'slate' as Variant };
}
