import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { ReportRangeDto, SalesReportDto, FeesReportDto } from './dto/report-query.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('pl')
  @ApiOperation({ summary: 'Monthly P&L report' })
  getPl(@Query() query: ReportRangeDto, @CurrentUser() user: JwtPayload) {
    return this.reports.getPl(user.orgId, query);
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
  @ApiOperation({ summary: 'Dashboard summary + chart data' })
  getDashboard(@CurrentUser() user: JwtPayload) {
    return this.reports.getDashboardData(user.orgId);
  }
}
