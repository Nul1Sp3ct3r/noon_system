import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VatQueryDto } from './dto/vat-query.dto';

@Injectable()
export class VatCenterService {
  constructor(private prisma: PrismaService) {}

  async getVatBreakdown(orgId: number, query: VatQueryDto) {
    const year = query.year ?? new Date().getFullYear();
    const from = new Date(`${year}-01-01T00:00:00Z`);
    const to   = new Date(`${year + 1}-01-01T00:00:00Z`);

    const [orders, stmtFees, invoiceItems] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          organizationId: orgId,
          itemStatus: 'Delivered',
          orderedDate: { gte: from, lt: to },
        },
        select: { totalPayment: true, referralFee: true, fbnOutboundFee: true, orderedDate: true },
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
          invoice: { select: { invoiceDate: true } },
        },
      }),
    ]);

    const months: Record<string, {
      month: string;
      salesInclVat: number;
      outputVat: number;
      noonFeesExcl: number;
      inputVatNoon: number;
      supplierInvoiceExcl: number;
      inputVatSupplier: number;
      stmtFeeVat: number;
      netVat: number;
    }> = {};

    const getMonth = (d: Date | null) => d ? d.toISOString().slice(0, 7) : 'unknown';

    for (const o of orders) {
      const m = getMonth(o.orderedDate);
      if (!months[m]) months[m] = this.emptyRow(m);
      const salesIncl = Number(o.totalPayment ?? 0);
      months[m].salesInclVat += salesIncl;
      // output_vat = sales_incl * 15/115
      months[m].outputVat += salesIncl * (15 / 115);

      const feesExcl = Math.abs(Number(o.referralFee ?? 0)) + Math.abs(Number(o.fbnOutboundFee ?? 0));
      months[m].noonFeesExcl += feesExcl;
      // input_vat_noon = fees_excl * 0.15
      months[m].inputVatNoon += feesExcl * 0.15;
    }

    for (const f of stmtFees) {
      const m = (f.statementDate ?? '').slice(0, 7);
      if (!months[m]) months[m] = this.emptyRow(m);
      months[m].stmtFeeVat    += Number(f.vatAmount);
      months[m].inputVatNoon  += Number(f.vatAmount);
    }

    for (const item of invoiceItems) {
      const m = getMonth(item.invoice.invoiceDate);
      if (!months[m]) months[m] = this.emptyRow(m);
      months[m].supplierInvoiceExcl += Number(item.lineSubtotal);
      months[m].inputVatSupplier    += Number(item.lineVat);
    }

    const rows = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    for (const r of rows) {
      r.netVat = r.outputVat - r.inputVatNoon - r.inputVatSupplier;
    }
    return { year, months: rows };
  }

  private emptyRow(month: string) {
    return {
      month,
      salesInclVat: 0,
      outputVat: 0,
      noonFeesExcl: 0,
      inputVatNoon: 0,
      supplierInvoiceExcl: 0,
      inputVatSupplier: 0,
      stmtFeeVat: 0,
      netVat: 0,
    };
  }
}
