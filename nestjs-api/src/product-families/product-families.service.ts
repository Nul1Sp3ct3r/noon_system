import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { AddProductsDto } from './dto/add-products.dto';

type SkuStat = { revenue: number; fees: number; units: number };

@Injectable()
export class ProductFamiliesService {
  constructor(private prisma: PrismaService) {}

  // ─── List ────────────────────────────────────────────────────────────────────

  async findAll(orgId: number) {
    const families = await this.prisma.productFamily.findMany({
      where: { organizationId: orgId },
      include: {
        items: {
          include: { product: { select: { sku: true, unitCost: true, extraCosts: true, costIncludesVat: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (families.length === 0) return [];

    const allSkus = [...new Set(families.flatMap(f => f.items.map(i => i.product.sku)))];

    const [orders, movements] = await Promise.all([
      allSkus.length > 0
        ? this.prisma.order.findMany({
            where: { organizationId: orgId, sku: { in: allSkus } },
            select: { sku: true, netProceeds: true, referralFee: true, fbnOutboundFee: true, itemStatus: true },
          })
        : [],
      allSkus.length > 0
        ? this.prisma.inventoryMovement.findMany({
            where: { organizationId: orgId, sku: { in: allSkus }, isVoid: false },
            select: { sku: true, quantity: true },
          })
        : [],
    ]);

    const skuStats = this.buildSkuStats(orders);
    const skuQty   = this.buildSkuQty(movements);

    return families.map(f => this.buildFamilySummary(f, skuStats, skuQty));
  }

  // ─── Detail ──────────────────────────────────────────────────────────────────

  async findOne(id: number, orgId: number) {
    const family = await this.prisma.productFamily.findFirst({
      where: { id, organizationId: orgId },
      include: {
        items: {
          include: { product: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!family) throw new NotFoundException('Product family not found');

    const skus = family.items.map(i => i.product.sku);

    const [orders, movements] = await Promise.all([
      skus.length > 0
        ? this.prisma.order.findMany({
            where: { organizationId: orgId, sku: { in: skus } },
            select: { sku: true, netProceeds: true, referralFee: true, fbnOutboundFee: true, itemStatus: true },
          })
        : [],
      skus.length > 0
        ? this.prisma.inventoryMovement.findMany({
            where: { organizationId: orgId, sku: { in: skus }, isVoid: false },
            select: { sku: true, quantity: true },
          })
        : [],
    ]);

    const skuStats = this.buildSkuStats(orders);
    const skuQty   = this.buildSkuQty(movements);
    const summary  = this.buildFamilySummary(family, skuStats, skuQty);

    const skuBreakdown = family.items.map(item => {
      const p     = item.product;
      const stats = skuStats.get(p.sku);
      const qty   = skuQty.get(p.sku) ?? 0;
      const units   = stats?.units ?? 0;
      const revenue = stats?.revenue ?? 0;
      const fees    = stats?.fees ?? 0;
      let cogs = 0;
      if (p.unitCost) {
        const cost          = Number(p.unitCost);
        const costExcl      = p.costIncludesVat ? cost / 1.15 : cost;
        const extra         = Number(p.extraCosts ?? 0);
        cogs = (costExcl + extra) * units;
      }
      const profit = revenue - fees - cogs;
      return {
        productId: item.productId,
        sku:       p.sku,
        nameAr:    p.nameAr,
        nameEn:    p.nameEn,
        brand:     p.brand,
        unitCost:  p.unitCost,
        units,
        revenue: Math.round(revenue * 100) / 100,
        fees:    Math.round(fees    * 100) / 100,
        cogs:    Math.round(cogs    * 100) / 100,
        profit:  Math.round(profit  * 100) / 100,
        stock:   qty,
      };
    });

    return { ...summary, items: skuBreakdown };
  }

  // ─── By Product ───────────────────────────────────────────────────────────────

  async findByProduct(productId: number, orgId: number) {
    const item = await this.prisma.productFamilyItem.findFirst({
      where: { productId, family: { organizationId: orgId } },
      include: { family: true },
    });
    if (!item) return null;
    return { familyId: item.familyId, familyName: item.family.name };
  }

  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateFamilyDto, orgId: number) {
    const { productIds, ...rest } = dto;

    const family = await this.prisma.productFamily.create({
      data: { ...rest, organizationId: orgId },
    });

    if (productIds && productIds.length > 0) {
      await this.addProductsToFamily(family.id, productIds, orgId);
    }

    return this.findOne(family.id, orgId);
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  async update(id: number, dto: UpdateFamilyDto, orgId: number) {
    const existing = await this.prisma.productFamily.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Product family not found');

    const { updateProductCosts, productIds, ...rest } = dto;

    const family = await this.prisma.productFamily.update({
      where: { id },
      data: rest,
    });

    if (updateProductCosts && family.baseCost != null) {
      const items = await this.prisma.productFamilyItem.findMany({
        where: { familyId: id },
        select: { productId: true },
      });
      if (items.length > 0) {
        await this.prisma.product.updateMany({
          where: { id: { in: items.map(i => i.productId) } },
          data: {
            unitCost:        family.baseCost,
            costIncludesVat: family.costIncludesVat,
          },
        });
      }
    }

    if (productIds !== undefined) {
      await this.addProductsToFamily(id, productIds, orgId);
    }

    return this.findOne(id, orgId);
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async remove(id: number, orgId: number) {
    const existing = await this.prisma.productFamily.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Product family not found');
    await this.prisma.productFamily.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Manage members ───────────────────────────────────────────────────────────

  async addProducts(id: number, dto: AddProductsDto, orgId: number) {
    const family = await this.prisma.productFamily.findFirst({ where: { id, organizationId: orgId } });
    if (!family) throw new NotFoundException('Product family not found');
    await this.addProductsToFamily(id, dto.productIds, orgId);
    return this.findOne(id, orgId);
  }

  async removeProduct(familyId: number, productId: number, orgId: number) {
    const family = await this.prisma.productFamily.findFirst({ where: { id: familyId, organizationId: orgId } });
    if (!family) throw new NotFoundException('Product family not found');

    await this.prisma.productFamilyItem.deleteMany({ where: { familyId, productId } });
    return this.findOne(familyId, orgId);
  }

  // ─── Suggestions ──────────────────────────────────────────────────────────────

  async getSuggestions(orgId: number) {
    const [allProducts, existingItems] = await Promise.all([
      this.prisma.product.findMany({
        where: { organizationId: orgId },
        select: { id: true, sku: true, nameEn: true, nameAr: true, brand: true },
      }),
      this.prisma.productFamilyItem.findMany({
        where: { family: { organizationId: orgId } },
        select: { productId: true },
      }),
    ]);

    const inFamilySet = new Set(existingItems.map(i => i.productId));
    const freeProducts = allProducts.filter(p => !inFamilySet.has(p.id));

    const groups = new Map<string, typeof freeProducts>();
    for (const p of freeProducts) {
      const name = p.nameEn ?? p.nameAr ?? '';
      if (!name.trim()) continue;
      const key = this.normalizeForGrouping(name);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }

    return Array.from(groups.entries())
      .filter(([, prods]) => prods.length >= 2)
      .map(([suggestedName, prods]) => ({
        suggestedName: this.titleCase(suggestedName),
        products:      prods,
        confidence:    this.calculateConfidence(prods),
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async addProductsToFamily(familyId: number, productIds: number[], orgId: number) {
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: orgId },
      select: { id: true },
    });
    const validIds = products.map(p => p.id);

    if (validIds.length === 0) return;

    // Remove each product from any other family first (one family per product rule)
    await this.prisma.productFamilyItem.deleteMany({
      where: {
        productId: { in: validIds },
        familyId:  { not: familyId },
      },
    });

    // Upsert items (skip if already in this family)
    await this.prisma.$transaction(
      validIds.map(productId =>
        this.prisma.productFamilyItem.upsert({
          where:  { familyId_productId: { familyId, productId } },
          create: { familyId, productId },
          update: {},
        }),
      ),
    );
  }

  private buildSkuStats(orders: { sku: string | null; netProceeds: any; referralFee: any; fbnOutboundFee: any; itemStatus: string | null }[]) {
    const map = new Map<string, SkuStat>();
    for (const o of orders) {
      const sku    = o.sku ?? 'unknown';
      const status = (o.itemStatus ?? '').toLowerCase();
      if (!map.has(sku)) map.set(sku, { revenue: 0, fees: 0, units: 0 });
      const s = map.get(sku)!;
      if (status === 'delivered') {
        s.units   += 1;
        s.revenue += Number(o.netProceeds ?? 0);
      } else if (status === 'returned') {
        s.revenue -= Math.abs(Number(o.netProceeds ?? 0));
      }
      s.fees += Math.abs(Number(o.referralFee ?? 0)) + Math.abs(Number(o.fbnOutboundFee ?? 0));
    }
    return map;
  }

  private buildSkuQty(movements: { sku: string; quantity: number }[]) {
    const map = new Map<string, number>();
    for (const m of movements) {
      map.set(m.sku, (map.get(m.sku) ?? 0) + m.quantity);
    }
    return map;
  }

  private buildFamilySummary(
    family: { id: number; name: string; description: string | null; baseCost: any; costIncludesVat: boolean; notes: string | null; createdAt: Date; updatedAt: Date; items: Array<{ product: { sku: string; unitCost: any; extraCosts: any; costIncludesVat: boolean } }> },
    skuStats: Map<string, SkuStat>,
    skuQty: Map<string, number>,
  ) {
    let revenue = 0, fees = 0, cogs = 0, inventory = 0, units = 0;

    for (const item of family.items) {
      const p     = item.product;
      const stats = skuStats.get(p.sku);
      const qty   = skuQty.get(p.sku) ?? 0;

      if (stats) {
        revenue   += stats.revenue;
        fees      += stats.fees;
        units     += stats.units;
        if (p.unitCost) {
          const cost     = Number(p.unitCost);
          const costExcl = p.costIncludesVat ? cost / 1.15 : cost;
          cogs += (costExcl + Number(p.extraCosts ?? 0)) * stats.units;
        }
      }
      inventory += qty;
    }

    const profit = revenue - fees - cogs;

    return {
      id:             family.id,
      name:           family.name,
      description:    family.description,
      baseCost:       family.baseCost,
      costIncludesVat: family.costIncludesVat,
      notes:          family.notes,
      productCount:   family.items.length,
      units,
      revenue:   Math.round(revenue  * 100) / 100,
      fees:      Math.round(fees     * 100) / 100,
      cogs:      Math.round(cogs     * 100) / 100,
      profit:    Math.round(profit   * 100) / 100,
      inventory,
      createdAt: family.createdAt,
      updatedAt: family.updatedAt,
    };
  }

  private normalizeForGrouping(name: string): string {
    const lower = name.toLowerCase().trim();
    const colorVariants = [
      'blue', 'red', 'green', 'black', 'white', 'yellow', 'pink', 'purple',
      'orange', 'grey', 'gray', 'brown', 'beige', 'navy', 'gold', 'silver',
      'تركوازي', 'أزرق', 'أحمر', 'أخضر', 'أسود', 'أبيض', 'أصفر', 'وردي',
      'بنفسجي', 'برتقالي', 'رمادي',
    ];
    const sizePattern   = /\b(\d+(\.\d+)?\s*(g|kg|ml|l|oz|lb|mg|cm|mm|m)\b|xs|s\b|m\b|xl|xxl|xxxl)\b/gi;

    let normalized = lower.replace(sizePattern, '');
    for (const c of colorVariants) {
      normalized = normalized.replace(new RegExp(`\\b${c}\\b`, 'gi'), '');
    }
    return normalized.replace(/[^a-z0-9؀-ۿ\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  private titleCase(s: string): string {
    return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1));
  }

  private calculateConfidence(products: { nameEn: string | null; nameAr: string | null }[]): number {
    const names = products.map(p => (p.nameEn ?? p.nameAr ?? '').toLowerCase());
    if (names.length < 2) return 0;
    let total = 0, pairs = 0;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        total += this.stringSimilarity(names[i], names[j]);
        pairs++;
      }
    }
    return pairs > 0 ? Math.round((total / pairs) * 100) : 0;
  }

  private stringSimilarity(a: string, b: string): number {
    const longer  = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    if (longer.length === 0) return 1;
    const dist = this.editDistance(longer, shorter);
    return (longer.length - dist) / longer.length;
  }

  private editDistance(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }
}
