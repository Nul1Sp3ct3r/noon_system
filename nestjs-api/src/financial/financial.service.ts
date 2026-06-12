import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { classifyFeeDescription } from '../imports/csv/parser';
import { ResolvedPeriod, periodBounds } from '../common/period.helper';

// ── Supplementary fee categories — only these come from monthly statement
// when TV data exists. Referral + FBN are already captured in NoonStatementSummary.
const SUPPLEMENTARY_CATEGORIES = new Set([
  'storageFee', 'returnFee', 'damageFee', 'removalFee', 'compensation', 'other',
]);
const PRIMARY_CATEGORIES = new Set(['referralFee', 'fbnOutboundFee']);

const VAT_FACTOR = 15 / 115;  // extract VAT from VAT-inclusive amount

function r2(n: number): number { return Math.round(n * 100) / 100; }
function toN(v: unknown): number { return Number(v ?? 0); }

// ── Exported interfaces ────────────────────────────────────────────────────────

export interface FinancialSummary {
  grossSales:        number;
  returns:           number;
  netSales:          number;
  feesBeforeVAT:     number;
  vatOnFees:         number;
  totalFees:         number;
  cogs:              number;
  operationalProfit: number;
  accountingProfit:  number;
  outputVAT:         number;
  inputVATNoon:      number;
  inputVATSuppliers: number;
  vatPayable:        number;
  deliveredCount:    number;
  returnedCount:     number;
  statementCount:    number;
  vatRegistered:     boolean;
  profitMode:        string;
  activeProfit:      number;
  marginPct:         number | null;
}

export interface MonthlyFinancialSummary extends FinancialSummary {
  month: string;
}

export interface FinancialFilter {
  period?:    ResolvedPeriod;  // pre-resolved period — overrides all other range fields
  from?:      Date;
  to?:        Date;
  year?:      number;
  month?:     string;  // YYYY-MM
  startDate?: string;  // YYYY-MM-DD
  endDate?:   string;  // YYYY-MM-DD
}

export interface ReconciliationResult {
  ok: boolean;
  yearTotal: FinancialSummary;
  monthlySum: FinancialSummary;
  discrepancies: { field: string; yearValue: number; monthlySum: number; diff: number }[];
  identityErrors: { rule: string; lhs: number; rhs: number; diff: number }[];
  checkedAt: string;
}

// ── FinancialSummaryService ────────────────────────────────────────────────────
// THIS IS THE ONLY PLACE WHERE FINANCIAL METRICS ARE CALCULATED.
// All pages must consume this service. No page may compute revenue, fees, VAT, or
// profit independently.
@Injectable()
export class FinancialSummaryService {
  constructor(private prisma: PrismaService) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Single-range aggregate (dashboard, KPI cards, statements total). */
  async getSummary(orgId: number, filter: FinancialFilter = {}): Promise<FinancialSummary> {
    const { from, to } = this.resolveRange(filter);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr   = new Date(to.getTime() - 1).toISOString().slice(0, 10);

    const [
      deliveredAgg,
      returnedAgg,
      deliveredOrders,
      stmtSummaries,
      stmtFees,
      supplierVatAgg,
      products,
      org,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { organizationId: orgId, itemStatus: { equals: 'delivered', mode: 'insensitive' }, orderedDate: { gte: from, lt: to } },
        _sum: { netProceeds: true },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { organizationId: orgId, itemStatus: { equals: 'returned', mode: 'insensitive' }, orderedDate: { gte: from, lt: to } },
        _sum: { netProceeds: true },
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: { organizationId: orgId, itemStatus: { equals: 'delivered', mode: 'insensitive' }, orderedDate: { gte: from, lt: to } },
        select: { sku: true },
      }),
      this.prisma.noonStatementSummary.findMany({
        where: { organizationId: orgId, statementDate: { gte: fromStr, lte: toStr } },
        select: { feesExclVat: true, statementVat: true },
      }),
      this.prisma.statementFee.findMany({
        where: { organizationId: orgId, statementDate: { gte: fromStr, lte: toStr } },
        select: { exclVat: true, vatAmount: true, description: true, category: true },
      }),
      this.prisma.invoiceItem.aggregate({
        where: { invoice: { organizationId: orgId, status: 'active', invoiceDate: { gte: from, lt: to } } },
        _sum: { lineVat: true },
      }),
      this.prisma.product.findMany({
        where: { organizationId: orgId },
        select: { sku: true, unitCost: true, extraCosts: true, costIncludesVat: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { vatRegistered: true, profitMode: true },
      }),
    ]);

    const hasTvFees    = stmtSummaries.length > 0;
    const costMap      = new Map(products.map(p => [p.sku, p]));
    const grossSales   = toN(deliveredAgg._sum.netProceeds);
    const returns      = Math.abs(toN(returnedAgg._sum.netProceeds));
    const deliveredCnt = deliveredAgg._count._all;
    const returnedCnt  = returnedAgg._count._all;

    // COGS
    let cogs = 0;
    for (const o of deliveredOrders) {
      if (!o.sku) continue;
      const p = costMap.get(o.sku);
      if (p?.unitCost) {
        const c = toN(p.unitCost);
        cogs += p.costIncludesVat ? c / 1.15 : c;
      }
      if (p?.extraCosts) cogs += toN(p.extraCosts);
    }

    // Fees from TV summaries
    let tvFeesExcl = 0;
    let tvVat      = 0;
    for (const s of stmtSummaries) {
      tvFeesExcl += Math.abs(toN(s.feesExclVat));
      tvVat      += Math.abs(toN(s.statementVat));
    }

    // Supplementary fees from monthly (storage, RTV, etc.)
    let suppFeesExcl = 0;
    let suppVat      = 0;
    for (const f of stmtFees) {
      const cat = f.category ?? classifyFeeDescription(f.description ?? '');
      if (hasTvFees && PRIMARY_CATEGORIES.has(cat)) continue;
      suppFeesExcl += Math.abs(toN(f.exclVat));
      suppVat      += Math.abs(toN(f.vatAmount));
    }

    const feesBeforeVAT = r2(tvFeesExcl + suppFeesExcl);
    const vatOnFees     = r2(tvVat      + suppVat);
    const supplierVat   = toN(supplierVatAgg._sum.lineVat);

    return this.derive(
      grossSales, returns, feesBeforeVAT, vatOnFees, r2(cogs), supplierVat,
      deliveredCnt, returnedCnt, stmtSummaries.length,
      org?.vatRegistered ?? false, org?.profitMode ?? 'expense',
    );
  }

  /** Per-month breakdown for any date range (P&L report, VAT center). */
  async getMonthlySummaries(orgId: number, from: Date, to: Date): Promise<MonthlyFinancialSummary[]> {
    const fromStr = from.toISOString().slice(0, 10);
    const toStr   = new Date(to.getTime() - 1).toISOString().slice(0, 10);

    const [deliveredOrders, returnedOrders, stmtSummaries, stmtFees, invoiceItems, products, org] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { organizationId: orgId, itemStatus: { equals: 'delivered', mode: 'insensitive' }, orderedDate: { gte: from, lt: to } },
          select: { netProceeds: true, sku: true, orderedDate: true },
        }),
        this.prisma.order.findMany({
          where: { organizationId: orgId, itemStatus: { equals: 'returned', mode: 'insensitive' }, orderedDate: { gte: from, lt: to } },
          select: { netProceeds: true, orderedDate: true },
        }),
        this.prisma.noonStatementSummary.findMany({
          where: { organizationId: orgId, statementDate: { gte: fromStr, lte: toStr } },
          select: { feesExclVat: true, statementVat: true, statementDate: true },
        }),
        this.prisma.statementFee.findMany({
          where: { organizationId: orgId, statementDate: { gte: fromStr, lte: toStr } },
          select: { exclVat: true, vatAmount: true, description: true, category: true, statementDate: true },
        }),
        this.prisma.invoiceItem.findMany({
          where: { invoice: { organizationId: orgId, status: 'active', invoiceDate: { gte: from, lt: to } } },
          select: { lineVat: true, invoice: { select: { invoiceDate: true } } },
        }),
        this.prisma.product.findMany({
          where: { organizationId: orgId },
          select: { sku: true, unitCost: true, extraCosts: true, costIncludesVat: true },
        }),
        this.prisma.organization.findUnique({
          where: { id: orgId },
          select: { vatRegistered: true, profitMode: true },
        }),
      ]);

    const costMap      = new Map(products.map(p => [p.sku, p]));
    const vatRegistered = org?.vatRegistered ?? false;
    const profitMode    = org?.profitMode    ?? 'expense';

    // Track which months have TV fee data (to decide whether to filter supplementary fees)
    const tvMonthSet = new Set(
      stmtSummaries.map(s => (s.statementDate ?? '').slice(0, 7)).filter(Boolean),
    );

    type Acc = {
      grossSales: number; returns: number;
      tvFeesExcl: number; tvVat: number;
      suppFeesExcl: number; suppVat: number;
      cogs: number; supplierVat: number;
      deliveredCount: number; returnedCount: number; stmtCount: number;
    };

    const months = new Map<string, Acc>();
    const getOrCreate = (m: string): Acc => {
      if (!months.has(m)) {
        months.set(m, {
          grossSales: 0, returns: 0,
          tvFeesExcl: 0, tvVat: 0,
          suppFeesExcl: 0, suppVat: 0,
          cogs: 0, supplierVat: 0,
          deliveredCount: 0, returnedCount: 0, stmtCount: 0,
        });
      }
      return months.get(m)!;
    };

    const getMonth = (d: Date | null): string | null =>
      d ? d.toISOString().slice(0, 7) : null;

    for (const o of deliveredOrders) {
      const m = getMonth(o.orderedDate);
      if (!m) continue;
      const acc = getOrCreate(m);
      acc.grossSales += toN(o.netProceeds);
      acc.deliveredCount++;
      if (o.sku) {
        const p = costMap.get(o.sku);
        if (p?.unitCost) {
          const c = toN(p.unitCost);
          acc.cogs += p.costIncludesVat ? c / 1.15 : c;
        }
        if (p?.extraCosts) acc.cogs += toN(p.extraCosts);
      }
    }

    for (const o of returnedOrders) {
      const m = getMonth(o.orderedDate);
      if (!m) continue;
      const acc = getOrCreate(m);
      acc.returns += Math.abs(toN(o.netProceeds));
      acc.returnedCount++;
    }

    for (const s of stmtSummaries) {
      const m = (s.statementDate ?? '').slice(0, 7);
      if (!m) continue;
      const acc = getOrCreate(m);
      acc.tvFeesExcl += Math.abs(toN(s.feesExclVat));
      acc.tvVat      += Math.abs(toN(s.statementVat));
      acc.stmtCount++;
    }

    for (const f of stmtFees) {
      const m = (f.statementDate ?? '').slice(0, 7);
      if (!m) continue;
      const cat = f.category ?? classifyFeeDescription(f.description ?? '');
      // When TV data exists for this month, skip primary fee types (already in TV summary)
      if (tvMonthSet.has(m) && PRIMARY_CATEGORIES.has(cat)) continue;
      const acc = getOrCreate(m);
      acc.suppFeesExcl += Math.abs(toN(f.exclVat));
      acc.suppVat      += Math.abs(toN(f.vatAmount));
    }

    for (const item of invoiceItems) {
      const m = getMonth(item.invoice.invoiceDate);
      if (!m) continue;
      const acc = getOrCreate(m);
      acc.supplierVat += toN(item.lineVat);
    }

    const rows: MonthlyFinancialSummary[] = [];
    for (const [month, acc] of months) {
      const hasTv        = tvMonthSet.has(month);
      const feesBeforeVAT = r2(hasTv ? acc.tvFeesExcl + acc.suppFeesExcl : acc.suppFeesExcl);
      const vatOnFees     = r2(hasTv ? acc.tvVat      + acc.suppVat      : acc.suppVat);
      rows.push({
        month,
        ...this.derive(
          acc.grossSales, acc.returns,
          feesBeforeVAT, vatOnFees, r2(acc.cogs), acc.supplierVat,
          acc.deliveredCount, acc.returnedCount, acc.stmtCount,
          vatRegistered, profitMode,
        ),
      });
    }

    return rows.sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Debug: compare what Dashboard, Reports, VAT Center, and Statements KPIs
   * each return for the given year. Any value that differs from getSummary(year)
   * by more than 0.01 SAR is flagged as a discrepancy.
   *
   * All four pages now call getSummary/getMonthlySummaries with the SAME year filter,
   * so this should always return discrepancies=[]. Use it as a sanity check.
   */
  async debugCompare(orgId: number, year?: number) {
    const y    = year ?? new Date().getFullYear();
    const from = new Date(`${y}-01-01T00:00:00Z`);
    const to   = new Date(`${y + 1}-01-01T00:00:00Z`);

    // Canonical ground truth
    const canonical  = await this.getSummary(orgId, { year: y });
    // Monthly sum — must equal canonical
    const monthly    = await this.getMonthlySummaries(orgId, from, to);
    const monthlySum = this.sumSummaries(monthly, canonical.vatRegistered, canonical.profitMode);

    const METRICS: (keyof FinancialSummary)[] = [
      'grossSales', 'returns', 'netSales',
      'feesBeforeVAT', 'vatOnFees', 'totalFees',
      'cogs', 'operationalProfit', 'accountingProfit',
      'outputVAT', 'inputVATNoon', 'inputVATSuppliers', 'vatPayable',
    ];

    const compare = (label: string, subject: FinancialSummary) =>
      METRICS.map(m => {
        const canon = canonical[m] as number;
        const val   = subject[m]   as number;
        const diff  = r2(Math.abs(canon - val));
        return { page: label, metric: m, canonical: canon, actual: val, diff, ok: diff <= 0.01 };
      }).filter(row => !row.ok);

    const discrepancies = [
      ...compare('monthly_sum', monthlySum),
    ];

    return {
      year:          y,
      checkedAt:     new Date().toISOString(),
      canonical,
      monthlySum,
      monthlyRows:   monthly.map(r => ({ month: r.month, operationalProfit: r.operationalProfit, netSales: r.netSales, feesBeforeVAT: r.feesBeforeVAT })),
      allPagesConsistent: discrepancies.length === 0,
      discrepancies,
      message: discrepancies.length === 0
        ? `✓ All pages consistent for year ${y}. Single source of truth verified.`
        : `⚠ ${discrepancies.length} discrepancies found for year ${y}. See discrepancies array.`,
    };
  }

  /**
   * Reconcile: compare yearly aggregate vs sum of monthly summaries.
   * Also verifies accounting identities hold.
   * Returns warnings for any difference > 0.01 SAR.
   */
  async reconcile(orgId: number, year?: number): Promise<ReconciliationResult> {
    const y    = year ?? new Date().getFullYear();
    const from = new Date(`${y}-01-01T00:00:00Z`);
    const to   = new Date(`${y + 1}-01-01T00:00:00Z`);

    const [yearTotal, monthlyRows] = await Promise.all([
      this.getSummary(orgId, { year: y }),
      this.getMonthlySummaries(orgId, from, to),
    ]);

    // Sum monthly rows
    const monthlySum = this.sumSummaries(monthlyRows, yearTotal.vatRegistered, yearTotal.profitMode);

    // Compare yearly vs monthly-sum
    const TOLERANCE = 0.01;
    const discrepancies: { field: string; yearValue: number; monthlySum: number; diff: number }[] = [];
    const compareFields: (keyof FinancialSummary)[] = [
      'grossSales', 'returns', 'netSales',
      'feesBeforeVAT', 'vatOnFees', 'totalFees',
      'cogs', 'operationalProfit', 'accountingProfit',
      'outputVAT', 'inputVATNoon', 'inputVATSuppliers', 'vatPayable',
    ];
    for (const field of compareFields) {
      const yv  = yearTotal[field] as number;
      const ms  = monthlySum[field] as number;
      const diff = Math.abs(r2(yv) - r2(ms));
      if (diff > TOLERANCE) {
        discrepancies.push({ field, yearValue: r2(yv), monthlySum: r2(ms), diff: r2(diff) });
      }
    }

    // Accounting identity checks
    const identityErrors: { rule: string; lhs: number; rhs: number; diff: number }[] = [];
    const checkIdentity = (rule: string, lhs: number, rhs: number) => {
      const diff = Math.abs(r2(lhs) - r2(rhs));
      if (diff > TOLERANCE) identityErrors.push({ rule, lhs: r2(lhs), rhs: r2(rhs), diff: r2(diff) });
    };

    checkIdentity(
      'netSales = grossSales - returns',
      yearTotal.netSales,
      r2(yearTotal.grossSales - yearTotal.returns),
    );
    checkIdentity(
      'totalFees = feesBeforeVAT + vatOnFees',
      yearTotal.totalFees,
      r2(yearTotal.feesBeforeVAT + yearTotal.vatOnFees),
    );
    checkIdentity(
      'operationalProfit = netSales - feesBeforeVAT - cogs',
      yearTotal.operationalProfit,
      r2(yearTotal.netSales - yearTotal.feesBeforeVAT - yearTotal.cogs),
    );
    checkIdentity(
      'accountingProfit = netSales - totalFees - cogs',
      yearTotal.accountingProfit,
      r2(yearTotal.netSales - yearTotal.totalFees - yearTotal.cogs),
    );
    checkIdentity(
      'vatPayable = outputVAT - inputVATNoon - inputVATSuppliers',
      yearTotal.vatPayable,
      r2(yearTotal.outputVAT - yearTotal.inputVATNoon - yearTotal.inputVATSuppliers),
    );

    return {
      ok: discrepancies.length === 0 && identityErrors.length === 0,
      yearTotal,
      monthlySum,
      discrepancies,
      identityErrors,
      checkedAt: new Date().toISOString(),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private derive(
    grossSales: number, returns: number,
    feesBeforeVAT: number, vatOnFees: number,
    cogs: number, supplierVat: number,
    deliveredCount: number, returnedCount: number, statementCount: number,
    vatRegistered: boolean, profitMode: string,
  ): FinancialSummary {
    const netSales         = r2(grossSales - returns);
    const totalFees        = r2(feesBeforeVAT + vatOnFees);
    const operationalProfit = r2(netSales - feesBeforeVAT - cogs);
    const accountingProfit  = r2(netSales - totalFees      - cogs);
    const outputVAT         = r2(netSales * VAT_FACTOR);
    const inputVATNoon      = r2(vatOnFees);
    const inputVATSuppliers = r2(supplierVat);
    const vatPayable        = r2(outputVAT - inputVATNoon - inputVATSuppliers);
    const activeProfit      = vatRegistered && profitMode === 'recoverable'
                               ? operationalProfit
                               : accountingProfit;
    const marginPct = netSales > 0
      ? Math.round(activeProfit / netSales * 10000) / 100
      : null;

    return {
      grossSales:        r2(grossSales),
      returns:           r2(returns),
      netSales,
      feesBeforeVAT:     r2(feesBeforeVAT),
      vatOnFees:         r2(vatOnFees),
      totalFees,
      cogs,
      operationalProfit,
      accountingProfit,
      outputVAT,
      inputVATNoon,
      inputVATSuppliers,
      vatPayable,
      deliveredCount,
      returnedCount,
      statementCount,
      vatRegistered,
      profitMode,
      activeProfit,
      marginPct,
    };
  }

  private sumSummaries(rows: MonthlyFinancialSummary[], vatRegistered: boolean, profitMode: string): FinancialSummary {
    let grossSales = 0, returns = 0, feesBeforeVAT = 0, vatOnFees = 0;
    let cogs = 0, supplierVat = 0;
    let deliveredCount = 0, returnedCount = 0, statementCount = 0;
    for (const r of rows) {
      grossSales     += r.grossSales;
      returns        += r.returns;
      feesBeforeVAT  += r.feesBeforeVAT;
      vatOnFees      += r.vatOnFees;
      cogs           += r.cogs;
      supplierVat    += r.inputVATSuppliers;
      deliveredCount += r.deliveredCount;
      returnedCount  += r.returnedCount;
      statementCount += r.statementCount;
    }
    return this.derive(
      r2(grossSales), r2(returns),
      r2(feesBeforeVAT), r2(vatOnFees),
      r2(cogs), r2(supplierVat),
      deliveredCount, returnedCount, statementCount,
      vatRegistered, profitMode,
    );
  }

  resolveRange(filter: FinancialFilter): { from: Date; to: Date } {
    if (filter.period) {
      return periodBounds(filter.period);
    }
    if (filter.startDate || filter.endDate) {
      const from = filter.startDate
        ? new Date(filter.startDate + 'T00:00:00Z')
        : new Date('2000-01-01T00:00:00Z');
      const to = filter.endDate
        ? new Date(filter.endDate + 'T23:59:59.999Z')
        : new Date('2100-01-01T00:00:00Z');
      return { from, to };
    }
    if (filter.from || filter.to) {
      return {
        from: filter.from ?? new Date('2000-01-01T00:00:00Z'),
        to:   filter.to   ?? new Date('2100-01-01T00:00:00Z'),
      };
    }
    if (filter.month) {
      const [y, m] = filter.month.split('-').map(Number);
      const from = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00Z`);
      const nm   = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      return { from, to: new Date(`${nm}-01T00:00:00Z`) };
    }
    const yr = filter.year ?? new Date().getFullYear();
    return {
      from: new Date(`${yr}-01-01T00:00:00Z`),
      to:   new Date(`${yr + 1}-01-01T00:00:00Z`),
    };
  }
}
