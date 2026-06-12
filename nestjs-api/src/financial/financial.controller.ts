import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { FinancialSummaryService } from './financial.service';
import { PeriodQueryDto } from './dto/period-query.dto';
import { resolveFinancialPeriod, periodBounds } from '../common/period.helper';

@ApiTags('financial')
@ApiBearerAuth()
@Controller('financial')
export class FinancialController {
  constructor(private financial: FinancialSummaryService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Unified financial summary — single source of truth for all pages' })
  getSummary(@Query() query: PeriodQueryDto, @CurrentUser() user: JwtPayload) {
    const period = resolveFinancialPeriod(query);
    return this.financial.getSummary(user.orgId, { period });
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Month-by-month financial breakdown for P&L and VAT center' })
  getMonthlySummaries(@Query() query: PeriodQueryDto, @CurrentUser() user: JwtPayload) {
    const period        = resolveFinancialPeriod(query);
    const { from, to }  = periodBounds(period);
    return this.financial.getMonthlySummaries(user.orgId, from, to);
  }

  @Get('reconcile')
  @ApiOperation({ summary: 'Validate yearly vs monthly consistency. Accepts year param.' })
  reconcile(@Query() query: PeriodQueryDto, @CurrentUser() user: JwtPayload) {
    return this.financial.reconcile(user.orgId, query.year);
  }

  @Get('debug')
  @ApiOperation({ summary: 'Debug: compare canonical getSummary vs getMonthlySummaries sum' })
  debugCompare(@Query() query: PeriodQueryDto, @CurrentUser() user: JwtPayload) {
    return this.financial.debugCompare(user.orgId, query.year);
  }
}
