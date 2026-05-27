import { Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AdminUpdateUserDto } from './dto/update-user.dto';

const SAFE_USER_SELECT = {
  id: true,
  organizationId: true,
  username: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  lastLogin: true,
};

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogsService,
  ) {}

  // ── Audit Logs ─────────────────────────────────────────────────────────────

  async getAuditLogs(orgId: number, query: AuditLogQueryDto) {
    const { page = 1, limit = 50, action, userId, entityType, from, to } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId: orgId };
    if (action)     where.action     = { contains: action, mode: 'insensitive' };
    if (userId)     where.userId     = userId;
    if (entityType) where.entityType = entityType;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, username: true, fullName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── Backup export ──────────────────────────────────────────────────────────

  async exportBackup(orgId: number) {
    const [
      products,
      warehouses,
      orders,
      importBatches,
      statementFees,
      invoices,
      movements,
      users,
    ] = await Promise.all([
      this.prisma.product.findMany({ where: { organizationId: orgId } }),
      this.prisma.warehouse.findMany({ where: { organizationId: orgId } }),
      this.prisma.order.findMany({ where: { organizationId: orgId } }),
      this.prisma.importBatch.findMany({ where: { organizationId: orgId } }),
      this.prisma.statementFee.findMany({ where: { organizationId: orgId } }),
      this.prisma.invoice.findMany({
        where: { organizationId: orgId },
        include: { items: true },
      }),
      this.prisma.inventoryMovement.findMany({ where: { organizationId: orgId } }),
      this.prisma.user.findMany({
        where: { organizationId: orgId },
        select: SAFE_USER_SELECT,
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      organizationId: orgId,
      products,
      warehouses,
      orders,
      importBatches,
      statementFees,
      invoices,
      inventoryMovements: movements,
      users,
    };
  }

  // ── User management ────────────────────────────────────────────────────────

  async listUsers(orgId: number) {
    return this.prisma.user.findMany({
      where: { organizationId: orgId },
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateUser(id: number, dto: AdminUpdateUserDto, orgId: number, actorId: number) {
    const before = await this.prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: SAFE_USER_SELECT,
    });
    if (!before) throw new NotFoundException('User not found');

    const data: any = {};
    if (dto.role     !== undefined) data.role     = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.password) data.passwordHash = await argon2.hash(dto.password);

    const after = await this.prisma.user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT,
    });

    await this.audit.log({
      action: 'admin_update_user',
      userId: actorId,
      orgId,
      entityType: 'user',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  // ── Performance summary ────────────────────────────────────────────────────

  async getPerformance(orgId: number) {
    const [
      orderCount,
      productCount,
      invoiceCount,
      movementCount,
      importCount,
      auditCount,
    ] = await Promise.all([
      this.prisma.order.count({ where: { organizationId: orgId } }),
      this.prisma.product.count({ where: { organizationId: orgId } }),
      this.prisma.invoice.count({ where: { organizationId: orgId } }),
      this.prisma.inventoryMovement.count({ where: { organizationId: orgId } }),
      this.prisma.importBatch.count({ where: { organizationId: orgId } }),
      this.prisma.auditLog.count({ where: { organizationId: orgId } }),
    ]);

    return {
      organizationId: orgId,
      counts: { orders: orderCount, products: productCount, invoices: invoiceCount, inventoryMovements: movementCount, importBatches: importCount, auditLogs: auditCount },
    };
  }
}
