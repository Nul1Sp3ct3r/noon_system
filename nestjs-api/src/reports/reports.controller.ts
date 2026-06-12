import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { SalesReportDto, FeesReportDto, ReportRangeDto } from './dto/report-query.dto';
import { PeriodQueryDto } from '../financial/dto/period-query.dto';
import { resolveFinancialPeriod, periodBounds } from '../common/period.helper';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('pl')
  @ApiOperation({ summary: 'Monthly P&L report — supports periodType/year/month/from/to' })
  getPl(@Query() query: PeriodQueryDto, @CurrentUser() user: JwtPayload) {
    const period        = resolveFinancialPeriod(query);
    const { from, to }  = periodBounds(period);
    return this.reports.getPl(user.orgId, from, to);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Per-SKU sales report' })
  getSales(@Query() query: SalesReportDto, @CurrentUser() user: JwtPayload) {
    return this.reports.getSales(user.orgId, query);
  }

  @Get('fees')
  @ApiOperation({ summary: 'Per-SKU fee breakdown report' })
  getFees(@Query() query: FeesReportDto, @CurrentUser() user: JwtPayload) {
    return this.reports.getFees(user.orgId, query);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Inventory stock report' })
  getInventory(@CurrentUser() user: JwtPayload) {
    return this.reports.getInventory(user.orgId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Invoices report with totals' })
  getInvoicesReport(@Query() query: ReportRangeDto, @CurrentUser() user: JwtPayload) {
    return this.reports.getInvoicesReport(user.orgId, query);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard summary + chart data — supports periodType/year/month/from/to' })
  getDashboard(@Query() query: PeriodQueryDto, @CurrentUser() user: JwtPayload) {
    const period        = resolveFinancialPeriod(query);
    const { from, to }  = periodBounds(period);
    return this.reports.getDashboardData(user.orgId, from, to, period.label);
  }
}
