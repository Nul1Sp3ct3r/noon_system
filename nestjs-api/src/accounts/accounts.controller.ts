import {
  Body, Controller, Get, Param, ParseIntPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts')
export class AccountsController {
  constructor(private accounts: AccountsService) {}

  @Get()
  findAll(
    @Query('q') q: string,
    @Query('type') type: string,
    @Query('activeOnly') activeOnly: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.accounts.findAll(user.orgId, {
      q:          q || undefined,
      type:       type || undefined,
      activeOnly: activeOnly === 'true',
    });
  }

  @Post('seed-defaults')
  @Roles(Role.admin, Role.super_admin)
  seedDefaults(@CurrentUser() user: JwtPayload) {
    return this.accounts.seedDefaults(user.orgId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.accounts.findOne(id, user.orgId);
  }

  @Post()
  @Roles(Role.admin, Role.super_admin)
  create(@Body() dto: CreateAccountDto, @CurrentUser() user: JwtPayload) {
    return this.accounts.create(dto, user.orgId);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.super_admin)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.accounts.update(id, dto, user.orgId);
  }
}
