import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditLogsService,
  ) {}

  // ─── Register ───────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException('Username already taken');

    const slug = dto.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const slugExists = await this.prisma.organization.findUnique({ where: { slug } });
    const finalSlug = slugExists ? `${slug}-${Date.now()}` : slug;

    const passwordHash = await argon2.hash(dto.password);

    const org = await this.prisma.organization.create({
      data: {
        name: dto.organizationName,
        slug: finalSlug,
        users: {
          create: {
            username: dto.username,
            passwordHash,
            fullName: dto.fullName,
            role: Role.admin,
            isActive: true,
          },
        },
        warehouses: {
          create: { name: 'المستودع الرئيسي', code: 'MAIN' },
        },
      },
      include: { users: true },
    });

    const user = org.users[0];
    await this.audit.log({ action: 'register', userId: user.id, orgId: org.id });
    return this.issueTokens(user.id, user.username, user.role, org.id);
  }

  // ─── Login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new ForbiddenException('Account not activated');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    await this.audit.log({ action: 'login', userId: user.id, orgId: user.organizationId, ipAddress: ip });
    return this.issueTokens(user.id, user.username, user.role, user.organizationId);
  }

  // ─── Refresh ────────────────────────────────────────────────────────────────

  async refresh(userId: number, rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.userId !== userId || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.issueTokens(user.id, user.username, user.role, user.organizationId);
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  async logout(userId: number, rawToken?: string) {
    if (rawToken) {
      const tokenHash = this.hashToken(rawToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, userId },
        data: { revokedAt: new Date() },
      });
    } else {
      // Revoke all tokens for user
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log({ action: 'logout', userId });
    return { message: 'Logged out' };
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private async issueTokens(userId: number, username: string, role: Role, orgId: number) {
    const payload: JwtPayload = { sub: userId, username, role, orgId };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
    });

    const rawRefresh = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawRefresh);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { userId, organizationId: orgId, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
