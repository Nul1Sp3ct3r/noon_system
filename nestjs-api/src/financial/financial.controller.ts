import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { FinancialSummaryService } from './financial.service';
import { FinancialQueryDto } from './dto/financial-query.dto';

@ApiTags('financial')
@ApiBearerAuth()
@Controller('financial')
export class FinancialController {
  constructor(private financial: FinancialSummaryService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Unified financial summary — single source of truth for all pages' })
  getSummary(@Query() query: FinancialQueryDto, @CurrentUser() user: JwtPayload) {
    return this.financial.getSummary(user.orgId, {
      year:      query.year,
      month:     query.month,
      startDate: query.startDate,
      endDate:   query.endDate,
    });
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Month-by-month financial breakdown for P&L and VAT center' })
  getMonthlySummaries(@Query() query: FinancialQueryDto, @CurrentUser() user: JwtPayload) {
    const year = query.year ?? new Date().getFullYear();
    return this.financial.getMonthlySummaries(user.orgId, year);
  }

  @Get('reconcile')
  @ApiOperation({
    summary: 'Validate financial consistency — compares yearly vs monthly totals and verifies accounting identities. Returns warnings for differences > 0.01 SAR.',
  })
  reconcile(@Query() query: FinancialQueryDto, @CurrentUser() user: JwtPayload) {
    return this.financial.reconcile(user.orgId, query.year);
  }
}
