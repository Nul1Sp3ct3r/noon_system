import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseIntPipe, Patch, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { CreateCategoryDto } from './dto/create-category.dto';

const PAYMENT_AR: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  cash:          'نقداً',
  credit_card:   'بطاقة ائتمان',
  check:         'شيك',
  other:         'أخرى',
};

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private expenses: ExpensesService) {}

  // ─── Categories ────────────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'List expense categories' })
  getCategories(@CurrentUser() user: JwtPayload) {
    return this.expenses.getCategories(user.orgId);
  }

  @Post('categories')
  @Roles(Role.admin, Role.super_admin)
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: JwtPayload) {
    return this.expenses.createCategory(dto, user.orgId);
  }

  @Post('categories/seed')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Seed default Arabic expense categories' })
  seedCategories(@CurrentUser() user: JwtPayload) {
    return this.expenses.seedDefaultCategories(user.orgId);
  }

  // ─── Stats & Export ────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'KPI stats for expenses' })
  getStats(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.expenses.getStats(user.orgId, {
      from: from || undefined,
      to:   to   || undefined,
    });
  }

  @Get('export')
  @ApiOperation({ summary: 'Export expenses as Excel' })
  async exportXlsx(
    @Query() query: ListExpensesDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { items } = await this.expenses.findAll(user.orgId, { ...query, limit: 99999, page: 1 });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('المصروفات');
    ws.views = [{ rightToLeft: true }];

    ws.addRow([
      'رقم', 'التاريخ', 'المورد / الجهة', 'الفئة',
      'الوصف', 'المبلغ قبل الضريبة', 'ضريبة القيمة المضافة',
      'الإجمالي', 'طريقة الدفع', 'رقم المرجع', 'الحالة',
      'مرفق', 'ملاحظات',
    ]).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
      cell.alignment = { horizontal: 'center' };
    });

    for (const e of items as any[]) {
      ws.addRow([
        e.id,
        e.expenseDate,
        e.vendor ?? '',
        e.category?.name ?? '',
        e.description ?? '',
        Number(e.amountBeforeVat),
        Number(e.vatAmount),
        Number(e.totalAmount),
        PAYMENT_AR[e.paymentMethod] ?? e.paymentMethod,
        e.referenceNumber ?? '',
        e.status === 'posted' ? 'مرحّل' : 'مسودة',
        e.attachmentName ? 'نعم' : '',
        e.notes ?? '',
      ]);
    }

    ws.columns.forEach(c => { c.width = 18; });
    [4, 5, 6, 7, 8].forEach(i => { ws.getColumn(i).numFmt = '#,##0.00'; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  @Get()
  findAll(@Query() query: ListExpensesDto, @CurrentUser() user: JwtPayload) {
    return this.expenses.findAll(user.orgId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.expenses.findOne(id, user.orgId);
  }

  @Post()
  @Roles(Role.admin, Role.super_admin)
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: JwtPayload) {
    return this.expenses.create(dto, user.orgId, user.sub);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.super_admin)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.expenses.update(id, dto, user.orgId);
  }

  @Post(':id/post')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Post expense and auto-create journal entry' })
  post(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.expenses.post(id, user.orgId, user.sub);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.super_admin)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.expenses.remove(id, user.orgId);
  }

  // ─── Attachment ────────────────────────────────────────────────────────────

  @Post(':id/attachment')
  @Roles(Role.admin, Role.super_admin)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload receipt/invoice attachment' })
  uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.expenses.uploadAttachment(id, user.orgId, file);
  }

  @Get(':id/attachment')
  @ApiOperation({ summary: 'Download attachment' })
  async getAttachment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const att = await this.expenses.getAttachment(id, user.orgId);
    const mime = att.attachmentMime ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${att.attachmentName ?? 'attachment'}"`);
    res.send(att.attachmentData);
  }

  @Delete(':id/attachment')
  @Roles(Role.admin, Role.super_admin)
  @HttpCode(HttpStatus.OK)
  deleteAttachment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.expenses.deleteAttachment(id, user.orgId);
  }
}
