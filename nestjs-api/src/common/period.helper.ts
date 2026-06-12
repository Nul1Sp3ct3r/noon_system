import { BadRequestException } from '@nestjs/common';

export type PeriodType = 'all' | 'year' | 'month' | 'custom';

export interface ResolvedPeriod {
  periodType: PeriodType;
  from: Date | null;  // inclusive start; null = all-time
  to:   Date | null;  // exclusive end (midnight of day after); null = all-time
  label: string;
}

export interface PeriodQuery {
  periodType?: string;
  year?:       number | string;
  month?:      number | string;
  from?:       string;   // YYYY-MM-DD
  to?:         string;   // YYYY-MM-DD
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export function resolveFinancialPeriod(q: PeriodQuery): ResolvedPeriod {
  const type  = (q.periodType ?? 'month') as PeriodType;
  const year  = q.year  != null ? parseInt(String(q.year),  10) : undefined;
  const month = q.month != null ? parseInt(String(q.month), 10) : undefined;

  switch (type) {
    case 'all':
      return { periodType: 'all', from: null, to: null, label: 'كل البيانات' };

    case 'year': {
      const y = year ?? new Date().getFullYear();
      return {
        periodType: 'year',
        from:  new Date(`${y}-01-01T00:00:00Z`),
        to:    new Date(`${y + 1}-01-01T00:00:00Z`),
        label: `سنة ${y}`,
      };
    }

    case 'month': {
      const y = year  ?? new Date().getFullYear();
      const m = month ?? (new Date().getMonth() + 1);
      if (m < 1 || m > 12) throw new BadRequestException('month يجب أن يكون بين 1 و 12');
      const mm = String(m).padStart(2, '0');
      const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      return {
        periodType: 'month',
        from:  new Date(`${y}-${mm}-01T00:00:00Z`),
        to:    new Date(`${nm}-01T00:00:00Z`),
        label: `${ARABIC_MONTHS[m - 1]} ${y}`,
      };
    }

    case 'custom': {
      if (!q.from || !q.to)
        throw new BadRequestException('from و to مطلوبان للفترة المخصصة');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.from) || !/^\d{4}-\d{2}-\d{2}$/.test(q.to))
        throw new BadRequestException('استخدم تنسيق YYYY-MM-DD لـ from و to');
      const from   = new Date(q.from + 'T00:00:00Z');
      const toBase = new Date(q.to   + 'T00:00:00Z');
      toBase.setUTCDate(toBase.getUTCDate() + 1);  // exclusive upper bound
      if (from >= toBase)
        throw new BadRequestException('from يجب أن يكون قبل to');
      return {
        periodType: 'custom',
        from,
        to:    toBase,
        label: `من ${q.from} إلى ${q.to}`,
      };
    }

    default: {
      const now = new Date();
      return resolveFinancialPeriod({ periodType: 'month', year: now.getFullYear(), month: now.getMonth() + 1 });
    }
  }
}

/** Returns concrete Date bounds, substituting all-time sentinels when period.from/to are null. */
export function periodBounds(period: ResolvedPeriod): { from: Date; to: Date } {
  return {
    from: period.from ?? new Date('2000-01-01T00:00:00Z'),
    to:   period.to   ?? new Date('2100-01-01T00:00:00Z'),
  };
}
