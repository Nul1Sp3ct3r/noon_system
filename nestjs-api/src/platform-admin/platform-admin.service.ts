import { Injectable, NotFoundException } from '@nestjs/common';
import { BillingCycle, MerchantStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { ListMerchantsDto } from './dto/list-merchants.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

const BASIC_FEATURES = [
  'استيراد أسبوعي وشهري',
  'إدارة الطلبات والمبيعات',
  'المنتجات والمخزون',
  'التقارير المالية',
  'حساب الربحية',
  'المصروفات والفواتير',
  'مركز ضريبة القيمة المضافة',
  'لوحة التحكم المالية',
  'مستخدم واحد',
];

const PRO_FEATURES = [
  ...BASIC_FEATURES.slice(0, -1),
  'المحاسبة المتقدمة',
  'القيود المحاسبية',
  'دليل الحسابات',
  'دفتر الأستاذ',
  'ميزان المراجعة',
  'إدارة الفترات المحاسبية',
  'صلاحيات المستخدمين',
  'دعم متعدد المستخدمين',
  'سجل المراجعة',
  'تقارير مالية متقدمة',
  'دعم ذو أولوية',
];

@Injectable()
export class PlatformAdminService {
  constructor(private prisma: PrismaService) {}

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  async getKpis() {
    const now = new Date();

    const [
      totalMerchants,
      activeMerchants,
      trialMerchants,
      expiredSubs,
      suspendedSubs,
      paidThisMonth,
      pendingPayments,
    ] = await Promise.all([
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { status: MerchantStatus.active } }),
      this.prisma.merchant.count({ where: { status: MerchantStatus.trial } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.expired } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.paused } }),
      this.prisma.platformPayment.aggregate({
        where: {
          status: 'paid',
          paidAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        },
        _sum: { amount: true },
      }),
      this.prisma.platformPayment.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
      }),
    ]);

    // MRR — sum of active monthly subscription prices + (yearly / 12)
    const activeSubs = await this.prisma.subscription.findMany({
      where: { status: { in: [SubscriptionStatus.active, SubscriptionStatus.trial] } },
      select: { billingCycle: true, price: true },
    });

    const mrr = activeSubs.reduce((sum, s) => {
      const p = Number(s.price);
      return sum + (s.billingCycle === BillingCycle.yearly ? p / 12 : p);
    }, 0);

    return {
      totalMerchants,
      activeMerchants,
      trialMerchants,
      expiredSubscriptions:   expiredSubs,
      suspendedSubscriptions: suspendedSubs,
      mrr:            Math.round(mrr * 100) / 100,
      arr:            Math.round(mrr * 12 * 100) / 100,
      monthlyRevenue: Number(paidThisMonth._sum.amount ?? 0),
      pendingPayments: Number(pendingPayments._sum.amount ?? 0),
    };
  }

  // ─── Merchants ─────────────────────────────────────────────────────────────

  async listMerchants(query: ListMerchantsDto) {
    const { q, status, page = 1, limit = 25 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { businessName: { contains: q, mode: 'insensitive' } },
        { ownerName:    { contains: q, mode: 'insensitive' } },
        { email:        { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.merchant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: { select: { name: true, code: true } } },
          },
        },
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return {
      items: items.map(m => ({
        ...m,
        currentSubscription: m.subscriptions[0] ?? null,
        subscriptions: undefined,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async createMerchant(dto: CreateMerchantDto) {
    return this.prisma.merchant.create({ data: dto });
  }

  async getMerchant(id: number) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const currentSub = merchant.subscriptions[0] ?? null;

    // Usage stats — only available if merchant is linked to an org
    let usage = { products: 0, orders: 0, imports: 0, users: 0, lastLogin: null as Date | null };
    let health = { failedImports: 0, missingCostProducts: 0, lowStock: 0 };

    if (merchant.organizationId) {
      const orgId = merchant.organizationId;

      const [products, orders, imports, users, failedImports, missingCost, lastUser] =
        await Promise.all([
          this.prisma.product.count({ where: { organizationId: orgId } }),
          this.prisma.order.count({ where: { organizationId: orgId } }),
          this.prisma.importBatch.count({ where: { organizationId: orgId } }),
          this.prisma.user.count({ where: { organizationId: orgId, isActive: true } }),
          this.prisma.importBatch.count({ where: { organizationId: orgId, status: 'failed' } }),
          this.prisma.product.count({ where: { organizationId: orgId, unitCost: null } }),
          this.prisma.user.findFirst({
            where: { organizationId: orgId },
            orderBy: { lastLogin: 'desc' },
            select: { lastLogin: true },
          }),
        ]);

      // Low stock: items where total quantity <= 5
      const stockGroups = await this.prisma.inventoryMovement.groupBy({
        by: ['sku'],
        where: { organizationId: orgId, isVoid: false },
        _sum: { quantity: true },
        having: { quantity: { _sum: { lte: 5 } } },
      });

      usage  = { products, orders, imports, users, lastLogin: lastUser?.lastLogin ?? null };
      health = { failedImports, missingCostProducts: missingCost, lowStock: stockGroups.length };
    }

    return {
      ...merchant,
      currentSubscription: currentSub,
      usage,
      health,
    };
  }

  async updateMerchant(id: number, dto: UpdateMerchantDto) {
    const existing = await this.prisma.merchant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Merchant not found');
    return this.prisma.merchant.update({ where: { id }, data: dto });
  }

  // ─── Plans ─────────────────────────────────────────────────────────────────

  async listPlans() {
    return this.prisma.plan.findMany({ orderBy: { monthlyPrice: 'asc' } });
  }

  async seedDefaultPlans() {
    const exists = await this.prisma.plan.count();
    if (exists > 0) return { seeded: false, message: 'Plans already exist' };

    await this.prisma.plan.createMany({
      data: [
        {
          name: 'Basic',
          code: 'basic',
          monthlyPrice: 149,
          yearlyPrice:  1399,
          features: BASIC_FEATURES,
          isActive: true,
        },
        {
          name: 'Pro',
          code: 'pro',
          monthlyPrice: 399,
          yearlyPrice:  3999,
          features: PRO_FEATURES,
          isActive: true,
        },
      ],
    });

    return { seeded: true, count: 2 };
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  async listSubscriptions(merchantId?: number) {
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;

    return this.prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        merchant: { select: { id: true, businessName: true, status: true } },
        plan:     { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateSubscription(id: number, dto: UpdateSubscriptionDto) {
    const existing = await this.prisma.subscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Subscription not found');

    const data: any = {};
    if (dto.status       !== undefined) data.status       = dto.status;
    if (dto.billingCycle !== undefined) data.billingCycle = dto.billingCycle;
    if (dto.endDate      !== undefined) data.endDate      = new Date(dto.endDate);
    if (dto.autoRenew    !== undefined) data.autoRenew    = dto.autoRenew;
    if (dto.planId       !== undefined) data.planId       = dto.planId;
    if (dto.notes        !== undefined) data.notes        = dto.notes;

    return this.prisma.subscription.update({
      where: { id },
      data,
      include: {
        merchant: { select: { id: true, businessName: true } },
        plan:     true,
      },
    });
  }

  // ─── Payments ──────────────────────────────────────────────────────────────

  async listPayments(merchantId?: number) {
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;

    return this.prisma.platformPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        merchant:     { select: { id: true, businessName: true } },
        subscription: { select: { id: true, plan: { select: { name: true } } } },
      },
    });
  }
}
