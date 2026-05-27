import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'amber' | 'rose';
  sub?: string;
}

const COLORS = {
  blue:  'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose:  'bg-rose-50 text-rose-600',
};

export default function StatCard({ label, value, icon: Icon, color = 'blue', sub }: Props) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={clsx('rounded-xl p-2.5', COLORS[color])}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
