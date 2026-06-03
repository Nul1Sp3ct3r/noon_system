import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  getSettings(orgId: number) {
    return this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { vatRegistered: true, vatNumber: true, profitMode: true },
    });
  }

  async updateSettings(orgId: number, dto: { vatRegistered?: boolean; vatNumber?: string | null; profitMode?: string }) {
    if (dto.vatRegistered && !dto.vatNumber?.trim()) {
      throw new BadRequestException('رقم التسجيل الضريبي مطلوب عند تفعيل ضريبة القيمة المضافة');
    }
    if (dto.profitMode && !['expense', 'recoverable'].includes(dto.profitMode)) {
      throw new BadRequestException('profitMode must be expense or recoverable');
    }
    return this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(dto.vatRegistered !== undefined && { vatRegistered: dto.vatRegistered }),
        ...(dto.vatNumber     !== undefined && { vatNumber: dto.vatNumber || null }),
        ...(dto.profitMode    !== undefined && { profitMode: dto.profitMode }),
      },
      select: { vatRegistered: true, vatNumber: true, profitMode: true },
    });
  }
}
