import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { ListMovementsDto } from './dto/list-movements.dto';
import { StockQueryDto } from './dto/stock-query.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

const STALE_DAYS = 60;
const LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogsService,
  ) {}

  // ─── Warehouses ───────────────────────────────────────────────────────────────

  async findAllWarehouses(orgId: number) {
    return this.prisma.warehouse.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
  }

  async findOneWarehouse(id: number, orgId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async createWarehouse(dto: CreateWarehouseDto, orgId: number, actorId: number) {
    const warehouse = await this.prisma.warehouse.create({
      data: { ...dto, organizationId: orgId },
    });
    await this.audit.log({
      action: 'warehouse_create',
      userId: actorId,
      orgId,
      entityType: 'warehouse',
      entityId: warehouse.id,
      after: warehouse,
    });
    return warehouse;
  }

  async updateWarehouse(id: number, dto: UpdateWarehouseDto, orgId: number, actorId: number) {
    const before = await this.findOneWarehouse(id, orgId);
    const after = await this.prisma.warehouse.update({ where: { id }, data: dto });
    await this.audit.log({
      action: 'warehouse_update',
      userId: actorId,
      orgId,
      entityType: 'warehouse',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  // ─── Movements ────────────────────────────────────────────────────────────────

  async findAllMovements(orgId: number, query: ListMovementsDto) {
    const { sku, warehouseId, movementType, from, to, page = 1, limit = 100 } = query;
    const skip = (page - 1) * limit;

    // Build parameterized WHERE for the enriched raw query
    const params: unknown[] = [orgId];
    let pi = 2;
    const extraConds: string[] = [];

    if (sku)           { extraConds.push(`m.sku ILIKE $${pi++}`);                params.push(`%${sku}%`); }
    if (warehouseId)   { extraConds.push(`m.warehouse_id = $${pi++}`);           params.push(warehouseId); }
    if (movementType)  { extraConds.push(`m.movement_type = $${pi++}::text::"MovementType"`); params.push(movementType); }
    if (from)          { extraConds.push(`m.created_at >= $${pi++}`);            params.push(new Date(from)); }
    if (to)            { extraConds.push(`m.created_at <= $${pi++}`);            params.push(new Date(to)); }

    const extraWhere = extraConds.length ? ' AND ' + extraConds.join(' AND ') : '';

    params.push(limit, skip);
    const limitIdx = pi;
    const offsetIdx = pi + 1;

    type MovRow = {
      id: bigint; sku: string; warehouse_id: bigint | null; movement_type: string;
      quantity: bigint; reference: string | null; notes: string | null;
      created_at: Date; invoice_id: bigint | null;
      qty_before: bigint; qty_after: bigint;
      unit_cost: string | null; cost_impact: string | null;
      warehouse_name: string | null; product_name: string | null;
    };

    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM inventory_movements m
         WHERE m.organization_id = $1 AND m.is_void = false${extraWhere}`,
        ...params.slice(0, params.length - 2),
      ),
      this.prisma.$queryRawUnsafe<MovRow[]>(`
        WITH running AS (
          SELECT id,
            COALESCE(SUM(quantity) OVER (
              PARTITION BY sku, warehouse_id
              ORDER BY created_at ASC, id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ), 0) AS qty_before
          FROM inventory_movements
          WHERE organization_id = $1 AND is_void = false
        )
        SELECT
          m.id, m.sku, m.warehouse_id, m.movement_type::text AS movement_type,
          m.quantity, m.reference, m.notes, m.created_at, m.invoice_id,
          r.qty_before,
          r.qty_before + m.quantity AS qty_after,
          p.unit_cost::text        AS unit_cost,
          (COALESCE(p.unit_cost, 0) * m.quantity)::text AS cost_impact,
          w.name                   AS warehouse_name,
          p.name_en                AS product_name
        FROM inventory_movements m
        JOIN running r ON r.id = m.id
        LEFT JOIN products p ON p.sku = m.sku AND p.organization_id = $1
        LEFT JOIN warehouses w ON w.id = m.warehouse_id
        WHERE m.organization_id = $1 AND m.is_void = false${extraWhere}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `, ...params),
    ]);

    const total = Number(countRows[0].count);

    const items = rows.map(r => ({
      id:           Number(r.id),
      sku:          r.sku,
      movementType: r.movement_type,
      quantity:     Number(r.quantity),
      qtyBefore:    Number(r.qty_before),
      qtyAfter:     Number(r.qty_after),
      unitCost:     r.unit_cost ?? null,
      costImpact:   r.cost_impact ? parseFloat(r.cost_impact) : null,
      reference:    r.reference ?? null,
      notes:        r.notes ?? null,
      createdAt:    r.created_at,
      invoiceId:    r.invoice_id ? Number(r.invoice_id) : null,
      warehouse:    r.warehouse_name ? { id: Number(r.warehouse_id), name: r.warehouse_name } : null,
      product:      r.product_name  ? { nameEn: r.product_name } : null,
    }));

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createMovement(dto: CreateMovementDto, orgId: number, actorId: number) {
    if (dto.warehouseId) {
      await this.findOneWarehouse(dto.warehouseId, orgId);
    }

    const movement = await this.prisma.inventoryMovement.create({
      data: {
        organizationId: orgId,
        sku: dto.sku,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        movementType: dto.movementType,
        quantity: dto.quantity,
        reference: dto.reference,
        notes: dto.notes,
      },
    });

    await this.audit.log({
      action: 'movement_create',
      userId: actorId,
      orgId,
      entityType: 'movement',
      entityId: movement.id,
      after: movement,
    });
    return movement;
  }

  // ─── Stock levels (legacy) ────────────────────────────────────────────────────

  async getStockLevels(orgId: number, warehouseId?: number) {
    const grouped = await this.prisma.inventoryMovement.groupBy({
      by: ['sku', 'warehouseId'],
      where: { organizationId: orgId, isVoid: false, ...(warehouseId ? { warehouseId } : {}) },
      _sum: { quantity: true },
      orderBy: { sku: 'asc' },
    });
    return grouped.map(g => ({ sku: g.sku, warehouseId: g.warehouseId, quantity: g._sum.quantity ?? 0 }));
  }

  // ─── Enriched stock ───────────────────────────────────────────────────────────

  async getStockEnriched(orgId: number, query: StockQueryDto) {
    const { q, warehouseId, stockStatus, missingCost, staleStock, negativeMargin, page = 1, limit = 100 } = query;

    const [groups, products, warehouses] = await Promise.all([
      this.prisma.inventoryMovement.groupBy({
        by: ['sku', 'warehouseId'],
        where: { organizationId: orgId, isVoid: false },
        _sum: { quantity: true },
        _max: { createdAt: true },
      }),
      this.prisma.product.findMany({
        where: { organizationId: orgId },
        select: { sku: true, nameEn: true, nameAr: true, brand: true, unitCost: true, extraCosts: true },
      }),
      this.prisma.warehouse.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, code: true },
      }),
    ]);

    const prodMap = new Map(products.map(p => [p.sku, p]));
    const whMap   = new Map(warehouses.map(w => [w.id, w]));

    const skuList = [...new Set(groups.map(g => g.sku))];

    const [lastPurchaseItems, lastOrders] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: { sku: { in: skuList }, invoice: { organizationId: orgId, status: 'active' } },
        orderBy: { id: 'desc' },
        distinct: ['sku'],
        select: { sku: true, unitPrice: true },
      }),
      this.prisma.order.findMany({
        where: {
          organizationId: orgId,
          sku: { in: skuList },
          itemStatus: 'delivered',
          netProceeds: { not: null },
        },
        orderBy: { id: 'desc' },
        distinct: ['sku'],
        select: { sku: true, netProceeds: true },
      }),
    ]);

    const purchaseMap  = new Map(lastPurchaseItems.map(i => [i.sku, Number(i.unitPrice)]));
    const sellPriceMap = new Map(lastOrders.map(o => [o.sku!, Number(o.netProceeds)]));

    const staleMs = STALE_DAYS * 24 * 60 * 60 * 1000;
    const now     = Date.now();

    let rows = groups.map(g => {
      const prod          = prodMap.get(g.sku);
      const wh            = g.warehouseId ? whMap.get(g.warehouseId) : null;
      const qty           = g._sum.quantity ?? 0;
      const unitCost      = prod?.unitCost  ? Number(prod.unitCost)  : null;
      const extraCosts    = prod?.extraCosts ? Number(prod.extraCosts) : 0;
      const effectiveCost = unitCost !== null ? unitCost + extraCosts : null;
      const lastPurchCost = purchaseMap.get(g.sku) ?? null;
      const sellingPrice  = sellPriceMap.get(g.sku) ?? null;
      const marginPct     = effectiveCost != null && sellingPrice != null && sellingPrice > 0
        ? ((sellingPrice - effectiveCost) / sellingPrice) * 100
        : null;
      const totalValue    = effectiveCost != null ? qty * effectiveCost : null;
      const lastMov       = g._max.createdAt;
      const isStale       = lastMov ? (now - new Date(lastMov).getTime()) > staleMs : true;
      const stockSt       = qty <= 0 ? 'out_of_stock' : qty <= LOW_STOCK_THRESHOLD ? 'low_stock' : 'in_stock';

      return {
        sku:              g.sku,
        nameEn:           prod?.nameEn ?? null,
        nameAr:           prod?.nameAr ?? null,
        brand:            prod?.brand  ?? null,
        warehouse:        wh ? { id: wh.id, name: wh.name, code: wh.code } : null,
        qty,
        unitCost:         unitCost   != null ? unitCost.toFixed(4)   : null,
        extraCosts:       extraCosts >  0    ? extraCosts.toFixed(4) : null,
        lastPurchaseCost: lastPurchCost != null ? lastPurchCost.toFixed(4) : null,
        sellingPrice:     sellingPrice  != null ? sellingPrice.toFixed(2)  : null,
        expectedMarginPct: marginPct != null ? parseFloat(marginPct.toFixed(2)) : null,
        totalValue:       totalValue != null ? parseFloat(totalValue.toFixed(2)) : null,
        lastMovementDate: lastMov?.toISOString() ?? null,
        stockStatus:      stockSt,
        isStale,
        hasCost:          unitCost !== null,
        costExceedsPrice: effectiveCost != null && sellingPrice != null && effectiveCost > sellingPrice,
      };
    });

    // Apply filters
    if (q) {
      const lq = q.toLowerCase();
      rows = rows.filter(r =>
        r.sku.toLowerCase().includes(lq) ||
        (r.nameEn  ?? '').toLowerCase().includes(lq) ||
        (r.nameAr  ?? '').toLowerCase().includes(lq) ||
        (r.brand   ?? '').toLowerCase().includes(lq)
      );
    }
    if (warehouseId)    rows = rows.filter(r => r.warehouse?.id === warehouseId);
    if (stockStatus)    rows = rows.filter(r => r.stockStatus === stockStatus);
    if (missingCost)    rows = rows.filter(r => !r.hasCost);
    if (staleStock)     rows = rows.filter(r => r.isStale && r.qty > 0);
    if (negativeMargin) rows = rows.filter(r => r.costExceedsPrice);

    // Sort: highest total value first, then by sku
    rows.sort((a, b) => {
      if (b.totalValue != null && a.totalValue != null) return b.totalValue - a.totalValue;
      if (b.totalValue != null) return  1;
      if (a.totalValue != null) return -1;
      return a.sku.localeCompare(b.sku);
    });

    const total     = rows.length;
    const skip      = (page - 1) * limit;
    const pageItems = rows.slice(skip, skip + limit);

    return { items: pageItems, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── Inventory dashboard (KPIs + alerts) ─────────────────────────────────────

  async getInventoryDashboard(orgId: number) {
    const { items } = await this.getStockEnriched(orgId, { page: 1, limit: 99999 });

    const totalValue    = items.reduce((s, i) => s + (i.totalValue ?? 0), 0);
    const outOfStock    = items.filter(i => i.stockStatus === 'out_of_stock').length;
    const lowStock      = items.filter(i => i.stockStatus === 'low_stock').length;
    const missingCost   = items.filter(i => !i.hasCost).length;
    const staleCount    = items.filter(i => i.isStale && i.qty > 0).length;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSaleSkus = new Set(
      (await this.prisma.inventoryMovement.findMany({
        where: {
          organizationId: orgId,
          movementType: { in: [MovementType.sale, MovementType.noon_sync] },
          isVoid: false,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { sku: true },
        distinct: ['sku'],
      })).map(m => m.sku)
    );

    return {
      kpis: {
        totalValue:     parseFloat(totalValue.toFixed(2)),
        totalSkus:      items.length,
        outOfStock,
        lowStock,
        missingCost,
        staleInventory: staleCount,
      },
      alerts: {
        zeroStockRecentSales: items
          .filter(i => i.qty <= 0 && recentSaleSkus.has(i.sku))
          .slice(0, 15)
          .map(i => ({ sku: i.sku, nameEn: i.nameEn, qty: i.qty })),

        missingCostInStock: items
          .filter(i => !i.hasCost && i.qty > 0)
          .slice(0, 15)
          .map(i => ({ sku: i.sku, nameEn: i.nameEn, qty: i.qty })),

        costExceedsPrice: items
          .filter(i => i.costExceedsPrice && i.qty > 0)
          .slice(0, 15)
          .map(i => ({ sku: i.sku, nameEn: i.nameEn, unitCost: i.unitCost, sellingPrice: i.sellingPrice })),

        noMovement60Days: items
          .filter(i => i.isStale && i.qty > 0)
          .slice(0, 15)
          .map(i => ({ sku: i.sku, nameEn: i.nameEn, qty: i.qty, lastMovementDate: i.lastMovementDate })),
      },
    };
  }

  // ─── Stock adjustment ─────────────────────────────────────────────────────────

  async adjustStock(dto: AdjustStockDto, orgId: number, actorId: number) {
    const agg = await this.prisma.inventoryMovement.aggregate({
      where: {
        organizationId: orgId,
        sku: dto.sku,
        isVoid: false,
        warehouseId: dto.warehouseId ?? null,
      },
      _sum: { quantity: true },
    });

    const currentQty = agg._sum.quantity ?? 0;
    const diff = dto.newQty - currentQty;

    if (diff === 0) {
      return { adjusted: false, message: 'القيمة مطابقة للمخزون الحالي', currentQty, newQty: dto.newQty };
    }

    const ref = `ADJ-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;

    const movement = await this.prisma.inventoryMovement.create({
      data: {
        organizationId: orgId,
        sku:           dto.sku,
        warehouseId:   dto.warehouseId,
        movementType:  MovementType.adjustment,
        quantity:      diff,
        reference:     ref,
        notes:         dto.reason,
      },
    });

    await this.audit.log({
      action: 'stock_adjust',
      userId: actorId,
      orgId,
      entityType: 'inventory_movement',
      entityId: movement.id,
      before: { qty: currentQty },
      after:  { qty: dto.newQty, diff, ref },
    });

    return {
      adjusted:    true,
      previousQty: currentQty,
      newQty:      dto.newQty,
      diff,
      reference:   ref,
      movementId:  movement.id,
    };
  }
}
