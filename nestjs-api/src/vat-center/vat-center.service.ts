import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialSummaryService } from '../financial/financial.service';

@Injectable()
export class VatCenterService {
  constructor(
    private prisma:    PrismaService,
    private financial: FinancialSummaryService,
  ) {}

  async getVatBreakdown(orgId: number, from: Date, to: Date) {
    // Core VAT metrics come from FinancialSummaryService — guaranteed consistent with all pages
    const monthlySummaries = await this.financial.getMonthlySummaries(orgId, from, to);

    // Supplier invoice subtotals are detail data not held in FinancialSummaryService — fetch separately
    const invoiceItems = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          organizationId: orgId,
          status:         'active',
          invoiceDate:    { gte: from, lt: to },
        },
      },
      select: {
        lineSubtotal: true,
        invoice: { select: { invoiceDate: true } },
      },
    });

    const supplierExclByMonth = new Map<string, number>();
    for (const item of invoiceItems) {
      const m = item.invoice.invoiceDate?.toISOString().slice(0, 7) ?? 'unknown';
      supplierExclByMonth.set(m, (supplierExclByMonth.get(m) ?? 0) + Number(item.lineSubtotal));
    }

    const months = monthlySummaries.map(r => ({
      month:               r.month,
      salesInclVat:        r.netSales,
      outputVat:           r.outputVAT,
      noonFeesExcl:        r.feesBeforeVAT,
      inputVatNoon:        r.inputVATNoon,
      supplierInvoiceExcl: supplierExclByMonth.get(r.month) ?? 0,
      inputVatSupplier:    r.inputVATSuppliers,
      stmtFeeVat:          r.vatOnFees,
      netVat:              r.vatPayable,
    }));

    return { months };
  }
}
