import {
  Body, Controller, Get, Param, ParseIntPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { PlatformAdminService } from './platform-admin.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { ListMerchantsDto } from './dto/list-merchants.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreateMerchantUserDto } from './dto/create-merchant-user.dto';
import { UpdateMerchantUserDto } from './dto/update-merchant-user.dto';

// These routes are ONLY accessible by super_admin or platform_admin.
// The RolesGuard (globally registered) enforces 403 for any other role.
@ApiTags('platform-admin')
@ApiBearerAuth()
@Roles(Role.super_admin, Role.platform_admin)
@Controller('admin')
export class PlatformAdminController {
  constructor(private svc: PlatformAdminService) {}

  // ── SaaS KPIs ──────────────────────────────────────────────────────────────

  @Get('platform-kpis')
  @ApiOperation({ summary: 'Platform-level SaaS KPIs (MRR, ARR, merchant counts)' })
  getKpis() {
    return this.svc.getKpis();
  }

  // ── Merchants ──────────────────────────────────────────────────────────────

  @Get('merchants')
  @ApiOperation({ summary: 'List all platform merchants with current subscription' })
  listMerchants(@Query() query: ListMerchantsDto) {
    return this.svc.listMerchants(query);
  }

  @Post('merchants')
  @ApiOperation({ summary: 'Create a new merchant record' })
  createMerchant(@Body() dto: CreateMerchantDto) {
    return this.svc.createMerchant(dto);
  }

  @Get('merchants/:id')
  @ApiOperation({ summary: 'Full merchant detail with usage, health, and payments' })
  getMerchant(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMerchant(id);
  }

  @Patch('merchants/:id')
  @ApiOperation({ summary: 'Update merchant fields or link to an organization' })
  updateMerchant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMerchantDto,
  ) {
    return this.svc.updateMerchant(id, dto);
  }

  // ── Merchant users ─────────────────────────────────────────────────────────

  @Get('merchants/:id/users')
  @ApiOperation({ summary: 'List users in the merchant org' })
  listMerchantUsers(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listMerchantUsers(id);
  }

  @Post('merchants/:id/users')
  @ApiOperation({ summary: 'Create a user for the merchant org (auto-creates org if needed)' })
  createMerchantUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMerchantUserDto,
  ) {
    return this.svc.createMerchantUser(id, dto);
  }

  @Patch('merchants/:id/users/:userId')
  @ApiOperation({ summary: 'Update merchant user (role, isActive, password reset)' })
  updateMerchantUser(
    @Param('id', ParseIntPipe)     id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateMerchantUserDto,
  ) {
    return this.svc.updateMerchantUser(id, userId, dto);
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  @Get('plans')
  @ApiOperation({ summary: 'List subscription plans' })
  listPlans() {
    return this.svc.listPlans();
  }

  @Post('plans/seed-defaults')
  @ApiOperation({ summary: 'Seed Basic and Pro default plans (idempotent)' })
  seedPlans() {
    return this.svc.seedDefaultPlans();
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  @Get('subscriptions')
  @ApiOperation({ summary: 'List subscriptions, optionally filtered by merchantId' })
  listSubscriptions(@Query('merchantId') merchantId?: string) {
    return this.svc.listSubscriptions(merchantId ? parseInt(merchantId, 10) : undefined);
  }

  @Patch('subscriptions/:id')
  @ApiOperation({ summary: 'Update subscription status, dates, plan, or auto-renew' })
  updateSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.svc.updateSubscription(id, dto);
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  @Get('payments')
  @ApiOperation({ summary: 'List platform payments, optionally filtered by merchantId' })
  listPayments(@Query('merchantId') merchantId?: string) {
    return this.svc.listPayments(merchantId ? parseInt(merchantId, 10) : undefined);
  }
}
