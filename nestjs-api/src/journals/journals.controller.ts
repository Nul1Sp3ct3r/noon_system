import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseIntPipe, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { JournalsService } from './journals.service';
import { CreateJournalDto } from './dto/create-journal.dto';
import { ListJournalsDto } from './dto/list-journals.dto';

@ApiTags('journals')
@ApiBearerAuth()
@Controller('journals')
export class JournalsController {
  constructor(private journals: JournalsService) {}

  @Get()
  @ApiOperation({ summary: 'List journal entries' })
  findAll(@Query() query: ListJournalsDto, @CurrentUser() user: JwtPayload) {
    return this.journals.findAll(user.orgId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Journal KPI stats' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.journals.getStats(user.orgId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.journals.findOne(id, user.orgId);
  }

  @Post()
  @Roles(Role.admin, Role.super_admin)
  create(@Body() dto: CreateJournalDto, @CurrentUser() user: JwtPayload) {
    return this.journals.create(dto, user.orgId, user.sub);
  }

  @Post(':id/post')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Post a draft journal entry' })
  post(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.journals.post(id, user.orgId);
  }

  @Post(':id/reverse')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Reverse a posted journal entry' })
  reverse(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.journals.reverse(id, user.orgId, user.sub);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.super_admin)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.journals.remove(id, user.orgId);
  }
}
