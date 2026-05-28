import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateInvoiceItemDto } from './dto/create-invoice-item.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditLogsService,
    @Optional() private accounting: AccountingService,
  ) {}

  private computeItemTotals(item: { quantity: number; unitPrice: string; vatRate?: string }) {
    const qty = item.quantity;
    const unitPrice = parseFloat(item.unitPrice);
    const vatRate = parseFloat(item.vatRate ?? '0.15');
    const lineSubtotal = qty * unitPrice;
    const lineVat = lineSubtotal * vatRate;
    const lineTotal = lineSubtotal + lineVat;
    return {
      lineSubtotal: lineSubtotal.toFixed(2),
      lineVat: lineVat.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
      vatRate: vatRate.toFixed(4),
    };
  }

  private async recomputeTotals(invoiceId: number, tx: any) {
    const items = await tx.invoiceItem.findMany({ where: { invoiceId } });
    let subtotal = 0, vatAmount = 0, totalAmount = 0;
    for (const item of items) {
      subtotal += parseFloat(item.lineSubtotal.toString());
      vatAmount += parseFloat(item.lineVat.toString());
      totalAmount += parseFloat(item.lineTotal.toString());
    }
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        subtotal: subtotal.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
      },
    });
  }

  async findAll(orgId: number, query: ListInvoicesDto) {
    const { q, status, from, to, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      organizationId: orgId,
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            invoiceDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { supplierName: { contains: q, mode: 'insensitive' } },
              { invoiceNumber: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { items: true } }, warehouse: { select: { id: true, name: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: number, orgId: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId: orgId },
      include: {
        items: { orderBy: { id: 'asc' } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    // Strip binary blob from response — only served via dedicated GET /:id/pdf endpoint
    const { pdfData: _, ...rest } = invoice as any;
    return rest;
  }

  async create(dto: CreateInvoiceDto, orgId: number, actorId: number) {
    const { items = [], ...header } = dto;

    const computed = items.map(item => ({
      sku: item.sku,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...this.computeItemTotals(item),
    }));

    let subtotal = 0, vatAmount = 0, totalAmount = 0;
    for (const c of computed) {
      subtotal += parseFloat(c.lineSubtotal);
      vatAmount += parseFloat(c.lineVat);
      totalAmount += parseFloat(c.lineTotal);
    }

    const invoice = await this.prisma.$transaction(async tx => {
      const inv = await tx.invoice.create({
        data: {
          organizationId: orgId,
          supplierName: header.supplierName,
          invoiceNumber: header.invoiceNumber,
          invoiceDate: header.invoiceDate ? new Date(header.invoiceDate) : undefined,
          vatMode: header.vatMode,
          notes: header.notes,
          warehouseId: header.warehouseId,
          subtotal: subtotal.toFixed(2),
          vatAmount: vatAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          ...(computed.length ? { items: { create: computed } } : {}),
        },
        include: { items: true },
      });

      if (header.warehouseId && computed.length) {
        await tx.inventoryMovement.createMany({
          data: computed.map(c => ({
            organizationId: orgId,
            sku: c.sku,
            productId: c.productId,
            warehouseId: header.warehouseId,
            invoiceId: inv.id,
            movementType: MovementType.purchase,
            quantity: c.quantity,
          })),
        });
      }

      return inv;
    });

    await this.audit.log({
      action: 'invoice_create',
      userId: actorId,
      orgId,
      entityType: 'invoice',
      entityId: invoice.id,
      after: invoice,
    });
    return invoice;
  }

  async update(id: number, dto: UpdateInvoiceDto, orgId: number, actorId: number) {
    const before = await this.findOne(id, orgId);
    if (before.status === 'void') throw new BadRequestException('Cannot update a voided invoice');

    const after = await this.prisma.invoice.update({
      where: { id },
      data: {
        supplierName: dto.supplierName,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
        vatMode: dto.vatMode,
        notes: dto.notes,
        warehouseId: dto.warehouseId,
      },
    });

    await this.audit.log({
      action: 'invoice_update',
      userId: actorId,
      orgId,
      entityType: 'invoice',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async void(id: number, dto: VoidInvoiceDto, orgId: number, actorId: number) {
    const before = await this.findOne(id, orgId);
    if (before.status === 'void') throw new BadRequestException('Invoice is already voided');

    const after = await this.prisma.$transaction(async tx => {
      const inv = await tx.invoice.update({
        where: { id },
        data: { status: 'void', voidReason: dto.reason, voidedAt: new Date() },
      });
      await tx.inventoryMovement.updateMany({
        where: { invoiceId: id, organizationId: orgId },
        data: { isVoid: true },
      });
      return inv;
    });

    await this.audit.log({
      action: 'invoice_void',
      userId: actorId,
      orgId,
      entityType: 'invoice',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async remove(id: number, orgId: number, actorId: number) {
    const before = await this.findOne(id, orgId);

    await this.prisma.$transaction(async tx => {
      await tx.inventoryMovement.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id } });
    });

    await this.audit.log({
      action: 'invoice_delete',
      userId: actorId,
      orgId,
      entityType: 'invoice',
      entityId: id,
      before,
    });
    return { deleted: true };
  }

  async addItem(invoiceId: number, dto: CreateInvoiceItemDto, orgId: number, actorId: number) {
    const invoice = await this.findOne(invoiceId, orgId);
    if (invoice.status === 'void') throw new BadRequestException('Cannot add items to a voided invoice');

    const totals = this.computeItemTotals(dto);

    await this.prisma.$transaction(async tx => {
      await tx.invoiceItem.create({
        data: {
          invoiceId,
          sku: dto.sku,
          productId: dto.productId,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          vatRate: totals.vatRate,
          lineSubtotal: totals.lineSubtotal,
          lineVat: totals.lineVat,
          lineTotal: totals.lineTotal,
        },
      });
      await this.recomputeTotals(invoiceId, tx);

      if (invoice.warehouseId) {
        await tx.inventoryMovement.create({
          data: {
            organizationId: orgId,
            sku: dto.sku,
            productId: dto.productId,
            warehouseId: invoice.warehouseId,
            invoiceId,
            movementType: MovementType.purchase,
            quantity: dto.quantity,
          },
        });
      }
    });

    await this.audit.log({
      action: 'invoice_item_add',
      userId: actorId,
      orgId,
      entityType: 'invoice',
      entityId: invoiceId,
    });
    return this.findOne(invoiceId, orgId);
  }

  async removeItem(invoiceId: number, itemId: number, orgId: number, actorId: number) {
    const invoice = await this.findOne(invoiceId, orgId);
    if (invoice.status === 'void') throw new BadRequestException('Cannot remove items from a voided invoice');

    const item = await this.prisma.invoiceItem.findFirst({ where: { id: itemId, invoiceId } });
    if (!item) throw new NotFoundException('Invoice item not found');

    await this.prisma.$transaction(async tx => {
      await tx.invoiceItem.delete({ where: { id: itemId } });
      await this.recomputeTotals(invoiceId, tx);
    });

    await this.audit.log({
      action: 'invoice_item_remove',
      userId: actorId,
      orgId,
      entityType: 'invoice_item',
      entityId: itemId,
      before: item,
    });
    return this.findOne(invoiceId, orgId);
  }

  async uploadPdf(id: number, orgId: number, file: Express.Multer.File) {
    const invoice = await this.findOne(id, orgId);
    if (!invoice) throw new NotFoundException('Invoice not found');
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_');
    await this.prisma.invoice.update({
      where: { id },
      data: {
        pdfData:         file.buffer,
        pdfFilename:     safeName,
        pdfOriginalName: file.originalname,
      },
    });
    return { uploaded: true, filename: safeName };
  }

  async getPdf(id: number, orgId: number) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId: orgId },
      select: { pdfData: true, pdfFilename: true, pdfOriginalName: true },
    });
    if (!inv || !inv.pdfData) throw new NotFoundException('No PDF attached to this invoice');
    return inv;
  }

  async deletePdf(id: number, orgId: number) {
    const inv = await this.findOne(id, orgId);
    if (!inv) throw new NotFoundException('Invoice not found');
    await this.prisma.invoice.update({
      where: { id },
      data: { pdfData: null, pdfFilename: null, pdfOriginalName: null },
    });
    return { deleted: true };
  }
}
