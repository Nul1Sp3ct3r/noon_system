import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { ListOrdersDto } from './dto/list-orders.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders with pagination and filters' })
  findAll(@Query() query: ListOrdersDto, @CurrentUser() user: JwtPayload) {
    return this.orders.findAll(user.orgId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by id (404 if wrong organization)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.orders.findOne(id, user.orgId);
  }
}
