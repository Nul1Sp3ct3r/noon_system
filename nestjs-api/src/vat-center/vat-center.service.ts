import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialSummaryService } from '../financial/financial.service';
import { VatQueryDto } from './dto/vat-query.dto';

@Injectable()
export class VatCenterService {
  constructor(
    private prisma:    PrismaService,
    private financial: FinancialSummaryService,
  ) {}

  async getVatBreakdown(orgId: number, query: VatQueryDto) {
    const year = query.year ?? new Date().getFullYear();

    // Core VAT metrics come from FinancialSummaryService — guaranteed consistent with all pages
    const monthlySummaries = await this.financial.getMonthlySummaries(orgId, year);

    // Supplier invoice subtotals are detail data not held in FinancialSummaryService — fetch separately
    const from = new Date(`${year}-01-01T00:00:00Z`);
    const to   = new Date(`${year + 1}-01-01T00:00:00Z`);

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

    return { year, months };
  }
}
