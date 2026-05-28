import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreateJournalDto } from './dto/create-journal.dto';
import { ListJournalsDto } from './dto/list-journals.dto';

@Injectable()
export class JournalsService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  async findAll(orgId: number, query: ListJournalsDto) {
    const { from, to, q, status, accountId, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId: orgId };
    if (from || to) where.entryDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (q) where.OR = [
      { description:   { contains: q, mode: 'insensitive' } },
      { journalNumber: { contains: q, mode: 'insensitive' } },
      { reference:     { contains: q, mode: 'insensitive' } },
    ];
    if (status) where.status = status;
    if (accountId) where.lines = { some: { accountId } };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
        include: {
          lines:     { include: { account: { select: { id: true, code: true, nameAr: true } } } },
          createdBy: { select: { id: true, fullName: true, username: true } },
        },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getStats(orgId: number) {
    const today = new Date().toISOString().slice(0, 10);
    const [total, todayCount, posted, draft] = await Promise.all([
      this.prisma.journalEntry.count({ where: { organizationId: orgId } }),
      this.prisma.journalEntry.count({ where: { organizationId: orgId, entryDate: today } }),
      this.prisma.journalEntry.count({ where: { organizationId: orgId, status: 'posted' } }),
      this.prisma.journalEntry.count({ where: { organizationId: orgId, status: 'draft' } }),
    ]);

    const sumAgg = await this.prisma.journalLine.aggregate({
      where: { journal: { organizationId: orgId, status: 'posted' } },
      _sum: { debit: true, credit: true },
    });

    return {
      total,
      todayCount,
      posted,
      draft,
      totalDebit:  Number(sumAgg._sum.debit  ?? 0),
      totalCredit: Number(sumAgg._sum.credit ?? 0),
    };
  }

  async findOne(id: number, orgId: number) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, organizationId: orgId },
      include: {
        lines:     { orderBy: { id: 'asc' }, include: { account: { select: { id: true, code: true, nameAr: true } } } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  async create(dto: CreateJournalDto, orgId: number, userId?: number) {
    const totalDebit  = dto.lines.reduce((s, l) => s + l.debit,  0);
    const totalCredit = dto.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(
        `القيد غير متوازن: مدين ${totalDebit.toFixed(2)} ≠ دائن ${totalCredit.toFixed(2)}`,
      );
    }

    if (dto.status === 'posted' || dto.status === undefined) {
      const locked = await this.accounting.isPeriodLocked(orgId, dto.entryDate);
      if (locked) throw new ForbiddenException(`الفترة المحاسبية مغلقة لتاريخ ${dto.entryDate}`);
    }

    const journalNumber = dto.status !== 'draft'
      ? await this.accounting.nextJournalNumber(orgId)
      : undefined;

    // Resolve account names for lines that have accountId but no accountAr
    const lines = await Promise.all(dto.lines.map(async l => {
      let accountAr = l.accountAr || '';
      if (l.accountId && !accountAr) {
        const acc = await this.prisma.account.findUnique({ where: { id: l.accountId } });
        accountAr = acc?.nameAr ?? String(l.accountId);
      }
      return {
        accountId: l.accountId ?? null,
        accountAr,
        debit:  l.debit,
        credit: l.credit,
        notes:  l.notes,
      };
    }));

    return this.prisma.journalEntry.create({
      data: {
        organizationId: orgId,
        journalNumber,
        entryDate:   dto.entryDate,
        description: dto.description,
        reference:   dto.reference,
        status:      (dto.status ?? 'posted') as any,
        sourceType:  dto.sourceType,
        sourceId:    dto.sourceId,
        createdById: userId ?? null,
        lines: { create: lines },
      },
      include: {
        lines:     { include: { account: { select: { id: true, code: true, nameAr: true } } } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });
  }

  async post(id: number, orgId: number) {
    const entry = await this.findOne(id, orgId);
    if (entry.status === 'posted') throw new BadRequestException('القيد مرحّل بالفعل');
    if (entry.status === 'reversed') throw new BadRequestException('لا يمكن ترحيل قيد محوّل');

    const locked = await this.accounting.isPeriodLocked(orgId, entry.entryDate);
    if (locked) throw new ForbiddenException(`الفترة المحاسبية مغلقة`);

    const journalNumber = entry.journalNumber ?? await this.accounting.nextJournalNumber(orgId);
    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: 'posted', journalNumber },
    });
  }

  async reverse(id: number, orgId: number, userId?: number) {
    const entry = await this.findOne(id, orgId);
    if (entry.status !== 'posted') throw new BadRequestException('يمكن محو القيود المرحّلة فقط');

    const today = new Date().toISOString().slice(0, 10);
    const locked = await this.accounting.isPeriodLocked(orgId, today);
    if (locked) throw new ForbiddenException('الفترة المحاسبية الحالية مغلقة');

    const journalNumber = await this.accounting.nextJournalNumber(orgId);

    const reversal = await this.prisma.journalEntry.create({
      data: {
        organizationId: orgId,
        journalNumber,
        entryDate:   today,
        description: `محو: ${entry.description ?? entry.journalNumber ?? `#${entry.id}`}`,
        reference:   entry.journalNumber ?? undefined,
        status:      'posted',
        sourceType:  'reversal',
        sourceId:    String(entry.id),
        createdById: userId ?? null,
        lines: {
          create: entry.lines.map(l => ({
            accountId: l.accountId ?? null,
            accountAr: l.accountAr,
            debit:     Number(l.credit),
            credit:    Number(l.debit),
            notes:     `محو: ${l.notes ?? ''}`.trim(),
          })),
        },
      },
      include: { lines: true },
    });

    await this.prisma.journalEntry.update({ where: { id }, data: { status: 'reversed' } });
    return reversal;
  }

  async remove(id: number, orgId: number) {
    const entry = await this.findOne(id, orgId);
    if (entry.status === 'posted') throw new BadRequestException('لا يمكن حذف قيد مرحّل — استخدم المحو بدلاً من ذلك');

    const locked = await this.accounting.isPeriodLocked(orgId, entry.entryDate);
    if (locked) throw new ForbiddenException('الفترة المحاسبية مغلقة');

    await this.prisma.journalEntry.delete({ where: { id } });
    return { deleted: true };
  }
}
