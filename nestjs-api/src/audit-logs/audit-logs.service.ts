import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface LogOptions {
  action: string;
  userId?: number;
  orgId?: number;
  entityType?: string;
  entityId?: string | number;
  before?: object;
  after?: object;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private prisma: PrismaService) {}

  async log(opts: LogOptions) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: opts.action,
          userId: opts.userId,
          organizationId: opts.orgId,
          entityType: opts.entityType,
          entityId: opts.entityId != null ? String(opts.entityId) : undefined,
          before: opts.before as object,
          after: opts.after as object,
          ipAddress: opts.ipAddress,
          userAgent: opts.userAgent,
        },
      });
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }
}
