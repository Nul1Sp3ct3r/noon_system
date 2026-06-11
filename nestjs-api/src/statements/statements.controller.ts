import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { StatementsService, StatementsFilter } from './statements.service';

@ApiTags('statements')
@ApiBearerAuth()
@Controller('statements')
export class StatementsController {
  constructor(private statements: StatementsService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'KPI dashboard cards for all statements' })
  getKpis(@CurrentUser() user: JwtPayload) {
    return this.statements.getKpis(user.orgId);
  }

  @Get()
  @ApiOperation({ summary: 'List all Noon statement summaries with COGS and profit' })
  listStatements(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?: string,
    @Query('status')    status?: string,
    @Query('search')    search?: string,
  ) {
    const filters: StatementsFilter = { startDate, endDate, status, search };
    return this.statements.listStatements(user.orgId, filters);
  }

  @Get(':referenceNr')
  @ApiOperation({ summary: 'Full detail for one PS-* statement' })
  getDetail(
    @Param('referenceNr') referenceNr: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.statements.getStatementDetail(user.orgId, referenceNr);
  }
}
