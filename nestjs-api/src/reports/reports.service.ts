import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesReportDto, FeesReportDto, ReportRangeDto } from './dto/report-query.dto';

const VAT_FACTOR = 15 / 115;

function classifyFeeDesc(desc: string): string {
  const d = (desc ?? '').toLowerCase();
  if (d.includes('referral'))                                             return 'referralFee';
  if (d.includes('fbn outbound') || d.includes('fbn out'))               return 'fbnOutboundFee';
  if (d.includes('storage'))                                              return 'storageFee';
  if (d.includes('return administration') || d.includes('return admin')) return 'returnFee';
  if (d.includes('damaged return') || d.includes('damaged item'))        return 'damageFee';
  if (d.includes('rtv') || d.includes('removal'))                        return 'removalFee';
  if (d.includes('compensation'))                                         return 'compensation';
  return 'other';
}

function nextMonthStr(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ── P&L ────────────────────────────────────────────────────────────────────

  async getPl(orgId: number, query: ReportRangeDto) {
    const { from, to } = this.resolveRange(query);

    const [orders, fees, invoiceItems] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          organizationId: orgId,
          orderedDate: { gte: from, lt: to },
          itemStatus: { not: null },
        },
        select: {
          netProceeds: true, referralFee: true, fbnOutboundFee: true,
          orderedDate: true, sku: true, itemStatus: true,
        },
      }),
      this.prisma.statementFee.findMany({
        where: { organizationId: orgId, statementDate: { gte: from.toISOString().slice(0, 7), lte: to.toISOString().slice(0, 7) } },
        select: { exclVat: true, vatAmount: true, inclVat: true, statementDate: true },
      }),
      this.prisma.invoiceItem.findMany({
        where: {
          invoice: {
            organizationId: orgId,
            status: 'active',
            invoiceDate: { gte: from, lt: to },
          },
        },
        select: {
          lineSubtotal: true, lineVat: true,
          invoice: { select: { invoiceDate: true } },
        },
      }),
    ]);

    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId },
      select: { sku: true, unitCost: true, extraCosts: true, costIncludesVat: true },
    });
    const costMap = new Map(products.map(p => [p.sku, p]));

    const months: Record<string, {
      month: string;
      revenue: number;
      referralFees: number;
      fbnFees: number;
      stmtFees: number;
      stmtFeesExclVat: number;
      stmtFeesVat: number;
      totalFees: number;
      feesBeforeVat: number;
      vatOnFees: number;
      cogs: number;
      extra: number;
      supplierVat: number;
      grossProfit: number;
      netProfit: number;
      operationalProfit: number;
    }> = {};

    const getMonth = (d: Date | null) => d ? d.toISOString().slice(0, 7) : 'unknown';

    for (const o of orders) {
      const status = (o.itemStatus ?? '').toLowerCase();
      if (status !== 'delivered' && status !== 'returned') continue;

      const m = getMonth(o.orderedDate);
      if (!months[m]) months[m] = this.emptyPlRow(m);

      // netProceeds: positive for delivered, negative for returned (creditnote sign)
      // summing both gives Net Sales = Gross Sales − Returns
      months[m].revenue      += Number(o.netProceeds    ?? 0);
      months[m].referralFees += Number(o.referralFee    ?? 0);
      months[m].fbnFees      += Number(o.fbnOutboundFee ?? 0);

      if (status === 'delivered' && o.sku) {
        const p = costMap.get(o.sku);
        if (p?.unitCost) {
          const cost = Number(p.unitCost);
          const unitCostExcl = p.costIncludesVat ? cost / 1.15 : cost;
          months[m].cogs += unitCostExcl;
        }
        if (p?.extraCosts) {
          months[m].extra += Number(p.extraCosts);
        }
      }
    }

    for (const f of fees) {
      const m = (f.statementDate ?? '').slice(0, 7);
      if (!months[m]) months[m] = this.emptyPlRow(m);
      months[m].stmtFeesExclVat += Math.abs(Number(f.exclVat));
      months[m].stmtFeesVat     += Math.abs(Number(f.vatAmount));
      months[m].stmtFees        += Math.abs(Number(f.inclVat));
    }

    for (const item of invoiceItems) {
      const m = getMonth(item.invoice.invoiceDate);
      if (!months[m]) months[m] = this.emptyPlRow(m);
      months[m].supplierVat += Number(item.lineVat);
    }

    const rows = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    for (const r of rows) {
      r.referralFees     = Math.abs(r.referralFees);
      r.fbnFees          = Math.abs(r.fbnFees);
      r.totalFees        = r.referralFees + r.fbnFees + r.stmtFees;
      r.feesBeforeVat    = r.referralFees + r.fbnFees + r.stmtFeesExclVat;
      r.vatOnFees        = r.stmtFeesVat;
      r.grossProfit      = r.revenue - r.totalFees;
      r.netProfit        = r.grossProfit - r.cogs - r.extra;
      r.operationalProfit = r.revenue - r.feesBeforeVat - r.cogs - r.extra;
    }
    return rows;
  }

  private emptyPlRow(month: string) {
    return {
      month, revenue: 0, referralFees: 0, fbnFees: 0,
      stmtFees: 0, stmtFeesExclVat: 0, stmtFeesVat: 0,
      totalFees: 0, feesBeforeVat: 0, vatOnFees: 0,
      cogs: 0, extra: 0, supplierVat: 0,
      grossProfit: 0, netProfit: 0, operationalProfit: 0,
    };
  }

  // ── Sales per SKU ──────────────────────────────────────────────────────────

  async getSales(orgId: number, query: SalesReportDto) {
    const { from, to } = this.resolveRange(query);

    const where: any = {
      organizationId: orgId,
      orderedDate: { gte: from, lt: to },
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
      where: { organizationId: orgId },
      select: { sku: true, unitCost: true, extraCosts: true, costIncludesVat: true, nameEn: true, brand: true },
    });
    const costMap = new Map(products.map(p => [p.sku, p]));

    const skuMap = new Map<string, {
      sku: string; brand: string; name: string;
      units: number; returns: number;
      revenue: number; fees: number; cogs: number; extra: number; profit: number;
      feesSigned: number;
    }>();

    for (const o of orders) {
      const sku = o.sku ?? 'unknown';
      const status = (o.itemStatus ?? '').toLowerCase();
      if (!skuMap.has(sku)) {
        const p = costMap.get(sku);
        skuMap.set(sku, {
          sku, brand: o.brandEn ?? p?.brand ?? '', name: p?.nameEn ?? '',
          units: 0, returns: 0, revenue: 0, fees: 0, cogs: 0, extra: 0, profit: 0,
          feesSigned: 0,
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
        // netProceeds for returned orders is negative (creditnote) — adds to revenue naturally
        row.revenue += Number(o.netProceeds ?? 0);
      }
      row.feesSigned += Number(o.referralFee ?? 0) + Number(o.fbnOutboundFee ?? 0);
    }

    const rows = Array.from(skuMap.values()).map(r => {
      const fees = Math.abs(r.feesSigned);
      return { sku: r.sku, brand: r.brand, name: r.name, units: r.units, returns: r.returns,
               revenue: r.revenue, fees, cogs: r.cogs, extra: r.extra,
               profit: r.revenue - fees - r.cogs - r.extra };
    });

    const sortBy = query.sortBy ?? 'revenue';
    rows.sort((a, b) => {
      if (sortBy === 'profit')  return b.profit - a.profit;
      if (sortBy === 'units')   return b.units  - a.units;
      return b.revenue - a.revenue;
    });
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
        select: {
          sku: true, brandEn: true, referralFee: true,
          fbnOutboundFee: true, netProceeds: true, itemStatus: true,
        },
      }),
      this.prisma.product.findMany({
        where: { organizationId: orgId },
        select: { sku: true, nameEn: true, brand: true },
      }),
      this.prisma.statementFee.findMany({
        where: {
          organizationId: orgId,
          statementDate: { gte: fromMonth, lt: nextMonthStr(toMonth) },
        },
        select: { description: true, feeType: true, exclVat: true, vatAmount: true, inclVat: true },
      }),
    ]);

    const prodMap = new Map(products.map(p => [p.sku, p]));

    const feeMap = new Map<string, {
      sku: string; brand: string; name: string;
      units: number; returns: number;
      referralFees: number; fbnFees: number; totalFees: number; revenue: number; feeRate: number;
    }>();

    for (const o of orders) {
      const sku = o.sku ?? 'unknown';
      const status = (o.itemStatus ?? '').toLowerCase();
      if (!feeMap.has(sku)) {
        const p = prodMap.get(sku);
        feeMap.set(sku, {
          sku, brand: o.brandEn ?? p?.brand ?? '', name: p?.nameEn ?? '',
          units: 0, returns: 0, referralFees: 0, fbnFees: 0, totalFees: 0, revenue: 0, feeRate: 0,
        });
      }
      const row = feeMap.get(sku)!;
      if (status === 'delivered') { row.units++; row.revenue += Number(o.netProceeds ?? 0); }
      if (status === 'returned')  row.returns++;
      // Accumulate signed — credits on returns naturally reduce the total
      row.referralFees += Number(o.referralFee    ?? 0);
      row.fbnFees      += Number(o.fbnOutboundFee ?? 0);
    }

    const items = Array.from(feeMap.values()).map(r => {
      r.referralFees = Math.abs(r.referralFees);  // abs of signed sum
      r.fbnFees      = Math.abs(r.fbnFees);
      r.totalFees    = r.referralFees + r.fbnFees;
      r.feeRate      = r.revenue > 0 ? (r.totalFees / r.revenue) * 100 : 0;
      return r;
    }).sort((a, b) => b.totalFees - a.totalFees);

    // Statement fees breakdown by description category
    const byCategory: Record<string, number> = {};
    let totalExclVat = 0;
    let totalVat     = 0;
    let totalInclVat = 0;
    const feeItems: { description: string; feeType: string; category: string; exclVat: number; vatAmount: number; inclVat: number }[] = [];

    for (const f of stmtFeeRows) {
      const cat    = classifyFeeDesc(f.description ?? '');
      const excl   = Math.abs(Number(f.exclVat));
      const vat    = Math.abs(Number(f.vatAmount));
      const incl   = Math.abs(Number(f.inclVat));
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
        rows:         feeItems,
      },
    };
  }

  // ── Inventory report ───────────────────────────────────────────────────────

  async getInventory(orgId: number) {
    const groups = await this.prisma.inventoryMovement.groupBy({
      by: ['sku', 'warehouseId'],
      where: { organizationId: orgId, isVoid: false },
      _sum: { quantity: true },
    });

    const warehouses = await this.prisma.warehouse.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, code: true },
    });
    const whMap = new Map(warehouses.map(w => [w.id, w]));

    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId },
      select: { sku: true, nameEn: true, nameAr: true, brand: true, unitCost: true },
    });
    const prodMap = new Map(products.map(p => [p.sku, p]));

    return groups.map(g => {
      const wh  = g.warehouseId ? whMap.get(g.warehouseId) : null;
      const p   = prodMap.get(g.sku);
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
      where: { organizationId: orgId, status: 'active', invoiceDate: { gte: from, lt: to } },
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

  async getDashboardData(orgId: number) {
    const [orderAgg, products, daily, stmtFeeAgg, orgSettings] = await Promise.all([
      // Sum delivered + returned; returned netProceeds are negative (creditnotes),
      // so the total gives Net Sales = Gross Sales − Returns automatically.
      this.prisma.order.aggregate({
        where: {
          organizationId: orgId,
          OR: [
            { itemStatus: { equals: 'delivered', mode: 'insensitive' } },
            { itemStatus: { equals: 'returned',  mode: 'insensitive' } },
          ],
        },
        _sum: { netProceeds: true, referralFee: true, fbnOutboundFee: true, totalPayment: true },
        _count: { id: true },
      }),
      this.prisma.product.findMany({
        where: { organizationId: orgId },
        select: { sku: true, unitCost: true, extraCosts: true, costIncludesVat: true },
      }),
      this.prisma.$queryRaw<{ date: string; revenue: number }[]>`
        SELECT
          to_char("ordered_date", 'YYYY-MM-DD') AS date,
          COALESCE(SUM(
            CASE WHEN LOWER("item_status") IN ('delivered', 'returned')
                 THEN "net_proceeds"::numeric ELSE 0 END
          ), 0) AS revenue
        FROM orders
        WHERE organization_id = ${orgId}
          AND "ordered_date" IS NOT NULL
        GROUP BY to_char("ordered_date", 'YYYY-MM-DD')
        ORDER BY date
      `,
      this.prisma.statementFee.aggregate({
        where: { organizationId: orgId },
        _sum:  { inclVat: true, exclVat: true, vatAmount: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { vatRegistered: true, profitMode: true },
      }),
    ]);

    const deliveredCount = await this.prisma.order.count({
      where: { organizationId: orgId, itemStatus: { equals: 'delivered', mode: 'insensitive' } },
    });
    const returnedCount = await this.prisma.order.count({
      where: { organizationId: orgId, itemStatus: { equals: 'returned', mode: 'insensitive' } },
    });

    const revenue        = Number(orderAgg._sum.netProceeds ?? 0);
    const orderFees      = Math.abs(Number(orderAgg._sum.referralFee ?? 0)) + Math.abs(Number(orderAgg._sum.fbnOutboundFee ?? 0));
    const stmtFees       = Math.abs(Number(stmtFeeAgg._sum.inclVat   ?? 0));
    const stmtFeesExcl   = Math.abs(Number(stmtFeeAgg._sum.exclVat   ?? 0));
    const stmtFeesVat    = Math.abs(Number(stmtFeeAgg._sum.vatAmount  ?? 0));
    const fees           = orderFees + stmtFees;
    const feesBeforeVat  = orderFees + stmtFeesExcl;
    const payout         = Number(orderAgg._sum.totalPayment ?? 0);

    const prodMap = new Map(products.map(p => [p.sku, p]));
    let totalCogs = 0;
    let totalExtra = 0;
    for (const o of await this.prisma.order.findMany({
      where: { organizationId: orgId, itemStatus: { equals: 'delivered', mode: 'insensitive' } },
      select: { sku: true },
    })) {
      if (o.sku) {
        const p = prodMap.get(o.sku);
        if (p?.unitCost) totalCogs  += p.costIncludesVat ? Number(p.unitCost) / 1.15 : Number(p.unitCost);
        if (p?.extraCosts) totalExtra += Number(p.extraCosts);
      }
    }

    const netProfit         = revenue - fees           - totalCogs - totalExtra;
    const operationalProfit = revenue - feesBeforeVat  - totalCogs - totalExtra;
    const vatRegistered     = orgSettings?.vatRegistered ?? false;
    const profitMode        = orgSettings?.profitMode ?? 'expense';
    const mainProfit        = vatRegistered && profitMode === 'recoverable' ? operationalProfit : netProfit;
    const marginPct         = revenue > 0 ? Math.round(mainProfit / revenue * 10000) / 100 : null;

    const topProductsRaw = await this.prisma.order.groupBy({
      by: ['sku'],
      where: { organizationId: orgId, itemStatus: { equals: 'delivered', mode: 'insensitive' }, sku: { not: null } },
      _sum: { netProceeds: true },
      orderBy: { _sum: { netProceeds: 'desc' } },
      take: 5,
    });

    const topSkus = topProductsRaw.map(r => r.sku!);
    const topProds = await this.prisma.product.findMany({
      where: { organizationId: orgId, sku: { in: topSkus } },
      select: { sku: true, nameEn: true },
    });
    const topProdMap = new Map(topProds.map(p => [p.sku, p]));

    const topProducts = topProductsRaw.map(r => ({
      sku:     r.sku,
      name:    topProdMap.get(r.sku!)?.nameEn ?? r.sku,
      revenue: Number(r._sum.netProceeds ?? 0),
    }));

    return {
      summary: {
        revenue:            Math.round(revenue            * 100) / 100,
        payout:             Math.round(payout             * 100) / 100,
        fees:               Math.round(fees               * 100) / 100,
        orderFees:          Math.round(orderFees          * 100) / 100,
        stmtFees:           Math.round(stmtFees           * 100) / 100,
        feesBeforeVat:      Math.round(feesBeforeVat      * 100) / 100,
        vatOnFees:          Math.round(stmtFeesVat        * 100) / 100,
        deliveredCount,
        returnedCount,
        netProfit:          Math.round(netProfit          * 100) / 100,
        operationalProfit:  Math.round(operationalProfit  * 100) / 100,
        marginPct,
        vatRegistered,
        profitMode,
      },
      dailyRevenue: daily.map(r => ({ date: r.date, revenue: Number(r.revenue) })),
      topProducts,
      orderStatus: { delivered: deliveredCount, returned: returnedCount },
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
