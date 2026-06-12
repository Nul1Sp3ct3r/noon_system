import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { StatementsService, StatementsFilter } from './statements.service';
import { PeriodQueryDto } from '../financial/dto/period-query.dto';
import { resolveFinancialPeriod, periodBounds } from '../common/period.helper';

@ApiTags('statements')
@ApiBearerAuth()
@Controller('statements')
export class StatementsController {
  constructor(private statements: StatementsService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'KPI dashboard cards — supports periodType/year/month/from/to' })
  getKpis(@Query() query: PeriodQueryDto, @CurrentUser() user: JwtPayload) {
    const period        = resolveFinancialPeriod(query);
    const { from, to }  = periodBounds(period);
    return this.statements.getKpis(user.orgId, from, to);
  }

  @Get()
  @ApiOperation({ summary: 'List all Noon statement summaries with COGS and profit' })
  listStatements(
    @CurrentUser() user: JwtPayload,
    @Query() periodQuery: PeriodQueryDto,
    @Query('status') status?: string,
    @Query('search')  search?: string,
  ) {
    const period = resolveFinancialPeriod(periodQuery);
    let startDate: string | undefined;
    let endDate:   string | undefined;
    if (period.from !== null) {
      const { from, to } = periodBounds(period);
      startDate = from.toISOString().slice(0, 10);
      endDate   = new Date(to.getTime() - 1).toISOString().slice(0, 10);
    }
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
