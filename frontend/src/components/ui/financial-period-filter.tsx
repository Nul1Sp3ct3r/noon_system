'use client';

import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type PeriodType = 'all' | 'year' | 'month' | 'custom';

export interface PeriodFilter {
  periodType: PeriodType;
  year?:  number;
  month?: number;  // 1–12
  from?:  string;  // YYYY-MM-DD
  to?:    string;  // YYYY-MM-DD
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const MODES: { value: PeriodType; label: string }[] = [
  { value: 'all',    label: 'الكل' },
  { value: 'year',   label: 'سنة' },
  { value: 'month',  label: 'شهر' },
  { value: 'custom', label: 'فترة مخصصة' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

export function defaultPeriodFilter(): PeriodFilter {
  const d = new Date();
  return { periodType: 'month', year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function periodLabel(f: PeriodFilter): string {
  const y = f.year  ?? new Date().getFullYear();
  const m = f.month ?? 1;
  switch (f.periodType) {
    case 'all':    return 'كل البيانات';
    case 'year':   return `سنة ${y}`;
    case 'month':  return `${ARABIC_MONTHS[m - 1]} ${y}`;
    case 'custom': return f.from && f.to ? `${f.from} — ${f.to}` : 'فترة مخصصة';
    default:       return '';
  }
}

/** Convert PeriodFilter to API query params object (pass to qs() or spread into URL). */
export function periodToParams(f: PeriodFilter): Record<string, string | number | undefined> {
  return {
    periodType: f.periodType,
    year:  f.year,
    month: f.month,
    from:  f.from,
    to:    f.to,
  };
}

/** Derive a YYYY-MM-DD date range from a period (for legacy endpoints that use startDate/endDate). */
export function periodToDateRange(f: PeriodFilter): { startDate?: string; endDate?: string } {
  const y = f.year  ?? new Date().getFullYear();
  const m = f.month ?? new Date().getMonth() + 1;
  if (f.periodType === 'all')    return {};
  if (f.periodType === 'custom') return { startDate: f.from, endDate: f.to };
  if (f.periodType === 'year')   return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
  // month
  const mm    = String(m).padStart(2, '0');
  const nm    = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const last  = new Date(`${nm}-01T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - 1);
  return { startDate: `${y}-${mm}-01`, endDate: last.toISOString().slice(0, 10) };
}

function parsePeriodFromUrl(): PeriodFilter | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  if (!p.has('periodType')) return null;
  return {
    periodType: (p.get('periodType') ?? 'month') as PeriodType,
    year:  p.get('year')  ? parseInt(p.get('year')!,  10) : undefined,
    month: p.get('month') ? parseInt(p.get('month')!, 10) : undefined,
    from:  p.get('from')  ?? undefined,
    to:    p.get('to')    ?? undefined,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/** Reads/writes the period filter from the URL (replaceState — no navigation). */
export function usePeriodFilter(initial?: PeriodFilter): [PeriodFilter, (f: PeriodFilter) => void] {
  const [filter, setFilter] = useState<PeriodFilter>(() => {
    const fromUrl = parsePeriodFromUrl();
    return fromUrl ?? initial ?? defaultPeriodFilter();
  });

  const update = useCallback((f: PeriodFilter) => {
    setFilter(f);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('periodType', f.periodType);
      if (f.year  != null) url.searchParams.set('year',  String(f.year));  else url.searchParams.delete('year');
      if (f.month != null) url.searchParams.set('month', String(f.month)); else url.searchParams.delete('month');
      if (f.from)  url.searchParams.set('from', f.from); else url.searchParams.delete('from');
      if (f.to)    url.searchParams.set('to',   f.to);   else url.searchParams.delete('to');
      window.history.replaceState(null, '', url.toString());
    }
  }, []);

  return [filter, update];
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  value:     PeriodFilter;
  onChange:  (f: PeriodFilter) => void;
  className?: string;
}

export function FinancialPeriodFilter({ value, onChange, className = '' }: Props) {
  const CURRENT_YEAR = new Date().getFullYear();
  const { periodType, year = CURRENT_YEAR, month = new Date().getMonth() + 1, from, to } = value;

  function switchMode(mode: PeriodType) {
    if (mode === 'all')    { onChange({ periodType: 'all' }); return; }
    if (mode === 'year')   { onChange({ periodType: 'year',   year }); return; }
    if (mode === 'month')  { onChange({ periodType: 'month',  year, month }); return; }
    if (mode === 'custom') { onChange({ periodType: 'custom', from, to }); return; }
  }

  return (
    <div dir="rtl" className={`flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl ${className}`}>

      {/* Mode pills */}
      <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden text-xs font-medium">
        {MODES.map(m => (
          <button
            key={m.value}
            type="button"
            onClick={() => switchMode(m.value)}
            className={`px-3 py-1.5 transition-colors ${
              periodType === m.value
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Year stepper — shown for year and month modes */}
      {(periodType === 'year' || periodType === 'month') && (
        <div className="flex items-center rounded-lg border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => onChange({ ...value, year: year - 1 })}
            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          <span className="text-xs font-semibold text-slate-700 tabular-nums w-10 text-center select-none">
            {year}
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...value, year: Math.min(year + 1, CURRENT_YEAR) })}
            disabled={year >= CURRENT_YEAR}
            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      )}

      {/* Month dropdown */}
      {periodType === 'month' && (
        <select
          value={month}
          onChange={e => onChange({ ...value, month: parseInt(e.target.value, 10) })}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none cursor-pointer"
        >
          {ARABIC_MONTHS.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>
      )}

      {/* Custom date range */}
      {periodType === 'custom' && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">من</span>
          <input
            type="date"
            value={from ?? ''}
            onChange={e => onChange({ ...value, from: e.target.value || undefined })}
            className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none"
          />
          <span className="text-slate-500">إلى</span>
          <input
            type="date"
            value={to ?? ''}
            min={from}
            onChange={e => onChange({ ...value, to: e.target.value || undefined })}
            className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none"
          />
        </div>
      )}

      {/* Period label chip */}
      <span className="text-[11px] text-slate-500 mr-auto px-2 py-0.5 bg-white border border-slate-200 rounded-full whitespace-nowrap">
        {periodLabel(value)}
      </span>
    </div>
  );
}
