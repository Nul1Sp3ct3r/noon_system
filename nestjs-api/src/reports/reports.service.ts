import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesReportDto, FeesReportDto, ReportRangeDto } from './dto/report-query.dto';

const VAT_FACTOR = 15 / 115;

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
        select: { exclVat: true, vatAmount: true, statementDate: true },
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
      totalFees: number;
      cogs: number;
      extra: number;
      supplierVat: number;
      grossProfit: number;
      netProfit: number;
    }> = {};

    const getMonth = (d: Date | null) => d ? d.toISOString().slice(0, 7) : 'unknown';

    for (const o of orders) {
      const status = (o.itemStatus ?? '').toLowerCase();
      if (status !== 'delivered') continue;

      const m = getMonth(o.orderedDate);
      if (!months[m]) months[m] = this.emptyPlRow(m);

      months[m].revenue     += Number(o.netProceeds ?? 0);
      months[m].referralFees += Math.abs(Number(o.referralFee ?? 0));
      months[m].fbnFees      += Math.abs(Number(o.fbnOutboundFee ?? 0));

      if (o.sku) {
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
      months[m].stmtFees += Math.abs(Number(f.exclVat));
    }

    for (const item of invoiceItems) {
      const m = getMonth(item.invoice.invoiceDate);
      if (!months[m]) months[m] = this.emptyPlRow(m);
      months[m].supplierVat += Number(item.lineVat);
    }

    const rows = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    for (const r of rows) {
      r.totalFees   = r.referralFees + r.fbnFees + r.stmtFees;
      r.grossProfit = r.revenue - r.totalFees;
      r.netProfit   = r.grossProfit - r.cogs - r.extra;
    }
    return rows;
  }

  private emptyPlRow(month: string) {
    return {
      month, revenue: 0, referralFees: 0, fbnFees: 0, stmtFees: 0,
      totalFees: 0, cogs: 0, extra: 0, supplierVat: 0, grossProfit: 0, netProfit: 0,
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
    }>();

    for (const o of orders) {
      const sku = o.sku ?? 'unknown';
      const status = (o.itemStatus ?? '').toLowerCase();
      if (!skuMap.has(sku)) {
        const p = costMap.get(sku);
        skuMap.set(sku, {
          sku, brand: o.brandEn ?? p?.brand ?? '', name: p?.nameEn ?? '',
          units: 0, returns: 0, revenue: 0, fees: 0, cogs: 0, extra: 0, profit: 0,
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
      }
      row.fees += Math.abs(Number(o.referralFee ?? 0)) + Math.abs(Number(o.fbnOutboundFee ?? 0));
    }

    const rows = Array.from(skuMap.values()).map(r => ({
      ...r, profit: r.revenue - r.fees - r.cogs - r.extra,
    }));

    const sortBy = query.sortBy ?? 'revenue';
    rows.sort((a, b) => {
      if (sortBy === 'profit')  return b.profit - a.profit;
      if (sortBy === 'units')   return b.units  - a.units;
      return b.revenue - a.revenue;
    });
    return rows;
  }

  // ── Fees per SKU ───────────────────────────────────────────────────────────

  async getFees(orgId: number, query: FeesReportDto) {
    const { from, to } = this.resolveRange(query);

    const where: any = { organizationId: orgId, orderedDate: { gte: from, lt: to } };
    if (query.brand) where.brandEn = { contains: query.brand, mode: 'insensitive' };

    const orders = await this.prisma.order.findMany({
      where,
      select: {
        sku: true, brandEn: true, referralFee: true,
        fbnOutboundFee: true, netProceeds: true, itemStatus: true,
      },
    });

    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId },
      select: { sku: true, nameEn: true, brand: true },
    });
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
      row.referralFees += Math.abs(Number(o.referralFee ?? 0));
      row.fbnFees      += Math.abs(Number(o.fbnOutboundFee ?? 0));
    }

    return Array.from(feeMap.values()).map(r => {
      r.totalFees = r.referralFees + r.fbnFees;
      r.feeRate   = r.revenue > 0 ? (r.totalFees / r.revenue) * 100 : 0;
      return r;
    }).sort((a, b) => b.totalFees - a.totalFees);
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
    const [orderAgg, products, daily] = await Promise.all([
      this.prisma.order.aggregate({
        where: { organizationId: orgId },
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
          COALESCE(SUM(CASE WHEN LOWER("item_status") = 'delivered' THEN "net_proceeds"::numeric ELSE 0 END), 0) AS revenue
        FROM orders
        WHERE organization_id = ${orgId}
          AND "ordered_date" IS NOT NULL
        GROUP BY to_char("ordered_date", 'YYYY-MM-DD')
        ORDER BY date
      `,
    ]);

    const deliveredCount = await this.prisma.order.count({
      where: { organizationId: orgId, itemStatus: { equals: 'delivered', mode: 'insensitive' } },
    });
    const returnedCount = await this.prisma.order.count({
      where: { organizationId: orgId, itemStatus: { equals: 'returned', mode: 'insensitive' } },
    });

    const revenue  = Number(orderAgg._sum.netProceeds ?? 0);
    const fees     = Math.abs(Number(orderAgg._sum.referralFee ?? 0)) + Math.abs(Number(orderAgg._sum.fbnOutboundFee ?? 0));
    const payout   = Number(orderAgg._sum.totalPayment ?? 0);

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

    const netProfit   = revenue - fees - totalCogs - totalExtra;
    const marginPct   = revenue > 0 ? Math.round(netProfit / revenue * 10000) / 100 : null;

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
        revenue:        Math.round(revenue * 100) / 100,
        payout:         Math.round(payout * 100) / 100,
        fees:           Math.round(fees * 100) / 100,
        deliveredCount,
        returnedCount,
        netProfit:      Math.round(netProfit * 100) / 100,
        marginPct,
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
