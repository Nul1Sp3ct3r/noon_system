import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementsQueryDto } from './dto/settlements-query.dto';

@Injectable()
export class SettlementsService {
  constructor(private prisma: PrismaService) {}

  async getSettlements(orgId: number, query: SettlementsQueryDto) {
    const { page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const [batches, total] = await this.prisma.$transaction([
      this.prisma.importBatch.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.importBatch.count({ where: { organizationId: orgId } }),
    ]);

    const batchIds = batches.map(b => b.batchId);

    // gross_sales = SUM(netProceeds WHERE delivered)  — matches Flask formula
    // actualPayout = SUM(totalPayment) for all orders — matches Flask formula
    const [deliveredAggs, allOrderAggs, feeAggs] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['importBatch'],
        where: {
          organizationId: orgId,
          importBatch: { in: batchIds },
          itemStatus: { equals: 'delivered', mode: 'insensitive' },
        },
        _sum: { netProceeds: true, referralFee: true, fbnOutboundFee: true },
        _count: { id: true },
      }),
      this.prisma.order.groupBy({
        by: ['importBatch'],
        where: { organizationId: orgId, importBatch: { in: batchIds } },
        _sum: { totalPayment: true },
      }),
      this.prisma.statementFee.groupBy({
        by: ['importBatch'],
        where: { organizationId: orgId, importBatch: { in: batchIds } },
        _sum: { exclVat: true, vatAmount: true, inclVat: true },
      }),
    ]);

    const deliveredMap = new Map(deliveredAggs.map(o => [o.importBatch, o]));
    const allOrderMap  = new Map(allOrderAggs.map(o => [o.importBatch, o]));
    const feeMap       = new Map(feeAggs.map(f => [f.importBatch, f]));

    const items = batches.map(b => {
      const del  = deliveredMap.get(b.batchId);
      const all  = allOrderMap.get(b.batchId);
      const fees = feeMap.get(b.batchId);

      const grossSales   = Math.round(Number(del?._sum.netProceeds  ?? 0) * 100) / 100;
      const referralFees = Math.round(Math.abs(Number(del?._sum.referralFee ?? 0)) * 100) / 100;
      const fbnFees      = Math.round(Math.abs(Number(del?._sum.fbnOutboundFee ?? 0)) * 100) / 100;
      const actualPayout = Math.round(Number(all?._sum.totalPayment ?? 0) * 100) / 100;

      const stmtFeesExcl = Math.round(Math.abs(Number(fees?._sum.exclVat ?? 0)) * 100) / 100;
      const stmtFeeVat   = Math.round(Math.abs(Number(fees?._sum.vatAmount ?? 0)) * 100) / 100;

      // Monthly-format batch: fees come from statementFees table
      // Old-format batch: fees come from per-order referral + fbn
      const isMonthlyBatch = stmtFeesExcl > 0;

      const totalFees = isMonthlyBatch
        ? stmtFeesExcl
        : Math.round((referralFees + fbnFees) * 100) / 100;

      const ourNet   = Math.round((grossSales - totalFees) * 100) / 100;
      // For monthly batches Noon deducts fees from statement — mismatch not meaningful
      const mismatch = isMonthlyBatch ? 0 : Math.round(Math.abs(ourNet - actualPayout) * 100) / 100;

      return {
        batchId:          b.batchId,
        statementNr:      b.statementNr,
        statementDate:    b.statementDate,
        fileName:         b.fileName,
        importedAt:       b.createdAt,
        salesCount:       b.salesCount,
        returnsCount:     b.returnsCount,
        feesCount:        b.feesCount,
        grossSales,
        referralFees,
        fbnFees,
        stmtFees:         stmtFeesExcl,
        stmtFeeVat,
        totalFees,
        ourNet,
        actualPayout,
        mismatch,
        mismatchFlag:     mismatch > 1.0,
        isMonthlyBatch,
      };
    });

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
