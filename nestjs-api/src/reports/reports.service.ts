import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialSummaryService } from '../financial/financial.service';
import { SalesReportDto, FeesReportDto, ReportRangeDto } from './dto/report-query.dto';
import { classifyFeeDescription } from '../imports/csv/parser';

function nextMonthStr(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma:    PrismaService,
    private financial: FinancialSummaryService,
  ) {}

  // ── P&L ────────────────────────────────────────────────────────────────────
  // Delegates all financial calculations to FinancialSummaryService.
  // Maps MonthlyFinancialSummary → PlRow for backward-compatible API response.

  async getPl(orgId: number, query: ReportRangeDto) {
    const year = query.year ?? new Date().getFullYear();
    const rows = await this.financial.getMonthlySummaries(orgId, year);

    return rows.map(r => ({
      month:              r.month,
      revenue:            r.netSales,
      totalFees:          r.totalFees,
      feesBeforeVat:      r.feesBeforeVAT,
      vatOnFees:          r.vatOnFees,
      cogs:               r.cogs,
      grossProfit:        Math.round((r.netSales - r.totalFees) * 100) / 100,
      netProfit:          r.accountingProfit,
      operationalProfit:  r.operationalProfit,
      // Legacy breakdown fields kept for export compatibility
      referralFees:   0,
      fbnFees:        0,
      stmtFees:       0,
      stmtFeesExclVat: r.feesBeforeVAT,
      stmtFeesVat:    r.vatOnFees,
    }));
  }

  // ── Sales per SKU ──────────────────────────────────────────────────────────

  async getSales(orgId: number, query: SalesReportDto) {
    const { from, to } = this.resolveRange(query);

    const where: any = {
      organizationId: orgId,
      orderedDate:    { gte: from, lt: to },
    };
    if (query.status) where.itemStatus = { equals: query.status, mode: 'insensitive' };
    if (query.brand)  where.brandEn    = { contains: query.brand, mode: 'insensitive' };

    const orders = await this.prisma.order.findMany({
      where,
      select: {
        sku: true, brandEn: true, netProceeds: true,
        referralFee: true, fbnOutboundFee: true, itemStatus: true,
      },
    });

    const products = await this.prisma.product.findMany({
      where:  { organizationId: orgId },
      select: { sku: true, partnerSku: true, unitCost: true, extraCosts: true, costIncludesVat: true, nameEn: true, brand: true },
    });
    const costMap = new Map(products.map(p => [p.sku, p]));

    const skuMap = new Map<string, {
      sku: string; partnerSku: string | null; brand: string; name: string;
      units: number; returns: number;
      revenue: number; feesSigned: number; cogs: number; extra: number;
    }>();

    for (const o of orders) {
      const sku    = o.sku ?? 'unknown';
      const status = (o.itemStatus ?? '').toLowerCase();
      if (!skuMap.has(sku)) {
        const p = costMap.get(sku);
        skuMap.set(sku, {
          sku, partnerSku: p?.partnerSku ?? null, brand: o.brandEn ?? p?.brand ?? '',
          name: p?.nameEn ?? '', units: 0, returns: 0, revenue: 0, feesSigned: 0, cogs: 0, extra: 0,
        });
      }
      const row = skuMap.get(sku)!;
      if (status === 'delivered') {
        row.units   += 1;
        row.revenue += Number(o.netProceeds ?? 0);
        const p = costMap.get(sku);
        if (p?.unitCost) {
          const cost = Number(p.unitCost);
          row.cogs += p.costIncludesVat ? cost / 1.15 : cost;
        }
        if (p?.extraCosts) row.extra += Number(p.extraCosts);
      } else if (status === 'returned') {
        row.returns += 1;
        row.revenue -= Math.abs(Number(o.netProceeds ?? 0));
      }
      row.feesSigned += Number(o.referralFee ?? 0) + Number(o.fbnOutboundFee ?? 0);
    }

    const rows = Array.from(skuMap.values()).map(r => {
      const fees = Math.abs(r.feesSigned);
      return {
        sku: r.sku, partnerSku: r.partnerSku, brand: r.brand, name: r.name,
        units: r.units, returns: r.returns,
        revenue: r.revenue, fees, cogs: r.cogs, extra: r.extra,
        profit: r.revenue - fees - r.cogs - r.extra,
      };
    });

    const sortBy = query.sortBy ?? 'revenue';
    rows.sort((a, b) =>
      sortBy === 'profit' ? b.profit  - a.profit  :
      sortBy === 'units'  ? b.units   - a.units   :
                            b.revenue - a.revenue
    );
    return rows;
  }

  // ── Fees per SKU + statement fees breakdown ────────────────────────────────

  async getFees(orgId: number, query: FeesReportDto) {
    const { from, to } = this.resolveRange(query);
    const fromMonth = from.toISOString().slice(0, 7);
    const toMonth   = to.toISOString().slice(0, 7);

    const where: any = { organizationId: orgId, orderedDate: { gte: from, lt: to } };
    if (query.brand) where.brandEn = { contains: query.brand, mode: 'insensitive' };

    const [orders, products, stmtFeeRows] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: { sku: true, brandEn: true, referralFee: true, fbnOutboundFee: true, netProceeds: true, itemStatus: true },
      }),
      this.prisma.product.findMany({
        where:  { organizationId: orgId },
        select: { sku: true, partnerSku: true, nameEn: true, brand: true },
      }),
      this.prisma.statementFee.findMany({
        where: {
          organizationId: orgId,
          statementDate:  { gte: fromMonth, lt: nextMonthStr(toMonth) },
        },
        select: { description: true, feeType: true, category: true, exclVat: true, vatAmount: true, inclVat: true },
      }),
    ]);

    const prodMap = new Map(products.map(p => [p.sku, p]));

    const feeMap = new Map<string, {
      sku: string; partnerSku: string | null; brand: string; name: string;
      units: number; returns: number;
      referralFees: number; fbnFees: number; totalFees: number; revenue: number; feeRate: number;
    }>();

    for (const o of orders) {
      const sku    = o.sku ?? 'unknown';
      const status = (o.itemStatus ?? '').toLowerCase();
      if (!feeMap.has(sku)) {
        const p = prodMap.get(sku);
        feeMap.set(sku, {
          sku, partnerSku: p?.partnerSku ?? null, brand: o.brandEn ?? p?.brand ?? '', name: p?.nameEn ?? '',
          units: 0, returns: 0, referralFees: 0, fbnFees: 0, totalFees: 0, revenue: 0, feeRate: 0,
        });
      }
      const row = feeMap.get(sku)!;
      if (status === 'delivered') { row.units++; row.revenue += Number(o.netProceeds ?? 0); }
      if (status === 'returned')  row.returns++;
      row.referralFees += Number(o.referralFee    ?? 0);
      row.fbnFees      += Number(o.fbnOutboundFee ?? 0);
    }

    const items = Array.from(feeMap.values()).map(r => {
      r.referralFees = Math.abs(r.referralFees);
      r.fbnFees      = Math.abs(r.fbnFees);
      r.totalFees    = r.referralFees + r.fbnFees;
      r.feeRate      = r.revenue > 0 ? (r.totalFees / r.revenue) * 100 : 0;
      return r;
    }).sort((a, b) => b.totalFees - a.totalFees);

    // Statement fees breakdown
    const FEE_CAT_LABELS: Record<string, string> = {
      referralFee: 'referralFee', fbnOutboundFee: 'fbnOutboundFee',
    };
    const byCategory: Record<string, number> = {};
    let totalExclVat = 0, totalVat = 0, totalInclVat = 0;
    const feeItems: { description: string; feeType: string; category: string; exclVat: number; vatAmount: number; inclVat: number }[] = [];

    for (const f of stmtFeeRows) {
      const cat  = f.category ?? classifyFeeDescription(f.description ?? '');
      const excl = Math.abs(Number(f.exclVat));
      const vat  = Math.abs(Number(f.vatAmount));
      const incl = Math.abs(Number(f.inclVat));
      byCategory[cat] = (byCategory[cat] ?? 0) + incl;
      totalExclVat += excl;
      totalVat     += vat;
      totalInclVat += incl;
      feeItems.push({ description: f.description ?? '', feeType: f.feeType, category: cat, exclVat: excl, vatAmount: vat, inclVat: incl });
    }

    return {
      items,
      statementFees: {
        total:        Math.round(totalInclVat * 100) / 100,
        totalExclVat: Math.round(totalExclVat * 100) / 100,
        totalVat:     Math.round(totalVat     * 100) / 100,
        byCategory,
        rows: feeItems,
      },
    };
  }

  // ── Inventory report ───────────────────────────────────────────────────────

  async getInventory(orgId: number) {
    const groups = await this.prisma.inventoryMovement.groupBy({
      by:    ['sku', 'warehouseId'],
      where: { organizationId: orgId, isVoid: false },
      _sum:  { quantity: true },
    });

    const warehouses = await this.prisma.warehouse.findMany({
      where:  { organizationId: orgId },
      select: { id: true, name: true, code: true },
    });
    const whMap = new Map(warehouses.map(w => [w.id, w]));

    const products = await this.prisma.product.findMany({
      where:  { organizationId: orgId },
      select: { sku: true, nameEn: true, nameAr: true, brand: true, unitCost: true },
    });
    const prodMap = new Map(products.map(p => [p.sku, p]));

    return groups.map(g => {
      const wh   = g.warehouseId ? whMap.get(g.warehouseId) : null;
      const p    = prodMap.get(g.sku);
      const qty  = g._sum.quantity ?? 0;
      const cost = p?.unitCost ? Number(p.unitCost) * qty : null;
      return {
        sku:       g.sku,
        nameEn:    p?.nameEn ?? null,
        brand:     p?.brand  ?? null,
        warehouse: wh ? { id: wh.id, name: wh.name, code: wh.code } : null,
        qty,
        unitCost:  p?.unitCost ?? null,
        totalCost: cost,
      };
    }).sort((a, b) => a.sku.localeCompare(b.sku));
  }

  // ── Invoices report ────────────────────────────────────────────────────────

  async getInvoicesReport(orgId: number, query: ReportRangeDto) {
    const { from, to } = this.resolveRange(query);

    const invoices = await this.prisma.invoice.findMany({
      where:   { organizationId: orgId, status: 'active', invoiceDate: { gte: from, lt: to } },
      include: { warehouse: { select: { name: true } } },
      orderBy: [{ supplierName: 'asc' }, { invoiceDate: 'asc' }],
    });

    const totals = invoices.reduce(
      (acc, inv) => {
        acc.subtotal  += Number(inv.subtotal  ?? 0);
        acc.vatAmount += Number(inv.vatAmount ?? 0);
        acc.total     += Number(inv.totalAmount ?? 0);
        return acc;
      },
      { subtotal: 0, vatAmount: 0, total: 0 },
    );

    return { invoices, totals };
  }

  // ── Dashboard data ─────────────────────────────────────────────────────────
  // Uses FinancialSummaryService for all KPIs — guaranteed consistent with all other pages.

  async getDashboardData(orgId: number) {
    const [financials, daily, topProductsRaw] = await Promise.all([
      // All-time summary — no date filter means all data
      this.financial.getSummary(orgId, {}),
      // Daily revenue chart
      this.prisma.$queryRaw<{ date: string; revenue: number }[]>`
        SELECT
          to_char("ordered_date", 'YYYY-MM-DD') AS date,
          COALESCE(SUM(
            CASE WHEN LOWER("item_status") = 'delivered' THEN "net_proceeds"::numeric
                 WHEN LOWER("item_status") = 'returned'  THEN -ABS("net_proceeds"::numeric)
                 ELSE 0 END
          ), 0) AS revenue
        FROM orders
        WHERE organization_id = ${orgId}
          AND "ordered_date" IS NOT NULL
        GROUP BY to_char("ordered_date", 'YYYY-MM-DD')
        ORDER BY date
      `,
      // Top 5 products by revenue
      this.prisma.order.groupBy({
        by:    ['sku'],
        where: { organizationId: orgId, itemStatus: { equals: 'delivered', mode: 'insensitive' }, sku: { not: null } },
        _sum:  { netProceeds: true },
        orderBy: { _sum: { netProceeds: 'desc' } },
        take:  5,
      }),
    ]);

    const topSkus = topProductsRaw.map(r => r.sku!);
    const topProds = topSkus.length
      ? await this.prisma.product.findMany({
          where:  { organizationId: orgId, sku: { in: topSkus } },
          select: { sku: true, nameEn: true },
        })
      : [];
    const topProdMap = new Map(topProds.map(p => [p.sku, p]));

    return {
      summary: {
        revenue:           financials.netSales,
        grossSales:        financials.grossSales,
        returns:           financials.returns,
        fees:              financials.totalFees,
        feesBeforeVat:     financials.feesBeforeVAT,
        vatOnFees:         financials.vatOnFees,
        cogs:              financials.cogs,
        netProfit:         financials.accountingProfit,
        operationalProfit: financials.operationalProfit,
        activeProfit:      financials.activeProfit,
        marginPct:         financials.marginPct,
        deliveredCount:    financials.deliveredCount,
        returnedCount:     financials.returnedCount,
        vatRegistered:     financials.vatRegistered,
        profitMode:        financials.profitMode,
        vatPayable:        financials.vatPayable,
      },
      dailyRevenue: daily.map(r => ({ date: r.date, revenue: Number(r.revenue) })),
      topProducts:  topProductsRaw.map(r => ({
        sku:     r.sku,
        name:    topProdMap.get(r.sku!)?.nameEn ?? r.sku,
        revenue: Number(r._sum.netProceeds ?? 0),
      })),
      orderStatus: { delivered: financials.deliveredCount, returned: financials.returnedCount },
    };
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private resolveRange(query: { year?: number; startDate?: string; endDate?: string }) {
    if (query.startDate || query.endDate) {
      const from = query.startDate ? new Date(query.startDate + 'T00:00:00Z') : new Date('2000-01-01T00:00:00Z');
      const to   = query.endDate   ? new Date(query.endDate   + 'T23:59:59Z') : new Date('2100-01-01T00:00:00Z');
      return { from, to };
    }
    const year = query.year ?? new Date().getFullYear();
    return {
      from: new Date(`${year}-01-01T00:00:00Z`),
      to:   new Date(`${year + 1}-01-01T00:00:00Z`),
    };
  }
}
