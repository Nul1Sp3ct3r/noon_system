import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  lastLogin: true,
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogsService,
  ) {}

  findAll(orgId: number) {
    return this.prisma.user.findMany({
      where: { organizationId: orgId },
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, orgId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: number, dto: UpdateUserDto, actorId: number, orgId: number) {
    const user = await this.findOne(id, orgId);

    // Prevent removing the last active admin
    if (dto.role && dto.role !== Role.admin && user.role === Role.admin) {
      const adminCount = await this.prisma.user.count({
        where: { organizationId: orgId, role: Role.admin, isActive: true },
      });
      if (adminCount <= 1) throw new ForbiddenException('Cannot demote the last admin');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });

    await this.audit.log({
      action: 'user_update',
      userId: actorId,
      orgId,
      entityType: 'user',
      entityId: id,
      before: user,
      after: updated,
    });
    return updated;
  }

  async activate(id: number, actorId: number, orgId: number) {
    await this.findOne(id, orgId);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: USER_SELECT,
    });
    await this.audit.log({ action: 'user_activate', userId: actorId, orgId, entityType: 'user', entityId: id });
    return updated;
  }

  async deactivate(id: number, actorId: number, orgId: number) {
    await this.findOne(id, orgId);
    const adminCount = await this.prisma.user.count({
      where: { organizationId: orgId, role: Role.admin, isActive: true },
    });
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (target.role === Role.admin && adminCount <= 1) {
      throw new ForbiddenException('Cannot deactivate the last admin');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
    await this.audit.log({ action: 'user_deactivate', userId: actorId, orgId, entityType: 'user', entityId: id });
    return updated;
  }
}
