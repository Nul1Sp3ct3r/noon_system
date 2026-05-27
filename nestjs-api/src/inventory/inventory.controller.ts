import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { ListMovementsDto } from './dto/list-movements.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  // ─── Warehouses ───────────────────────────────────────────────────────────────

  @Get('warehouses')
  @ApiOperation({ summary: 'List warehouses for the organization' })
  findAllWarehouses(@CurrentUser() user: JwtPayload) {
    return this.inventory.findAllWarehouses(user.orgId);
  }

  @Get('warehouses/:id')
  @ApiOperation({ summary: 'Get warehouse by id' })
  findOneWarehouse(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.inventory.findOneWarehouse(id, user.orgId);
  }

  @Post('warehouses')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Create warehouse' })
  createWarehouse(@Body() dto: CreateWarehouseDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.createWarehouse(dto, user.orgId, user.sub);
  }

  @Patch('warehouses/:id')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Update warehouse' })
  updateWarehouse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventory.updateWarehouse(id, dto, user.orgId, user.sub);
  }

  // ─── Movements ────────────────────────────────────────────────────────────────

  @Get('movements')
  @ApiOperation({ summary: 'List inventory movements with filters' })
  findAllMovements(@Query() query: ListMovementsDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.findAllMovements(user.orgId, query);
  }

  @Post('movements')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Record a manual inventory movement' })
  createMovement(@Body() dto: CreateMovementDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.createMovement(dto, user.orgId, user.sub);
  }

  // ─── Stock ────────────────────────────────────────────────────────────────────

  @Get('stock')
  @ApiOperation({ summary: 'Get current stock levels per SKU (sum of non-voided movements)' })
  @ApiQuery({ name: 'warehouseId', required: false, type: Number })
  getStockLevels(
    @Query('warehouseId') warehouseId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventory.getStockLevels(
      user.orgId,
      warehouseId ? parseInt(warehouseId, 10) : undefined,
    );
  }
}
