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

    const [orderAggs, feeAggs] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['importBatch'],
        where: { organizationId: orgId, importBatch: { in: batchIds }, itemStatus: 'Delivered' },
        _sum: { totalPayment: true, referralFee: true, fbnOutboundFee: true, netProceeds: true },
        _count: { id: true },
      }),
      this.prisma.statementFee.groupBy({
        by: ['importBatch'],
        where: { organizationId: orgId, importBatch: { in: batchIds } },
        _sum: { exclVat: true, vatAmount: true, inclVat: true },
      }),
    ]);

    const orderMap = new Map(orderAggs.map(o => [o.importBatch, o]));
    const feeMap   = new Map(feeAggs.map(f => [f.importBatch, f]));

    const items = batches.map(b => {
      const ords = orderMap.get(b.batchId);
      const fees = feeMap.get(b.batchId);

      const grossSales   = Number(ords?._sum.totalPayment ?? 0);
      const referralFees = Math.abs(Number(ords?._sum.referralFee ?? 0));
      const fbnFees      = Math.abs(Number(ords?._sum.fbnOutboundFee ?? 0));
      const stmtFees     = Number(fees?._sum.exclVat ?? 0);
      const stmtFeeVat   = Number(fees?._sum.vatAmount ?? 0);
      const totalFees    = referralFees + fbnFees + stmtFees + stmtFeeVat;
      const ourNet       = grossSales - totalFees;
      const actualPayout = Number(ords?._sum.netProceeds ?? 0);
      const mismatch     = Math.abs(ourNet - actualPayout);

      return {
        batchId:       b.batchId,
        statementNr:   b.statementNr,
        statementDate: b.statementDate,
        fileName:      b.fileName,
        importedAt:    b.createdAt,
        salesCount:    b.salesCount,
        returnsCount:  b.returnsCount,
        feesCount:     b.feesCount,
        grossSales,
        referralFees,
        fbnFees,
        stmtFees,
        stmtFeeVat,
        totalFees,
        ourNet,
        actualPayout,
        mismatch,
        mismatchFlag: mismatch > 0.1,
      };
    });

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
