import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AdminUpdateUserDto } from './dto/update-user.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.admin, Role.super_admin)
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('audit-logs')
  @ApiOperation({ summary: 'Query audit logs with filters and pagination' })
  getAuditLogs(@Query() query: AuditLogQueryDto, @CurrentUser() user: JwtPayload) {
    return this.admin.getAuditLogs(user.orgId, query);
  }

  @Get('backup')
  @Roles(Role.super_admin)
  @ApiOperation({ summary: 'Export full org backup as JSON (super_admin only)' })
  async exportBackup(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const data = await this.admin.exportBackup(user.orgId);
    const filename = `backup-org${user.orgId}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }

  @Get('users')
  @ApiOperation({ summary: 'List all users in the organization' })
  listUsers(@CurrentUser() user: JwtPayload) {
    return this.admin.listUsers(user.orgId);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user role, status, name, or password' })
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admin.updateUser(id, dto, user.orgId, user.sub);
  }

  @Get('performance')
  @ApiOperation({ summary: 'Organization record counts summary' })
  getPerformance(@CurrentUser() user: JwtPayload) {
    return this.admin.getPerformance(user.orgId);
  }
}
