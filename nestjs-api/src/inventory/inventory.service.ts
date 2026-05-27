import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { ListMovementsDto } from './dto/list-movements.dto';

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

    const where: Prisma.InventoryMovementWhereInput = {
      organizationId: orgId,
      isVoid: false,
      ...(sku ? { sku: { contains: sku, mode: 'insensitive' } } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(movementType ? { movementType } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: { select: { id: true, name: true } },
          product: { select: { id: true, sku: true, nameEn: true } },
        },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

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

  // ─── Stock levels ─────────────────────────────────────────────────────────────

  async getStockLevels(orgId: number, warehouseId?: number) {
    const grouped = await this.prisma.inventoryMovement.groupBy({
      by: ['sku', 'warehouseId'],
      where: {
        organizationId: orgId,
        isVoid: false,
        ...(warehouseId ? { warehouseId } : {}),
      },
      _sum: { quantity: true },
      orderBy: { sku: 'asc' },
    });

    return grouped.map(g => ({
      sku: g.sku,
      warehouseId: g.warehouseId,
      quantity: g._sum.quantity ?? 0,
    }));
  }
}
