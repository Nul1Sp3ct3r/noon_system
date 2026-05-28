import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalDto } from './dto/create-journal.dto';
import { ListJournalsDto } from './dto/list-journals.dto';

@Injectable()
export class JournalsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: number, query: ListJournalsDto) {
    const { from, to, q, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: orgId,
      ...(from || to
        ? {
            entryDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(q ? { description: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { entryDate: 'desc' },
        include: { lines: true },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: number, orgId: number) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, organizationId: orgId },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  async create(dto: CreateJournalDto, orgId: number) {
    const totalDebit  = dto.lines.reduce((s, l) => s + l.debit,  0);
    const totalCredit = dto.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(
        `Journal entry is unbalanced: debits ${totalDebit.toFixed(2)} ≠ credits ${totalCredit.toFixed(2)}`,
      );
    }

    return this.prisma.journalEntry.create({
      data: {
        organizationId: orgId,
        entryDate:   dto.entryDate,
        description: dto.description,
        sourceType:  dto.sourceType,
        sourceId:    dto.sourceId,
        lines: { create: dto.lines.map(l => ({
          accountAr: l.accountAr,
          debit:     l.debit,
          credit:    l.credit,
        })) },
      },
      include: { lines: true },
    });
  }

  async remove(id: number, orgId: number) {
    await this.findOne(id, orgId);
    await this.prisma.journalEntry.delete({ where: { id } });
    return { deleted: true };
  }
}
