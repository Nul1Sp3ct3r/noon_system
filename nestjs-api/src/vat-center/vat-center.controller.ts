import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { VatCenterService } from './vat-center.service';
import { VatQueryDto } from './dto/vat-query.dto';

@ApiTags('vat-center')
@ApiBearerAuth()
@Controller('vat-center')
export class VatCenterController {
  constructor(private vatCenter: VatCenterService) {}

  @Get()
  @ApiOperation({ summary: 'Monthly VAT breakdown: output, noon input, supplier input, net' })
  getVatBreakdown(@Query() query: VatQueryDto, @CurrentUser() user: JwtPayload) {
    return this.vatCenter.getVatBreakdown(user.orgId, query);
  }
}
