import { Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ExpenseStatus, JournalStatus } from '@prisma/client';
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

  // ── ERP Dashboard ──────────────────────────────────────────────────────────

  async getDashboard(orgId: number) {
    const now = new Date();
    const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthStartStr  = monthStart.toISOString().slice(0, 10);
    const nextMonthStr   = nextMonthStart.toISOString().slice(0, 10);
    const sixMonthsAgo   = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

    const [
      salesAgg,
      orderCount,
      expensesAgg,
      productsMissingCost,
      failedImports,
      draftJournals,
      draftExpenses,
      stockGroups,
      productsWithCost,
      recentActivities,
      sixMoSalesRaw,
      sixMoExpenses,
      expensesByCat,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { organizationId: orgId, orderedDate: { gte: monthStart, lt: nextMonthStart }, itemStatus: 'delivered' },
        _sum: { netProceeds: true, referralFee: true, fbnOutboundFee: true },
      }),
      this.prisma.order.count({
        where: { organizationId: orgId, orderedDate: { gte: monthStart, lt: nextMonthStart }, itemStatus: 'delivered' },
      }),
      this.prisma.expense.aggregate({
        where: { organizationId: orgId, expenseDate: { gte: monthStartStr, lt: nextMonthStr }, status: { not: ExpenseStatus.rejected } },
        _sum: { totalAmount: true, vatAmount: true },
      }),
      this.prisma.product.count({ where: { organizationId: orgId, unitCost: null } }),
      this.prisma.importBatch.count({ where: { organizationId: orgId, status: 'failed' } }),
      this.prisma.journalEntry.count({ where: { organizationId: orgId, status: JournalStatus.draft } }),
      this.prisma.expense.count({
        where: { organizationId: orgId, status: { in: [ExpenseStatus.draft, ExpenseStatus.pending_approval] } },
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ['sku'],
        where: { organizationId: orgId, isVoid: false },
        _sum: { quantity: true },
      }),
      this.prisma.product.findMany({
        where: { organizationId: orgId, unitCost: { not: null } },
        select: { sku: true, unitCost: true, extraCosts: true },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId: orgId },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, username: true, fullName: true } } },
      }),
      this.prisma.$queryRaw<Array<{ month: string; sales: number; fees: number }>>`
        SELECT
          TO_CHAR(ordered_date, 'YYYY-MM') as month,
          COALESCE(SUM(net_proceeds), 0)::float as sales,
          COALESCE(SUM(ABS(COALESCE(referral_fee, 0)) + ABS(COALESCE(fbn_outbound_fee, 0))), 0)::float as fees
        FROM orders
        WHERE organization_id = ${orgId}
          AND ordered_date >= ${sixMonthsAgo}
          AND item_status = 'delivered'
        GROUP BY TO_CHAR(ordered_date, 'YYYY-MM')
        ORDER BY month
      `,
      this.prisma.$queryRaw<Array<{ month: string; expenses: number }>>`
        SELECT
          LEFT(expense_date, 7) as month,
          COALESCE(SUM(total_amount), 0)::float as expenses
        FROM expenses
        WHERE organization_id = ${orgId}
          AND expense_date >= ${sixMonthsAgoStr}
          AND status != 'rejected'
        GROUP BY LEFT(expense_date, 7)
        ORDER BY month
      `,
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: { organizationId: orgId, expenseDate: { gte: monthStartStr, lt: nextMonthStr }, status: { not: ExpenseStatus.rejected } },
        _sum: { totalAmount: true },
      }),
    ]);

    // Inventory value + stock health
    const costMap = new Map(
      productsWithCost.map(p => [p.sku, Number(p.unitCost ?? 0) + Number(p.extraCosts ?? 0)]),
    );
    let inventoryValue = 0;
    let outOfStock = 0;
    let lowStock = 0;
    for (const g of stockGroups) {
      const qty  = g._sum.quantity ?? 0;
      const cost = costMap.get(g.sku) ?? 0;
      if (qty <= 0) outOfStock++;
      else if (qty <= 5) lowStock++;
      if (qty > 0 && cost > 0) inventoryValue += qty * cost;
    }

    // KPIs
    const monthlySales    = Number(salesAgg._sum.netProceeds ?? 0);
    const monthlyFees     = Math.abs(Number(salesAgg._sum.referralFee ?? 0)) + Math.abs(Number(salesAgg._sum.fbnOutboundFee ?? 0));
    const monthlyExpenses = Number(expensesAgg._sum.totalAmount ?? 0);
    const inputVat        = Number(expensesAgg._sum.vatAmount ?? 0);
    const outputVat       = monthlySales * (15 / 115);
    const vatPayable      = Math.max(0, outputVat - inputVat);
    const netProfit       = monthlySales - monthlyFees - monthlyExpenses;

    // 6-month trend
    const trendMap: Record<string, { month: string; sales: number; fees: number; expenses: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      trendMap[key] = { month: key, sales: 0, fees: 0, expenses: 0 };
    }
    for (const row of sixMoSalesRaw) {
      if (trendMap[row.month]) {
        trendMap[row.month].sales = Number(row.sales);
        trendMap[row.month].fees  = Number(row.fees);
      }
    }
    for (const row of sixMoExpenses) {
      if (trendMap[row.month]) trendMap[row.month].expenses = Number(row.expenses);
    }
    const trend = Object.values(trendMap).map(t => ({
      month:    t.month,
      sales:    t.sales,
      expenses: t.expenses + t.fees,
      profit:   t.sales - t.expenses - t.fees,
    }));

    // Category names
    const catIds = expensesByCat.map(e => e.categoryId).filter(Boolean) as number[];
    const cats = catIds.length
      ? await this.prisma.expenseCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
      : [];
    const catMap = new Map(cats.map(c => [c.id, c.name]));

    return {
      kpis: { monthlySales, netProfit, monthlyExpenses, orderCount, inventoryValue, vatPayable },
      health: { failedImports, productsMissingCost, lowStock, outOfStock, draftJournals, draftExpenses },
      trend,
      expensesByCategory: expensesByCat
        .map(e => ({ category: e.categoryId ? (catMap.get(e.categoryId) ?? 'أخرى') : 'غير محدد', amount: Number(e._sum.totalAmount ?? 0) }))
        .filter(e => e.amount > 0),
      recentActivities,
    };
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
