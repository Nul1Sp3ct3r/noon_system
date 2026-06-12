import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { VatCenterService } from './vat-center.service';
import { PeriodQueryDto } from '../financial/dto/period-query.dto';
import { resolveFinancialPeriod, periodBounds } from '../common/period.helper';

@ApiTags('vat-center')
@ApiBearerAuth()
@Controller('vat-center')
export class VatCenterController {
  constructor(private vatCenter: VatCenterService) {}

  @Get()
  @ApiOperation({ summary: 'Monthly VAT breakdown — supports periodType/year/month/from/to' })
  getVatBreakdown(@Query() query: PeriodQueryDto, @CurrentUser() user: JwtPayload) {
    const period        = resolveFinancialPeriod(query);
    const { from, to }  = periodBounds(period);
    return this.vatCenter.getVatBreakdown(user.orgId, from, to);
  }
}
