import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Concurrency-safe sequential reference number generator.
 * Uses PostgreSQL upsert (INSERT … ON CONFLICT DO UPDATE) which is atomic —
 * no two concurrent calls for the same (orgId, prefix, year) can get the same sequence number.
 *
 * Format: PREFIX-YYYY-NNNNN
 * Examples: EXP-2026-00001 · JE-2026-00042 · MOV-2026-00007 · PINV-2026-00003
 */
@Injectable()
export class RefSeqService {
  constructor(private prisma: PrismaService) {}

  async next(orgId: number, prefix: string): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await this.prisma.referenceSequence.upsert({
      where:  { orgId_prefix_year: { orgId, prefix, year } },
      create: { orgId, prefix, year, lastSeq: 1 },
      update: { lastSeq: { increment: 1 } },
    });
    return `${prefix}-${year}-${String(seq.lastSeq).padStart(5, '0')}`;
  }
}
