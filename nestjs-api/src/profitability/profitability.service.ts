import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfitabilityQueryDto } from './dto/profitability-query.dto';

type Badge = 'profitable' | 'low_margin' | 'loss' | 'missing_cost';

@Injectable()
export class ProfitabilityService {
  constructor(private prisma: PrismaService) {}

  async getProfitability(orgId: number, query: ProfitabilityQueryDto) {
    const where: any = {
      organizationId: orgId,
      itemStatus: 'Delivered',
    };

    if (query.startDate || query.endDate) {
      where.orderedDate = {};
      if (query.startDate) where.orderedDate.gte = new Date(query.startDate);
      if (query.endDate)   where.orderedDate.lte = new Date(query.endDate);
    }

    if (query.brand) where.brandEn = { contains: query.brand, mode: 'insensitive' };

    const orders = await this.prisma.order.findMany({
      where,
      select: { sku: true, brandEn: true, totalPayment: true, referralFee: true, fbnOutboundFee: true },
    });

    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId },
      select: { sku: true, nameEn: true, brand: true, unitCost: true, costIncludesVat: true },
    });
    const prodMap = new Map(products.map(p => [p.sku, p]));

    const skuMap = new Map<string, {
      sku: string;
      nameEn: string | null;
      brand: string | null;
      units: number;
      revenue: number;
      fees: number;
      cogs: number;
      profit: number;
      profitPerUnit: number;
      badge: Badge;
    }>();

    for (const o of orders) {
      const sku = o.sku ?? 'unknown';
      if (!skuMap.has(sku)) {
        const p = prodMap.get(sku);
        skuMap.set(sku, { sku, nameEn: p?.nameEn ?? null, brand: o.brandEn ?? p?.brand ?? null, units: 0, revenue: 0, fees: 0, cogs: 0, profit: 0, profitPerUnit: 0, badge: 'missing_cost' });
      }
      const row = skuMap.get(sku)!;
      row.units   += 1;
      row.revenue += Number(o.totalPayment ?? 0);
      row.fees    += Math.abs(Number(o.referralFee ?? 0)) + Math.abs(Number(o.fbnOutboundFee ?? 0));

      const p = prodMap.get(sku);
      if (p?.unitCost) {
        const cost = Number(p.unitCost);
        row.cogs += p.costIncludesVat ? cost / 1.15 : cost;
      }
    }

    return Array.from(skuMap.values()).map(r => {
      const p = prodMap.get(r.sku);
      const hasCost = !!p?.unitCost;
      r.profit        = r.revenue - r.fees - r.cogs;
      r.profitPerUnit = r.units > 0 ? r.profit / r.units : 0;
      r.badge         = this.badge(r.profitPerUnit, hasCost);
      return r;
    }).sort((a, b) => b.profitPerUnit - a.profitPerUnit);
  }

  private badge(profitPerUnit: number, hasCost: boolean): Badge {
    if (!hasCost) return 'missing_cost';
    if (profitPerUnit >= 2)  return 'profitable';
    if (profitPerUnit >= 0)  return 'low_margin';
    return 'loss';
  }
}
