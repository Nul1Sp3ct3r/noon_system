import {
  Body, Controller, Get, Param, ParseIntPipe,
  Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { AccountingService } from './accounting.service';

class TogglePeriodDto {
  @Type(() => Number) @IsInt() @Min(2020) @Max(2099)
  year: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month: number;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  close: boolean;
}

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting')
export class AccountingController {
  constructor(private svc: AccountingService) {}

  @Get('trial-balance')
  trialBalance(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.getTrialBalance(user.orgId, { from: from || undefined, to: to || undefined });
  }

  @Get('ledger/:accountId')
  ledger(
    @Param('accountId', ParseIntPipe) accountId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.getLedger(user.orgId, accountId, { from: from || undefined, to: to || undefined });
  }

  @Get('periods')
  getPeriods(@CurrentUser() user: JwtPayload) {
    return this.svc.getPeriods(user.orgId);
  }

  @Post('periods/toggle')
  @Roles(Role.admin, Role.super_admin)
  togglePeriod(@Body() dto: TogglePeriodDto, @CurrentUser() user: JwtPayload) {
    return this.svc.togglePeriod(user.orgId, dto.year, dto.month, dto.close, user.sub);
  }

  @Get('templates')
  getTemplates(@CurrentUser() user: JwtPayload) {
    return this.svc.getTemplates(user.orgId);
  }

  @Post('templates/seed')
  @Roles(Role.admin, Role.super_admin)
  seedTemplates(@CurrentUser() user: JwtPayload) {
    return this.svc.seedTemplates(user.orgId);
  }
}
