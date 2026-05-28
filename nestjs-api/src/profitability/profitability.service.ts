import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfitabilityQueryDto } from './dto/profitability-query.dto';

type Badge = 'profitable' | 'low_margin' | 'loss' | 'missing_cost';

const VAT_FACTOR = 15 / 115;
const VAT_RATE   = 0.15;

@Injectable()
export class ProfitabilityService {
  constructor(private prisma: PrismaService) {}

  async getProfitability(orgId: number, query: ProfitabilityQueryDto) {
    const where: any = { organizationId: orgId };

    if (query.startDate || query.endDate) {
      where.orderedDate = {};
      if (query.startDate) where.orderedDate.gte = new Date(query.startDate);
      if (query.endDate)   where.orderedDate.lte = new Date(query.endDate);
    }
    if (query.brand) where.brandEn = { contains: query.brand, mode: 'insensitive' };

    const orders = await this.prisma.order.findMany({
      where,
      select: {
        sku: true, brandEn: true, netProceeds: true,
        referralFee: true, fbnOutboundFee: true, itemStatus: true,
      },
    });

    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId },
      select: { sku: true, nameEn: true, brand: true, unitCost: true, extraCosts: true, costIncludesVat: true },
    });
    const prodMap = new Map(products.map(p => [p.sku, p]));

    const skuMap = new Map<string, {
      sku: string;
      nameEn: string | null;
      brand: string | null;
      units: number;
      returns: number;
      revenue: number;
      fees: number;
      cogs: number;
      extra: number;
      profit: number;
      profitPerUnit: number;
      badge: Badge;
    }>();

    for (const o of orders) {
      const sku    = o.sku ?? 'unknown';
      const status = (o.itemStatus ?? '').toLowerCase();
      if (!skuMap.has(sku)) {
        const p = prodMap.get(sku);
        skuMap.set(sku, {
          sku, nameEn: p?.nameEn ?? null, brand: o.brandEn ?? p?.brand ?? null,
          units: 0, returns: 0, revenue: 0, fees: 0, cogs: 0, extra: 0,
          profit: 0, profitPerUnit: 0, badge: 'missing_cost',
        });
      }
      const row = skuMap.get(sku)!;

      if (status === 'delivered') {
        row.units   += 1;
        row.revenue += Number(o.netProceeds ?? 0);
        const p = prodMap.get(sku);
        if (p?.unitCost) {
          const cost = Number(p.unitCost);
          row.cogs += p.costIncludesVat ? cost / 1.15 : cost;
        }
        if (p?.extraCosts) row.extra += Number(p.extraCosts);
      } else if (status === 'returned') {
        row.returns += 1;
      }
      row.fees += Math.abs(Number(o.referralFee ?? 0)) + Math.abs(Number(o.fbnOutboundFee ?? 0));
    }

    // Also ensure products with no orders appear in results with badge = missing_cost
    for (const p of products) {
      if (!skuMap.has(p.sku)) {
        skuMap.set(p.sku, {
          sku: p.sku, nameEn: p.nameEn, brand: p.brand,
          units: 0, returns: 0, revenue: 0, fees: 0, cogs: 0, extra: 0,
          profit: 0, profitPerUnit: 0, badge: 'missing_cost',
        });
      }
    }

    const result = Array.from(skuMap.values()).map(r => {
      const p      = prodMap.get(r.sku);
      const hasCost = !!(p?.unitCost || p?.extraCosts);
      r.profit        = r.revenue - r.fees - r.cogs - r.extra;
      r.profitPerUnit = r.units > 0 ? r.profit / r.units : r.profit;

      const outputVat        = Math.round(r.revenue * VAT_FACTOR * 100) / 100;
      const revenueExclVat   = Math.round((r.revenue - outputVat) * 100) / 100;
      const noonFeesExclVat  = Math.round(r.fees * 100) / 100;
      const inputVatNoon     = Math.round(r.fees * VAT_RATE * 100) / 100;

      r.badge = this.badge(r.profitPerUnit, hasCost);

      return {
        ...r,
        outputVat,
        revenueExclVat,
        noonFeesExclVat,
        inputVatNoon,
      };
    });

    // Apply filters
    let filtered = result;
    if (query.sku) {
      const q = query.sku.toLowerCase();
      filtered = filtered.filter(r =>
        r.sku.toLowerCase().includes(q) ||
        (r.nameEn ?? '').toLowerCase().includes(q)
      );
    }
    if (query.badge) filtered = filtered.filter(r => r.badge === query.badge);

    return filtered.sort((a, b) => b.profitPerUnit - a.profitPerUnit);
  }

  private badge(profitPerUnit: number, hasCost: boolean): Badge {
    if (!hasCost) return 'missing_cost';
    if (profitPerUnit >= 2)  return 'profitable';
    if (profitPerUnit >= 0)  return 'low_margin';
    return 'loss';
  }
}
