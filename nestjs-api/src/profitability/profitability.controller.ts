import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ProfitabilityService } from './profitability.service';
import { ProfitabilityQueryDto } from './dto/profitability-query.dto';

@ApiTags('profitability')
@ApiBearerAuth()
@Controller('profitability')
export class ProfitabilityController {
  constructor(private profitability: ProfitabilityService) {}

  @Get()
  @ApiOperation({ summary: 'Per-SKU profitability with badge classification' })
  getProfitability(@Query() query: ProfitabilityQueryDto, @CurrentUser() user: JwtPayload) {
    return this.profitability.getProfitability(user.orgId, query);
  }
}
