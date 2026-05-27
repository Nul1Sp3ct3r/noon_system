import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListOrdersDto } from './dto/list-orders.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: number, query: ListOrdersDto) {
    const { status, from, to, sku, partnerSku, orderNr, importBatch, page = 1, limit = 100 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      organizationId: orgId,
      ...(status ? { itemStatus: status } : {}),
      ...(sku ? { sku: { contains: sku, mode: 'insensitive' } } : {}),
      ...(partnerSku ? { partnerSku: { contains: partnerSku, mode: 'insensitive' } } : {}),
      ...(orderNr ? { orderNr: { contains: orderNr, mode: 'insensitive' } } : {}),
      ...(importBatch ? { importBatch } : {}),
      ...(from || to
        ? {
            orderedDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderedDate: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: number, orgId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}
