import {
  Controller, Get, Query, Res, Param,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ReportsService } from '../reports/reports.service';
import { VatCenterService } from '../vat-center/vat-center.service';
import { SettlementsService } from '../settlements/settlements.service';
import { ProfitabilityService } from '../profitability/profitability.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReportRangeDto, SalesReportDto, FeesReportDto } from '../reports/dto/report-query.dto';

const BADGE_AR: Record<string, string> = {
  profitable: 'مربح',
  low_margin: 'هامش منخفض',
  loss: 'خسارة',
  missing_cost: 'بدون تكلفة',
  no_fees_allocated: 'بدون رسوم',
};

function headerStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
  cell.alignment = { horizontal: 'center' };
}

function applyHeader(ws: ExcelJS.Worksheet, headers: string[]) {
  ws.addRow(headers).eachCell(headerStyle);
}

function sendXlsx(res: Response, wb: ExcelJS.Workbook, filename: string) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`,
  );
  return wb.xlsx.write(res).then(() => res.end());
}

@ApiTags('exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(
    private reports: ReportsService,
    private vatCenter: VatCenterService,
    private settlements: SettlementsService,
    private profitability: ProfitabilityService,
    private inventorySvc: InventoryService,
    private prisma: PrismaService,
  ) {}

  @Get('pl')
  async exportPl(
    @Query() query: ReportRangeDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const rows = await this.reports.getPl(user.orgId, query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الأرباح والخسائر');
    ws.views = [{ rightToLeft: true }];
    applyHeader(ws, ['الشهر', 'الإيرادات', 'رسوم المبيعات', 'رسوم FBN', 'رسوم الكشف', 'إجمالي الرسوم', 'تكلفة البضاعة', 'تكاليف إضافية', 'مجمل الربح', 'صافي الربح']);
    for (const r of rows) {
      ws.addRow([r.month, r.revenue, r.referralFees, r.fbnFees, r.stmtFees, r.totalFees, r.cogs, r.extra, r.grossProfit, r.netProfit]);
    }
    ws.columns.forEach(c => { c.width = 16; });
    return sendXlsx(res, wb, `pl_${query.year ?? 'all'}.xlsx`);
  }

  @Get('sales')
  async exportSales(
    @Query() query: SalesReportDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const rows = await this.reports.getSales(user.orgId, query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('المبيعات');
    ws.views = [{ rightToLeft: true }];
    applyHeader(ws, ['SKU', 'الاسم', 'الماركة', 'الوحدات', 'المرتجعات', 'الإيرادات', 'الرسوم', 'التكلفة', 'الربح']);
    for (const r of rows) {
      ws.addRow([r.sku, r.name, r.brand, r.units, (r as any).returns ?? 0, r.revenue, r.fees, r.cogs, r.profit]);
    }
    ws.columns.forEach(c => { c.width = 16; });
    return sendXlsx(res, wb, `sales_${query.year ?? 'all'}.xlsx`);
  }

  @Get('fees')
  async exportFees(
    @Query() query: FeesReportDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { items: rows } = await this.reports.getFees(user.orgId, query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الرسوم');
    ws.views = [{ rightToLeft: true }];
    applyHeader(ws, ['SKU', 'الماركة', 'الوحدات', 'الإيرادات', 'عمولة نون', 'رسوم FBN', 'إجمالي الرسوم', 'نسبة الرسوم %']);
    for (const r of rows) {
      ws.addRow([r.sku, r.brand, r.units, r.revenue, r.referralFees, r.fbnFees, r.totalFees, r.feeRate]);
    }
    ws.columns.forEach(c => { c.width = 16; });
    return sendXlsx(res, wb, `fees_${query.year ?? 'all'}.xlsx`);
  }

  @Get('vat')
  async exportVat(
    @Query('year') yearStr: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
    const { months } = await this.vatCenter.getVatBreakdown(user.orgId, { year });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ضريبة القيمة المضافة');
    ws.views = [{ rightToLeft: true }];
    applyHeader(ws, ['الشهر', 'المبيعات (شامل الضريبة)', 'ضريبة المخرجات', 'رسوم نون (بدون ضريبة)', 'ضريبة مدخلات نون', 'فواتير الموردين (بدون ضريبة)', 'ضريبة مدخلات الموردين', 'ضريبة الكشف', 'صافي الضريبة']);
    for (const r of months) {
      ws.addRow([r.month, r.salesInclVat, r.outputVat, r.noonFeesExcl, r.inputVatNoon, r.supplierInvoiceExcl, r.inputVatSupplier, r.stmtFeeVat, r.netVat]);
    }
    ws.columns.forEach(c => { c.width = 22; });
    return sendXlsx(res, wb, `vat_${year}.xlsx`);
  }

  @Get('settlements')
  async exportSettlements(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { items } = await this.settlements.getSettlements(user.orgId, { page: 1, limit: 10000 });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('التسويات');
    ws.views = [{ rightToLeft: true }];
    applyHeader(ws, ['رقم الكشف', 'تاريخ الكشف', 'اسم الملف', 'المبيعات', 'المرتجعات', 'إجمالي المبيعات', 'إجمالي الرسوم', 'صافينا', 'صافي الدفعة', 'الفارق', 'تاريخ الاستيراد']);
    for (const r of items) {
      ws.addRow([r.statementNr, r.statementDate, r.fileName, r.salesCount, r.returnsCount, r.grossSales, r.totalFees, r.ourNet, r.actualPayout, r.mismatch, r.importedAt]);
    }
    ws.columns.forEach(c => { c.width = 18; });
    return sendXlsx(res, wb, `settlements.xlsx`);
  }

  @Get('profitability')
  async exportProfitability(
    @Query() query: Record<string, string>,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { rows } = await this.profitability.getProfitability(user.orgId, query as any);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الربحية');
    ws.views = [{ rightToLeft: true }];
    applyHeader(ws, ['SKU', 'الاسم', 'الماركة', 'الوحدات', 'الإيرادات', 'الرسوم', 'التكلفة', 'الربح', 'الربح/وحدة', 'التقييم']);
    for (const r of rows) {
      ws.addRow([r.sku, r.nameEn, r.brand, r.units, r.revenue, r.fees, r.cogs, r.profit, r.profitPerUnit, BADGE_AR[r.badge] ?? r.badge]);
    }
    ws.columns.forEach(c => { c.width = 16; });
    return sendXlsx(res, wb, `profitability.xlsx`);
  }

  @Get('products')
  async exportProducts(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const products = await this.prisma.product.findMany({
      where: { organizationId: user.orgId },
      orderBy: { sku: 'asc' },
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('المنتجات');
    ws.views = [{ rightToLeft: true }];
    applyHeader(ws, ['SKU', 'SKU الشريك', 'الاسم (عربي)', 'الاسم (إنجليزي)', 'الماركة', 'الفئة', 'سعر التكلفة', 'تكاليف إضافية', 'التكلفة شاملة الضريبة', 'ملاحظات', 'تاريخ الإضافة']);
    for (const p of products) {
      ws.addRow([
        p.sku, p.partnerSku, p.nameAr, p.nameEn, p.brand, p.family,
        p.unitCost ? Number(p.unitCost) : '',
        p.extraCosts ? Number(p.extraCosts) : '',
        p.costIncludesVat ? 'نعم' : 'لا',
        (p as any).notes ?? '',
        p.createdAt.toISOString().slice(0, 10),
      ]);
    }
    ws.columns.forEach(c => { c.width = 18; });
    return sendXlsx(res, wb, `products.xlsx`);
  }

  @Get('orders')
  async exportOrders(
    @Query() query: Record<string, string>,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const where: any = { organizationId: user.orgId };
    if (query.q) {
      where.OR = [
        { orderNr: { contains: query.q, mode: 'insensitive' } },
        { sku: { contains: query.q, mode: 'insensitive' } },
        { itemNr: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.status) where.itemStatus = { equals: query.status, mode: 'insensitive' };

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { orderedDate: 'desc' },
      take: 50000,
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الطلبات');
    ws.views = [{ rightToLeft: true }];
    applyHeader(ws, ['رقم الطلب', 'رقم البند', 'SKU', 'SKU الشريك', 'المنتج (إنجليزي)', 'المنتج (عربي)', 'الماركة (إنجليزي)', 'الماركة (عربي)', 'الحالة', 'الإيرادات', 'عمولة نون', 'رسوم FBN', 'صافي الدفعة', 'تاريخ الطلب', 'تاريخ التسليم', 'تاريخ الإرجاع']);
    for (const o of orders) {
      ws.addRow([
        o.orderNr, o.itemNr, o.sku, o.partnerSku,
        o.productTitleEn, (o as any).productTitleAr,
        o.brandEn, (o as any).brandAr,
        o.itemStatus,
        o.netProceeds ? Number(o.netProceeds) : '',
        o.referralFee ? Number(o.referralFee) : '',
        o.fbnOutboundFee ? Number(o.fbnOutboundFee) : '',
        o.totalPayment ? Number(o.totalPayment) : '',
        o.orderedDate ? o.orderedDate.toISOString().slice(0, 10) : '',
        (o as any).deliveredDate ?? '',
        (o as any).returnedDate ?? '',
      ]);
    }
    ws.columns.forEach(c => { c.width = 18; });
    return sendXlsx(res, wb, `orders.xlsx`);
  }

  @Get('inventory-stock')
  async exportInventoryStock(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { items } = await this.inventorySvc.getStockEnriched(user.orgId, { page: 1, limit: 99999 });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('المخزون');
    ws.views = [{ rightToLeft: true }];
    applyHeader(ws, [
      'SKU', 'الاسم', 'الماركة', 'المستودع',
      'الكمية', 'تكلفة الوحدة', 'آخر تكلفة شراء', 'سعر البيع',
      'هامش الربح %', 'القيمة الإجمالية', 'آخر حركة', 'الحالة',
    ]);
    const STATUS_AR: Record<string, string> = {
      in_stock: 'متوفر', low_stock: 'مخزون منخفض', out_of_stock: 'نفاد المخزون',
    };
    for (const r of items) {
      ws.addRow([
        r.sku,
        r.nameEn ?? r.nameAr ?? '',
        r.brand ?? '',
        r.warehouse?.name ?? '',
        r.qty,
        r.unitCost      ? Number(r.unitCost)      : '',
        r.lastPurchaseCost ? Number(r.lastPurchaseCost) : '',
        r.sellingPrice  ? Number(r.sellingPrice)  : '',
        r.expectedMarginPct != null ? r.expectedMarginPct : '',
        r.totalValue    != null     ? r.totalValue         : '',
        r.lastMovementDate ? r.lastMovementDate.slice(0, 10) : '',
        STATUS_AR[r.stockStatus] ?? r.stockStatus,
      ]);
    }
    ws.columns.forEach(c => { c.width = 18; });
    return sendXlsx(res, wb, `inventory_stock.xlsx`);
  }
}
