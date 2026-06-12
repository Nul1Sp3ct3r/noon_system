import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialSummaryService } from '../financial/financial.service';

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNum(d: unknown): number {
  return Number(d ?? 0);
}

export interface StatementsFilter {
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
}

@Injectable()
export class StatementsService {
  constructor(
    private prisma:    PrismaService,
    private financial: FinancialSummaryService,
  ) {}

  // ─── KPI dashboard cards ──────────────────────────────────────────────────
  // Financial totals come from FinancialSummaryService — guaranteed consistent with all pages.

  async getKpis(orgId: number) {
    const [stmtCounts, financials] = await Promise.all([
      this.prisma.noonStatementSummary.groupBy({
        by:    ['status'],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
      this.financial.getSummary(orgId, {}),
    ]);

    const total      = stmtCounts.reduce((a, r) => a + r._count._all, 0);
    const matched    = stmtCounts.find(r => r.status === 'matched')?._count._all  ?? 0;
    const needsReview = stmtCounts.find(r => r.status === 'review')?._count._all  ?? 0;

    return {
      totalStatements:    total,
      matchedStatements:  matched,
      reviewStatements:   needsReview,
      totalNetProceeds:   financials.grossSales,
      totalFees:          financials.feesBeforeVAT,
      totalVat:           financials.vatOnFees,
      totalProfit:        financials.activeProfit,
      vatRegistered:      financials.vatRegistered,
    };
  }

  // ─── List statements ──────────────────────────────────────────────────────

  async listStatements(orgId: number, filters: StatementsFilter) {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (filters.status)             where['status'] = filters.status;
    if (filters.search)             where['referenceNr'] = { contains: filters.search, mode: 'insensitive' };
    if (filters.startDate || filters.endDate) {
      const dateFilter: Record<string, string> = {};
      if (filters.startDate) dateFilter.gte = filters.startDate;
      if (filters.endDate)   dateFilter.lte = filters.endDate;
      where['statementDate'] = dateFilter;
    }

    const [summaries, org] = await Promise.all([
      this.prisma.noonStatementSummary.findMany({
        where: where as any,
        orderBy: { statementDate: 'desc' },
      }),
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { vatRegistered: true, profitMode: true },
      }),
    ]);

    if (summaries.length === 0) return { statements: [], vatRegistered: false };

    // Batch-fetch import batch info
    const batchIds = [...new Set(summaries.map(s => s.importBatchId))];
    const batches = await this.prisma.importBatch.findMany({
      where: { batchId: { in: batchIds } },
      select: { batchId: true, fileName: true, createdAt: true, importType: true },
    });
    const batchMap = new Map(batches.map(b => [b.batchId, b]));

    // Batch-fetch orders and products for COGS
    const refNrs = summaries.map(s => s.referenceNr);
    const [orders, allProducts] = await Promise.all([
      this.prisma.order.findMany({
        where: { organizationId: orgId, statementRef: { in: refNrs }, itemStatus: 'delivered' },
        select: { statementRef: true, sku: true },
      }),
      this.prisma.product.findMany({
        where: { organizationId: orgId },
        select: { sku: true, unitCost: true, extraCosts: true, costIncludesVat: true },
      }),
    ]);

    const productMap = new Map(allProducts.map(p => [p.sku, p]));
    const cogsByRef = new Map<string, number>();
    for (const o of orders) {
      if (!o.statementRef || !o.sku) continue;
      const p = productMap.get(o.sku);
      if (!p?.unitCost) continue;
      const cost = toNum(p.unitCost);
      const cogs = (p.costIncludesVat ? cost / 1.15 : cost) + toNum(p.extraCosts);
      cogsByRef.set(o.statementRef, r2((cogsByRef.get(o.statementRef) ?? 0) + cogs));
    }

    const vatRegistered = org?.vatRegistered ?? false;

    const statements = summaries.map(s => {
      const batch = batchMap.get(s.importBatchId);
      const cogs  = cogsByRef.get(s.referenceNr) ?? null;
      const stmtTotal  = toNum(s.statementTotal);
      const netAfterVat = toNum(s.netAfterVat);

      const operationalProfit = cogs != null ? r2(stmtTotal  - cogs) : null;
      const profitAfterVat    = cogs != null ? r2(netAfterVat - cogs) : null;
      const activeProfit      = vatRegistered ? operationalProfit : profitAfterVat;

      return {
        id:                              s.id,
        referenceNr:                     s.referenceNr,
        statementDate:                   s.statementDate,
        importBatchId:                   s.importBatchId,
        fileName:                        batch?.fileName ?? null,
        importType:                      batch?.importType ?? null,
        importedAt:                      batch?.createdAt?.toISOString() ?? null,
        netProceeds:                     toNum(s.netProceeds),
        feesInclVat:                     toNum(s.feesInclVat),
        feesExclVat:                     toNum(s.feesExclVat),
        statementVat:                    toNum(s.statementVat),
        statementTotal:                  toNum(s.statementTotal),
        netAfterVat:                     toNum(s.netAfterVat),
        tvTotal:                         toNum(s.tvTotal),
        difference:                      toNum(s.difference),
        status:                          s.status,
        vatEstimated:                    s.vatEstimated,
        orderRowsCount:                  s.orderRowsCount,
        orderUpdateRowsCount:            s.orderUpdateRowsCount,
        ignoredPaymentRowsCount:         s.ignoredPaymentRowsCount,
        ignoredBalanceTransferRowsCount: s.ignoredBalanceTransferRowsCount,
        cogs,
        operationalProfit,
        profitAfterVat,
        activeProfit,
        vatRegistered,
      };
    });

    return { statements, vatRegistered };
  }

  // ─── Statement detail ─────────────────────────────────────────────────────

  async getStatementDetail(orgId: number, referenceNr: string) {
    const [summary, org] = await Promise.all([
      this.prisma.noonStatementSummary.findUnique({
        where: { organizationId_referenceNr: { organizationId: orgId, referenceNr } },
      }),
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { vatRegistered: true, profitMode: true },
      }),
    ]);

    if (!summary) throw new NotFoundException(`الكشف ${referenceNr} غير موجود`);

    const [batch, orders, statementFees] = await Promise.all([
      this.prisma.importBatch.findFirst({
        where: { batchId: summary.importBatchId },
        select: { batchId: true, fileName: true, createdAt: true, importType: true, rowsImported: true, rowsSkipped: true, status: true },
      }),
      this.prisma.order.findMany({
        where: { organizationId: orgId, statementRef: referenceNr },
        orderBy: [{ itemStatus: 'asc' }, { orderedDate: 'asc' }],
        select: {
          id: true, orderNr: true, itemNr: true, sku: true, partnerSku: true,
          productTitleEn: true, productTitleAr: true, itemStatus: true,
          netProceeds: true, referralFee: true, fbnOutboundFee: true, totalPayment: true,
          orderedDate: true, deliveredDate: true, returnedDate: true,
        },
      }),
      // Try to find matching statement fees from monthly imports for same period
      this.prisma.statementFee.findMany({
        where: {
          organizationId: orgId,
          ...(summary.statementDate ? { statementDate: { contains: summary.statementDate.slice(0, 7) } } : {}),
        },
        select: { feeType: true, description: true, exclVat: true, vatAmount: true, inclVat: true, statementNr: true },
        take: 100,
      }),
    ]);

    // Get products for COGS
    const deliveredOrders = orders.filter(o => o.itemStatus === 'delivered');
    const skus = [...new Set(deliveredOrders.map(o => o.sku).filter(Boolean))] as string[];
    const products = skus.length
      ? await this.prisma.product.findMany({
          where: { organizationId: orgId, sku: { in: skus } },
          select: { sku: true, unitCost: true, extraCosts: true, costIncludesVat: true },
        })
      : [];
    const productMap = new Map(products.map(p => [p.sku, p]));

    // Compute per-order COGS
    const orderRows = orders.map(o => {
      const p = o.sku ? productMap.get(o.sku) : undefined;
      let cogs: number | null = null;
      if (p?.unitCost && o.itemStatus === 'delivered') {
        const cost = toNum(p.unitCost);
        cogs = r2((p.costIncludesVat ? cost / 1.15 : cost) + toNum(p.extraCosts));
      }
      const net = toNum(o.netProceeds);
      const fees = toNum(o.referralFee) + toNum(o.fbnOutboundFee);
      const profit = cogs != null ? r2(net - fees - cogs) : null;
      return {
        orderNr:        o.orderNr,
        itemNr:         o.itemNr,
        sku:            o.sku,
        partnerSku:     o.partnerSku,
        productTitle:   o.productTitleEn ?? o.productTitleAr ?? null,
        itemStatus:     o.itemStatus,
        netProceeds:    net,
        fees,
        cogs,
        profit,
        orderedDate:    o.orderedDate?.toISOString().slice(0, 10) ?? null,
        deliveredDate:  o.deliveredDate,
        returnedDate:   o.returnedDate,
      };
    });

    // Aggregate COGS
    const totalCogs = r2(orderRows.reduce((a, r) => a + (r.cogs ?? 0), 0));
    const hasCogs   = totalCogs > 0;

    const np        = toNum(summary.netProceeds);
    const feExcl    = toNum(summary.feesExclVat);
    const feIncl    = toNum(summary.feesInclVat);
    const stmtVat   = toNum(summary.statementVat);
    const stmtTotal = toNum(summary.statementTotal);
    const navat     = toNum(summary.netAfterVat);
    const tvTotal   = toNum(summary.tvTotal);
    const diff      = toNum(summary.difference);

    const vatRegistered    = org?.vatRegistered ?? false;
    const operationalProfit = hasCogs ? r2(stmtTotal - totalCogs) : null;
    const profitAfterVat    = hasCogs ? r2(navat     - totalCogs) : null;
    const activeProfit      = vatRegistered ? operationalProfit : profitAfterVat;

    // VAT details
    const vatOnSales  = r2(np * 0.15 / 1.15);   // output VAT embedded in proceeds
    const inputVat    = stmtVat;                  // recoverable input VAT on fees
    const netVatLiability = r2(vatOnSales - inputVat);

    // Fee breakdown from statement fees (monthly statement data)
    const feeByCat: Record<string, number> = {};
    for (const f of statementFees) {
      const cat = f.description?.toLowerCase().includes('referral')   ? 'referralFee'
                : f.description?.toLowerCase().includes('fbn')        ? 'fbnOutboundFee'
                : f.description?.toLowerCase().includes('return admin') ? 'returnFee'
                : f.description?.toLowerCase().includes('storage')    ? 'storageFee'
                : f.description?.toLowerCase().includes('damaged')    ? 'damageFee'
                : f.description?.toLowerCase().includes('removal')    ? 'removalFee'
                : f.description?.toLowerCase().includes('compensation') ? 'compensation'
                : 'other';
      feeByCat[cat] = r2((feeByCat[cat] ?? 0) + Math.abs(toNum(f.exclVat)));
    }

    const orderRows2   = orderRows.filter(r => r.itemStatus !== 'order_update');
    const updateRows   = orderRows.filter(r => r.itemStatus === 'order_update');

    return {
      referenceNr,
      statementDate:    summary.statementDate,
      status:           summary.status,
      vatEstimated:     summary.vatEstimated,

      // Import info
      importBatchId:    summary.importBatchId,
      fileName:         batch?.fileName ?? null,
      importedAt:       batch?.createdAt?.toISOString() ?? null,
      importType:       batch?.importType ?? null,
      batchStatus:      batch?.status ?? null,
      rowsImported:     batch?.rowsImported ?? 0,

      // Reconciliation
      netProceeds:      np,
      feesExclVat:      feExcl,
      feesInclVat:      feIncl,
      statementVat:     stmtVat,
      statementTotal:   stmtTotal,
      netAfterVat:      navat,
      tvTotal,
      difference:       diff,

      // Row counts
      orderRowsCount:                  summary.orderRowsCount,
      orderUpdateRowsCount:            summary.orderUpdateRowsCount,
      ignoredPaymentRowsCount:         summary.ignoredPaymentRowsCount,
      ignoredBalanceTransferRowsCount: summary.ignoredBalanceTransferRowsCount,

      // Profitability
      vatRegistered,
      profitMode:       org?.profitMode ?? 'expense',
      totalCogs,
      hasCogs,
      operationalProfit,
      profitAfterVat,
      activeProfit,

      // VAT details
      vatOnSales,
      inputVat,
      netVatLiability,

      // Fee breakdown (from monthly statement if available)
      feeByCat,
      feeLines: statementFees.map(f => ({
        feeType:     f.feeType,
        description: f.description,
        exclVat:     toNum(f.exclVat),
        vatAmount:   toNum(f.vatAmount),
        inclVat:     toNum(f.inclVat),
      })),
      hasFeeDetail: statementFees.length > 0,

      // Orders
      orderRows:   orderRows2,
      updateRows,
    };
  }
}
