import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  findOne(id: number) {
    return this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
    });
  }

  async requireOwnership(orgId: number) {
    const org = await this.findOne(orgId);
    if (!org || !org.isActive) throw new NotFoundException('Organization not found');
    return org;
  }
}
