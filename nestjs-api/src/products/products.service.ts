import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogsService,
  ) {}

  async findAll(orgId: number, query: ListProductsDto) {
    const { q, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: orgId,
      ...(q
        ? {
            OR: [
              { sku: { contains: q, mode: 'insensitive' as const } },
              { partnerSku: { contains: q, mode: 'insensitive' as const } },
              { barcode: { contains: q, mode: 'insensitive' as const } },
              { nameAr: { contains: q, mode: 'insensitive' as const } },
              { nameEn: { contains: q, mode: 'insensitive' as const } },
              { brand: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: number, orgId: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto, orgId: number, actorId: number) {
    const exists = await this.prisma.product.findUnique({
      where: { organizationId_sku: { organizationId: orgId, sku: dto.sku } },
    });
    if (exists) throw new ConflictException(`SKU "${dto.sku}" already exists`);

    const product = await this.prisma.product.create({
      data: { ...dto, organizationId: orgId },
    });

    await this.audit.log({
      action: 'product_create',
      userId: actorId,
      orgId,
      entityType: 'product',
      entityId: product.id,
      after: product,
    });
    return product;
  }

  async update(id: number, dto: UpdateProductDto, orgId: number, actorId: number) {
    const before = await this.findOne(id, orgId);

    if (dto.sku && dto.sku !== before.sku) {
      const conflict = await this.prisma.product.findUnique({
        where: { organizationId_sku: { organizationId: orgId, sku: dto.sku } },
      });
      if (conflict) throw new ConflictException(`SKU "${dto.sku}" already exists`);
    }

    const after = await this.prisma.product.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      action: 'product_update',
      userId: actorId,
      orgId,
      entityType: 'product',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async remove(id: number, orgId: number, actorId: number) {
    const product = await this.findOne(id, orgId);
    await this.prisma.product.delete({ where: { id } });
    await this.audit.log({
      action: 'product_delete',
      userId: actorId,
      orgId,
      entityType: 'product',
      entityId: id,
      before: product,
    });
    return { deleted: true };
  }
}
