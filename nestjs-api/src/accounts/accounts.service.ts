import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, NormalBalance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

// Default chart of accounts for a new organization
const DEFAULT_ACCOUNTS = [
  // ─── Assets ───
  { code: '1000', nameAr: 'الأصول',              nameEn: 'Assets',              accountType: AccountType.asset,     normalBalance: NormalBalance.debit,  parentId: null },
  { code: '1100', nameAr: 'الأصول المتداولة',      nameEn: 'Current Assets',      accountType: AccountType.asset,     normalBalance: NormalBalance.debit,  parentCode: '1000' },
  { code: '1110', nameAr: 'البنك',                nameEn: 'Bank',                accountType: AccountType.asset,     normalBalance: NormalBalance.debit,  parentCode: '1100' },
  { code: '1120', nameAr: 'الخزينة / النقدية',     nameEn: 'Cash',                accountType: AccountType.asset,     normalBalance: NormalBalance.debit,  parentCode: '1100' },
  { code: '1130', nameAr: 'المخزون',              nameEn: 'Inventory',           accountType: AccountType.asset,     normalBalance: NormalBalance.debit,  parentCode: '1100' },
  { code: '1140', nameAr: 'ذمم نون المدينة',       nameEn: 'Noon Receivables',    accountType: AccountType.asset,     normalBalance: NormalBalance.debit,  parentCode: '1100' },
  { code: '1150', nameAr: 'ضريبة مدخلات',         nameEn: 'Input VAT',           accountType: AccountType.asset,     normalBalance: NormalBalance.debit,  parentCode: '1100' },
  // ─── Liabilities ───
  { code: '2000', nameAr: 'الخصوم',              nameEn: 'Liabilities',         accountType: AccountType.liability, normalBalance: NormalBalance.credit, parentId: null },
  { code: '2100', nameAr: 'الخصوم المتداولة',      nameEn: 'Current Liabilities', accountType: AccountType.liability, normalBalance: NormalBalance.credit, parentCode: '2000' },
  { code: '2110', nameAr: 'الموردون',             nameEn: 'Accounts Payable',    accountType: AccountType.liability, normalBalance: NormalBalance.credit, parentCode: '2100' },
  { code: '2120', nameAr: 'ضريبة القيمة المضافة', nameEn: 'VAT Payable',         accountType: AccountType.liability, normalBalance: NormalBalance.credit, parentCode: '2100' },
  // ─── Equity ───
  { code: '3000', nameAr: 'حقوق الملكية',         nameEn: 'Equity',              accountType: AccountType.equity,    normalBalance: NormalBalance.credit, parentId: null },
  { code: '3100', nameAr: 'رأس المال',            nameEn: 'Capital',             accountType: AccountType.equity,    normalBalance: NormalBalance.credit, parentCode: '3000' },
  { code: '3200', nameAr: 'الأرباح المحتجزة',      nameEn: 'Retained Earnings',   accountType: AccountType.equity,    normalBalance: NormalBalance.credit, parentCode: '3000' },
  // ─── Revenue ───
  { code: '4000', nameAr: 'الإيرادات',            nameEn: 'Revenue',             accountType: AccountType.revenue,   normalBalance: NormalBalance.credit, parentId: null },
  { code: '4100', nameAr: 'مبيعات نون',           nameEn: 'Noon Sales',          accountType: AccountType.revenue,   normalBalance: NormalBalance.credit, parentCode: '4000' },
  // ─── Expenses ───
  { code: '5000', nameAr: 'المصاريف',             nameEn: 'Expenses',            accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentId: null },
  { code: '5100', nameAr: 'رسوم نون',             nameEn: 'Noon Fees',           accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentCode: '5000' },
  { code: '5110', nameAr: 'رسوم الإحالة',          nameEn: 'Referral Fees',       accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentCode: '5100' },
  { code: '5120', nameAr: 'رسوم FBN',             nameEn: 'FBN Fees',            accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentCode: '5100' },
  { code: '5130', nameAr: 'رسوم الكشف',            nameEn: 'Statement Fees',      accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentCode: '5100' },
  { code: '5200', nameAr: 'تكلفة البضاعة المباعة', nameEn: 'Cost of Goods Sold',  accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentCode: '5000' },
  { code: '5300', nameAr: 'مصاريف التسويق',        nameEn: 'Marketing Expenses',  accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentCode: '5000' },
  { code: '5400', nameAr: 'مصاريف الشحن',          nameEn: 'Shipping Expenses',   accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentCode: '5000' },
  { code: '5500', nameAr: 'المصاريف التشغيلية',    nameEn: 'Operating Expenses',  accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentCode: '5000' },
  { code: '5600', nameAr: 'فرق المخزون',           nameEn: 'Inventory Variance',  accountType: AccountType.expense,   normalBalance: NormalBalance.debit,  parentCode: '5000' },
];

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: number, params?: { q?: string; type?: string; activeOnly?: boolean }) {
    const where: any = { organizationId: orgId };
    if (params?.type) where.accountType = params.type;
    if (params?.activeOnly) where.isActive = true;
    if (params?.q) {
      where.OR = [
        { nameAr: { contains: params.q, mode: 'insensitive' } },
        { nameEn: { contains: params.q, mode: 'insensitive' } },
        { code:   { contains: params.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.account.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { children: { where: { isActive: true }, orderBy: { code: 'asc' } } },
    });
  }

  async findOne(id: number, orgId: number) {
    const acc = await this.prisma.account.findFirst({
      where: { id, organizationId: orgId },
      include: { children: { orderBy: { code: 'asc' } }, parent: true },
    });
    if (!acc) throw new NotFoundException('Account not found');
    return acc;
  }

  async findByCode(code: string, orgId: number) {
    return this.prisma.account.findUnique({ where: { organizationId_code: { organizationId: orgId, code } } });
  }

  async create(dto: CreateAccountDto, orgId: number) {
    const exists = await this.prisma.account.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: dto.code } },
    });
    if (exists) throw new ConflictException(`Account code ${dto.code} already exists`);

    return this.prisma.account.create({
      data: {
        organizationId: orgId,
        code:          dto.code,
        nameAr:        dto.nameAr,
        nameEn:        dto.nameEn,
        accountType:   dto.accountType,
        normalBalance: dto.normalBalance,
        parentId:      dto.parentId ?? null,
        description:   dto.description,
      },
    });
  }

  async update(id: number, dto: UpdateAccountDto, orgId: number) {
    await this.findOne(id, orgId);
    return this.prisma.account.update({
      where: { id },
      data: {
        nameAr:      dto.nameAr,
        nameEn:      dto.nameEn,
        description: dto.description,
        isActive:    dto.isActive,
      },
    });
  }

  async seedDefaults(orgId: number) {
    const count = await this.prisma.account.count({ where: { organizationId: orgId } });
    if (count > 0) return { seeded: false, message: 'Accounts already exist' };

    // Two-pass: first create roots/parents, then children
    const codeToId = new Map<string, number>();

    for (const acc of DEFAULT_ACCOUNTS) {
      const parentId = (acc as any).parentCode
        ? (codeToId.get((acc as any).parentCode) ?? null)
        : ((acc as any).parentId ?? null);

      const created = await this.prisma.account.create({
        data: {
          organizationId: orgId,
          code:           acc.code,
          nameAr:         acc.nameAr,
          nameEn:         acc.nameEn,
          accountType:    acc.accountType,
          normalBalance:  acc.normalBalance,
          parentId,
        },
      });
      codeToId.set(acc.code, created.id);
    }

    return { seeded: true, count: DEFAULT_ACCOUNTS.length };
  }

  async getBalance(id: number, orgId: number, from?: string, to?: string) {
    await this.findOne(id, orgId);
    const where: any = { accountId: id };
    if (from || to) {
      where.journal = {
        entryDate: {
          ...(from ? { gte: from } : {}),
          ...(to   ? { lte: to }   : {}),
        },
        status: 'posted',
      };
    } else {
      where.journal = { status: 'posted' };
    }

    const agg = await this.prisma.journalLine.aggregate({
      where,
      _sum: { debit: true, credit: true },
    });

    const debit  = Number(agg._sum.debit  ?? 0);
    const credit = Number(agg._sum.credit ?? 0);
    return { debit, credit, balance: debit - credit };
  }

  // Return map of code → Account for internal use by accounting auto-service
  async getCodeMap(orgId: number): Promise<Map<string, { id: number; nameAr: string; code: string }>> {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, code: true, nameAr: true },
    });
    const map = new Map<string, { id: number; nameAr: string; code: string }>();
    for (const a of accounts) map.set(a.code, a);
    return map;
  }
}
