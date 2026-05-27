import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesReportDto, FeesReportDto, ReportYearDto } from './dto/report-query.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ── P&L ────────────────────────────────────────────────────────────────────

  async getPl(orgId: number, query: ReportYearDto) {
    const year = query.year ?? new Date().getFullYear();
    const from = new Date(`${year}-01-01T00:00:00Z`);
    const to   = new Date(`${year + 1}-01-01T00:00:00Z`);

    const [orders, fees, invoices] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          organizationId: orgId,
          orderedDate: { gte: from, lt: to },
          itemStatus: 'Delivered',
        },
        select: { totalPayment: true, referralFee: true, fbnOutboundFee: true, orderedDate: true, sku: true },
      }),
      this.prisma.statementFee.findMany({
        where: { organizationId: orgId, statementDate: { startsWith: String(year) } },
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
          lineSubtotal: true,
          lineVat: true,
          sku: true,
          quantity: true,
          unitPrice: true,
          invoice: {
            select: { invoiceDate: true, vatMode: true },
          },
        },
      }),
    ]);

    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId },
      select: { sku: true, unitCost: true, costIncludesVat: true },
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
      supplierVat: number;
      grossProfit: number;
      netProfit: number;
    }> = {};

    const getMonth = (d: Date | null) => d ? d.toISOString().slice(0, 7) : 'unknown';

    for (const o of orders) {
      const m = getMonth(o.orderedDate);
      if (!months[m]) months[m] = this.emptyPlRow(m);
      months[m].revenue    += Number(o.totalPayment ?? 0);
      months[m].referralFees += Math.abs(Number(o.referralFee ?? 0));
      months[m].fbnFees    += Math.abs(Number(o.fbnOutboundFee ?? 0));

      if (o.sku) {
        const p = costMap.get(o.sku);
        if (p?.unitCost) {
          const cost = Number(p.unitCost);
          const cogs = p.costIncludesVat ? cost / 1.15 : cost;
          months[m].cogs += cogs;
        }
      }
    }

    for (const f of fees) {
      const m = (f.statementDate ?? '').slice(0, 7);
      if (!months[m]) months[m] = this.emptyPlRow(m);
      months[m].stmtFees += Number(f.exclVat);
    }

    for (const item of invoices) {
      const m = getMonth(item.invoice.invoiceDate);
      if (!months[m]) months[m] = this.emptyPlRow(m);
      months[m].supplierVat += Number(item.lineVat);
    }

    const rows = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    for (const r of rows) {
      r.totalFees   = r.referralFees + r.fbnFees + r.stmtFees;
      r.grossProfit = r.revenue - r.totalFees;
      r.netProfit   = r.grossProfit - r.cogs;
    }
    return rows;
  }

  private emptyPlRow(month: string) {
    return { month, revenue: 0, referralFees: 0, fbnFees: 0, stmtFees: 0, totalFees: 0, cogs: 0, supplierVat: 0, grossProfit: 0, netProfit: 0 };
  }

  // ── Sales per SKU ──────────────────────────────────────────────────────────

  async getSales(orgId: number, query: SalesReportDto) {
    const year = query.year ?? new Date().getFullYear();
    const from = new Date(`${year}-01-01T00:00:00Z`);
    const to   = new Date(`${year + 1}-01-01T00:00:00Z`);

    const where: any = {
      organizationId: orgId,
      orderedDate: { gte: from, lt: to },
    };
    if (query.status) where.itemStatus = query.status;
    if (query.brand)  where.brandEn    = { contains: query.brand, mode: 'insensitive' };

    const orders = await this.prisma.order.findMany({
      where,
      select: { sku: true, brandEn: true, totalPayment: true, referralFee: true, fbnOutboundFee: true, itemStatus: true },
    });

    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId },
      select: { sku: true, unitCost: true, costIncludesVat: true, nameEn: true, brand: true },
    });
    const costMap = new Map(products.map(p => [p.sku, p]));

    const skuMap = new Map<string, {
      sku: string; brand: string; name: string;
      units: number; revenue: number; fees: number; cogs: number; profit: number;
    }>();

    for (const o of orders) {
      const sku = o.sku ?? 'unknown';
      if (!skuMap.has(sku)) {
        const p = costMap.get(sku);
        skuMap.set(sku, { sku, brand: o.brandEn ?? p?.brand ?? '', name: p?.nameEn ?? '', units: 0, revenue: 0, fees: 0, cogs: 0, profit: 0 });
      }
      const row = skuMap.get(sku)!;
      row.units   += 1;
      row.revenue += Number(o.totalPayment ?? 0);
      row.fees    += Math.abs(Number(o.referralFee ?? 0)) + Math.abs(Number(o.fbnOutboundFee ?? 0));

      const p = costMap.get(sku);
      if (p?.unitCost) {
        const cost = Number(p.unitCost);
        row.cogs += p.costIncludesVat ? cost / 1.15 : cost;
      }
    }

    const rows = Array.from(skuMap.values()).map(r => ({ ...r, profit: r.revenue - r.fees - r.cogs }));

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
    const year = query.year ?? new Date().getFullYear();
    const from = new Date(`${year}-01-01T00:00:00Z`);
    const to   = new Date(`${year + 1}-01-01T00:00:00Z`);

    const where: any = {
      organizationId: orgId,
      orderedDate: { gte: from, lt: to },
      itemStatus: 'Delivered',
    };
    if (query.brand) where.brandEn = { contains: query.brand, mode: 'insensitive' };

    const orders = await this.prisma.order.findMany({
      where,
      select: { sku: true, brandEn: true, referralFee: true, fbnOutboundFee: true, netProceeds: true, totalPayment: true },
    });

    const feeMap = new Map<string, { sku: string; brand: string; units: number; referralFees: number; fbnFees: number; totalFees: number; revenue: number; feeRate: number }>();

    for (const o of orders) {
      const sku = o.sku ?? 'unknown';
      if (!feeMap.has(sku)) feeMap.set(sku, { sku, brand: o.brandEn ?? '', units: 0, referralFees: 0, fbnFees: 0, totalFees: 0, revenue: 0, feeRate: 0 });
      const row = feeMap.get(sku)!;
      row.units       += 1;
      row.referralFees += Math.abs(Number(o.referralFee ?? 0));
      row.fbnFees      += Math.abs(Number(o.fbnOutboundFee ?? 0));
      row.revenue      += Number(o.totalPayment ?? 0);
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
      const wh = g.warehouseId ? whMap.get(g.warehouseId) : null;
      const p  = prodMap.get(g.sku);
      const qty = g._sum.quantity ?? 0;
      const cost = p?.unitCost ? Number(p.unitCost) * qty : null;
      return {
        sku:       g.sku,
        nameEn:    p?.nameEn ?? null,
        brand:     p?.brand ?? null,
        warehouse: wh ? { id: wh.id, name: wh.name, code: wh.code } : null,
        qty,
        unitCost:  p?.unitCost ?? null,
        totalCost: cost,
      };
    }).sort((a, b) => a.sku.localeCompare(b.sku));
  }

  // ── Invoices report ────────────────────────────────────────────────────────

  async getInvoicesReport(orgId: number, query: ReportYearDto) {
    const year = query.year ?? new Date().getFullYear();
    const from = new Date(`${year}-01-01T00:00:00Z`);
    const to   = new Date(`${year + 1}-01-01T00:00:00Z`);

    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId: orgId, status: 'active', invoiceDate: { gte: from, lt: to } },
      include: { warehouse: { select: { name: true } } },
      orderBy: { invoiceDate: 'asc' },
    });

    const totals = invoices.reduce(
      (acc, inv) => {
        acc.subtotal  += Number(inv.subtotal ?? 0);
        acc.vatAmount += Number(inv.vatAmount ?? 0);
        acc.total     += Number(inv.totalAmount ?? 0);
        return acc;
      },
      { subtotal: 0, vatAmount: 0, total: 0 },
    );

    return { year, invoices, totals };
  }
}
