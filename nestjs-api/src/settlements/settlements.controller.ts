import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { SettlementsService } from './settlements.service';
import { SettlementsQueryDto } from './dto/settlements-query.dto';

@ApiTags('settlements')
@ApiBearerAuth()
@Controller('settlements')
export class SettlementsController {
  constructor(private settlements: SettlementsService) {}

  @Get()
  @ApiOperation({ summary: 'Per-batch settlement reconciliation with mismatch detection' })
  getSettlements(@Query() query: SettlementsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.settlements.getSettlements(user.orgId, query);
  }
}
