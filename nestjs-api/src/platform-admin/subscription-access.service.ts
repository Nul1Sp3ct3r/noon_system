import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AccessStatus = 'active' | 'trial' | 'expired' | 'suspended' | 'no_subscription';

export interface MerchantAccess {
  status: AccessStatus;
  isActive: boolean;
  isReadOnly: boolean;
  daysRemaining: number | null;
  subscription: {
    id: number;
    planName: string;
    billingCycle: string;
    endDate: Date | null;
  } | null;
}

/**
 * Phase 9 — Subscription access helper.
 * Currently only computes status; does NOT enforce locking.
 * Future: use isReadOnly to make expired/suspended orgs read-only.
 */
@Injectable()
export class SubscriptionAccessService {
  constructor(private prisma: PrismaService) {}

  async getMerchantAccess(merchantId: number): Promise<MerchantAccess> {
    const sub = await this.prisma.subscription.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true } } },
    });

    if (!sub) {
      return { status: 'no_subscription', isActive: false, isReadOnly: true, daysRemaining: null, subscription: null };
    }

    const now = new Date();
    const daysRemaining = sub.endDate
      ? Math.max(0, Math.ceil((sub.endDate.getTime() - now.getTime()) / 86_400_000))
      : null;

    const statusMap: Record<string, AccessStatus> = {
      active:    'active',
      trial:     'trial',
      expired:   'expired',
      cancelled: 'expired',
      paused:    'suspended',
    };

    const status: AccessStatus = statusMap[sub.status] ?? 'expired';
    const isActive   = status === 'active' || status === 'trial';
    const isReadOnly = status === 'expired' || status === 'suspended';

    return {
      status,
      isActive,
      isReadOnly,
      daysRemaining,
      subscription: {
        id:           sub.id,
        planName:     sub.plan.name,
        billingCycle: sub.billingCycle,
        endDate:      sub.endDate,
      },
    };
  }
}
