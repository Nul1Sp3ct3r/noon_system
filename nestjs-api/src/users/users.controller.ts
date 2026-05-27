import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List organization users' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.users.findAll(user.orgId);
  }

  @Get(':id')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Get user by id' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.users.findOne(id, user.orgId);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Update user role or full name' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.users.update(id, dto, actor.sub, actor.orgId);
  }

  @Post(':id/activate')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Approve / activate a user' })
  activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: JwtPayload) {
    return this.users.activate(id, actor.sub, actor.orgId);
  }

  @Post(':id/deactivate')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Disable a user' })
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: JwtPayload) {
    return this.users.deactivate(id, actor.sub, actor.orgId);
  }
}
