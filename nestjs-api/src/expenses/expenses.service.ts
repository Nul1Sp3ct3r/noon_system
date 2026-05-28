import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { CreateCategoryDto } from './dto/create-category.dto';

const INCLUDE_EXPENSE = {
  category: true,
  createdBy: { select: { id: true, fullName: true, username: true } },
} as const;

const STRIP_ATTACHMENT = (exp: any) => {
  const { attachmentData: _, ...rest } = exp;
  return rest;
};

// Default expense categories (name + CoA code)
const DEFAULT_CATEGORIES = [
  { name: 'رسوم نون والعمولات',        accountCode: '5100' },
  { name: 'رسوم الإحالة',              accountCode: '5110' },
  { name: 'رسوم FBN والشحن الداخلي',  accountCode: '5120' },
  { name: 'رسوم الكشف الشهري',         accountCode: '5130' },
  { name: 'تكلفة البضاعة المباعة',     accountCode: '5200' },
  { name: 'مصاريف التسويق والإعلان',   accountCode: '5300' },
  { name: 'مصاريف الشحن والتوصيل',    accountCode: '5400' },
  { name: 'مصاريف تشغيلية عامة',      accountCode: '5500' },
  { name: 'رواتب وأجور',              accountCode: '5500' },
  { name: 'مصاريف مكتبية وإدارية',    accountCode: '5500' },
  { name: 'مصاريف صيانة',             accountCode: '5500' },
  { name: 'مصاريف اتصالات وانترنت',   accountCode: '5500' },
  { name: 'فرق مخزون وتسويات',        accountCode: '5600' },
];

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private accounting: AccountingService,
    @Optional() private accountsSvc: AccountsService,
  ) {}

  // ─── Categories ──────────────────────────────────────────────────────────────

  async getCategories(orgId: number) {
    return this.prisma.expenseCategory.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateCategoryDto, orgId: number) {
    return this.prisma.expenseCategory.create({
      data: { organizationId: orgId, name: dto.name, accountCode: dto.accountCode },
    });
  }

  async seedDefaultCategories(orgId: number) {
    const count = await this.prisma.expenseCategory.count({ where: { organizationId: orgId } });
    if (count > 0) return { seeded: false, message: 'الفئات موجودة بالفعل' };

    await this.prisma.expenseCategory.createMany({
      data: DEFAULT_CATEGORIES.map(c => ({ organizationId: orgId, ...c })),
    });
    return { seeded: true, count: DEFAULT_CATEGORIES.length };
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

  async findAll(orgId: number, query: ListExpensesDto) {
    const { from, to, q, vendor, categoryId, paymentMethod, status, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId: orgId };
    if (from || to) where.expenseDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (vendor) where.vendor = { contains: vendor, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { description:     { contains: q, mode: 'insensitive' } },
        { vendor:          { contains: q, mode: 'insensitive' } },
        { referenceNumber: { contains: q, mode: 'insensitive' } },
        { notes:           { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rawItems, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where, skip, take: limit,
        orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
        include: INCLUDE_EXPENSE,
      }),
      this.prisma.expense.count({ where }),
    ]);

    const items = rawItems.map(STRIP_ATTACHMENT);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getStats(orgId: number, params?: { from?: string; to?: string }) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const postedWhere: any = { organizationId: orgId, status: 'posted' };
    if (params?.from || params?.to) {
      postedWhere.expenseDate = {
        ...(params?.from ? { gte: params.from } : {}),
        ...(params?.to   ? { lte: params.to   } : {}),
      };
    }

    const [totalAgg, vatAgg, monthAgg, byCatRaw] = await Promise.all([
      this.prisma.expense.aggregate({
        where: postedWhere,
        _sum: { totalAmount: true, vatAmount: true },
        _count: { id: true },
      }),
      this.prisma.expense.aggregate({
        where: postedWhere,
        _sum: { vatAmount: true },
      }),
      this.prisma.expense.aggregate({
        where: { organizationId: orgId, status: 'posted', expenseDate: { startsWith: yearMonth } },
        _sum: { totalAmount: true },
      }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: postedWhere,
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 1,
      }),
    ]);

    let topCategory: string | null = null;
    if (byCatRaw.length > 0 && byCatRaw[0].categoryId) {
      const cat = await this.prisma.expenseCategory.findUnique({ where: { id: byCatRaw[0].categoryId } });
      topCategory = cat?.name ?? null;
    }

    return {
      totalExpenses:   Number(totalAgg._sum.totalAmount ?? 0),
      totalVat:        Number(vatAgg._sum.vatAmount ?? 0),
      count:           totalAgg._count.id,
      thisMonth:       Number(monthAgg._sum.totalAmount ?? 0),
      topCategory,
    };
  }

  async findOne(id: number, orgId: number) {
    const exp = await this.prisma.expense.findFirst({
      where: { id, organizationId: orgId },
      include: INCLUDE_EXPENSE,
    });
    if (!exp) throw new NotFoundException('Expense not found');
    return STRIP_ATTACHMENT(exp);
  }

  async create(dto: CreateExpenseDto, orgId: number, userId?: number) {
    const vatAmount = dto.vatAmount ?? 0;
    const totalAmount = dto.totalAmount ?? dto.amountBeforeVat + vatAmount;

    return STRIP_ATTACHMENT(
      await this.prisma.expense.create({
        data: {
          organizationId:  orgId,
          expenseDate:     dto.expenseDate,
          vendor:          dto.vendor,
          categoryId:      dto.categoryId ?? null,
          description:     dto.description,
          amountBeforeVat: dto.amountBeforeVat,
          vatAmount,
          totalAmount,
          paymentMethod:   dto.paymentMethod ?? PaymentMethod.bank_transfer,
          referenceNumber: dto.referenceNumber,
          notes:           dto.notes,
          createdById:     userId ?? null,
        },
        include: INCLUDE_EXPENSE,
      }),
    );
  }

  async update(id: number, dto: UpdateExpenseDto, orgId: number) {
    const exp = await this.findOne(id, orgId);
    if ((exp as any).status === 'posted') {
      throw new BadRequestException('لا يمكن تعديل مصروف مرحّل');
    }

    return STRIP_ATTACHMENT(
      await this.prisma.expense.update({
        where: { id },
        data: {
          expenseDate:     dto.expenseDate,
          vendor:          dto.vendor,
          categoryId:      dto.categoryId ?? undefined,
          description:     dto.description,
          amountBeforeVat: dto.amountBeforeVat,
          vatAmount:       dto.vatAmount,
          totalAmount:     dto.totalAmount,
          paymentMethod:   dto.paymentMethod,
          referenceNumber: dto.referenceNumber,
          notes:           dto.notes,
        },
        include: INCLUDE_EXPENSE,
      }),
    );
  }

  async post(id: number, orgId: number, userId?: number) {
    const exp = await this.prisma.expense.findFirst({
      where: { id, organizationId: orgId },
      include: { category: true },
    });
    if (!exp) throw new NotFoundException('Expense not found');
    if (exp.status === 'posted') throw new BadRequestException('المصروف مرحّل بالفعل');

    if (this.accounting) {
      const locked = await this.accounting.isPeriodLocked(orgId, exp.expenseDate);
      if (locked) throw new ForbiddenException(`الفترة المحاسبية مغلقة لتاريخ ${exp.expenseDate}`);
    }

    const journalId = await this.buildJournalEntry(exp, orgId, userId);

    return STRIP_ATTACHMENT(
      await this.prisma.expense.update({
        where: { id },
        data: { status: 'posted', journalEntryId: journalId ?? null },
        include: INCLUDE_EXPENSE,
      }),
    );
  }

  async remove(id: number, orgId: number) {
    const exp = await this.findOne(id, orgId);
    if ((exp as any).status === 'posted') {
      throw new BadRequestException('لا يمكن حذف مصروف مرحّل — أنشئ قيد محو من القيود المحاسبية');
    }
    await this.prisma.expense.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Attachment ───────────────────────────────────────────────────────────────

  async uploadAttachment(id: number, orgId: number, file: Express.Multer.File) {
    await this.findOne(id, orgId);
    await this.prisma.expense.update({
      where: { id },
      data: {
        attachmentData: file.buffer,
        attachmentName: file.originalname,
        attachmentMime: file.mimetype,
      },
    });
    return { uploaded: true, filename: file.originalname };
  }

  async getAttachment(id: number, orgId: number) {
    const exp = await this.prisma.expense.findFirst({
      where: { id, organizationId: orgId },
      select: { attachmentData: true, attachmentName: true, attachmentMime: true },
    });
    if (!exp) throw new NotFoundException('Expense not found');
    if (!exp.attachmentData) throw new NotFoundException('No attachment');
    return exp;
  }

  async deleteAttachment(id: number, orgId: number) {
    await this.findOne(id, orgId);
    await this.prisma.expense.update({
      where: { id },
      data: { attachmentData: null, attachmentName: null, attachmentMime: null },
    });
    return { deleted: true };
  }

  // ─── Journal auto-generation ──────────────────────────────────────────────────

  private async buildJournalEntry(
    exp: any,
    orgId: number,
    userId?: number,
  ): Promise<number | null> {
    if (!this.accounting || !this.accountsSvc) return null;

    try {
      const codeMap = await this.accountsSvc.getCodeMap(orgId);

      const expenseCode = exp.category?.accountCode ?? '5500';
      const expenseAcc  = codeMap.get(expenseCode) ?? codeMap.get('5500');
      if (!expenseAcc) {
        this.logger.warn(`Expense account code ${expenseCode} not found — skipping journal`);
        return null;
      }

      const creditCode = exp.paymentMethod === 'cash' ? '1120' : '1110';
      const creditAcc  = codeMap.get(creditCode) ?? codeMap.get('1110');
      if (!creditAcc) {
        this.logger.warn('Bank/Cash account not found in CoA — skipping journal');
        return null;
      }

      const inputVatAcc = codeMap.get('1150');

      const amount    = Number(exp.amountBeforeVat);
      const vat       = Number(exp.vatAmount);
      const total     = Number(exp.totalAmount);

      const lines: any[] = [
        {
          accountId: expenseAcc.id,
          accountAr: expenseAcc.nameAr,
          debit:     amount,
          credit:    0,
          notes:     exp.description ?? exp.vendor ?? '',
        },
      ];

      if (vat > 0 && inputVatAcc) {
        lines.push({
          accountId: inputVatAcc.id,
          accountAr: inputVatAcc.nameAr,
          debit:     vat,
          credit:    0,
          notes:     'ضريبة مدخلات',
        });
      }

      lines.push({
        accountId: creditAcc.id,
        accountAr: creditAcc.nameAr,
        debit:     0,
        credit:    total,
        notes:     exp.vendor ?? exp.referenceNumber ?? '',
      });

      const journalNumber = await this.accounting.nextJournalNumber(orgId);
      const journal = await this.prisma.journalEntry.create({
        data: {
          organizationId: orgId,
          journalNumber,
          entryDate:      exp.expenseDate,
          description:    `مصروف: ${exp.description ?? exp.vendor ?? exp.id}`,
          reference:      exp.referenceNumber ?? undefined,
          status:         'posted',
          sourceType:     'expense',
          sourceId:       String(exp.id),
          createdById:    userId ?? null,
          lines:          { create: lines },
        },
      });

      return journal.id;
    } catch (err) {
      this.logger.warn(`Auto-journal for expense ${exp.id} failed: ${err}`);
      return null;
    }
  }
}
