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
import { StockQueryDto } from './dto/stock-query.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

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
  @ApiOperation({ summary: 'List inventory movements with running qty totals, unit cost, cost impact' })
  findAllMovements(@Query() query: ListMovementsDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.findAllMovements(user.orgId, query);
  }

  @Post('movements')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Record a manual inventory movement' })
  createMovement(@Body() dto: CreateMovementDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.createMovement(dto, user.orgId, user.sub);
  }

  // ─── Stock (legacy simple) ────────────────────────────────────────────────────

  @Get('stock')
  @ApiOperation({ summary: 'Simple stock levels per SKU (sum of non-voided movements)' })
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

  // ─── Enriched stock ───────────────────────────────────────────────────────────

  @Get('stock-enriched')
  @ApiOperation({ summary: 'Enriched stock: costs, margins, movement dates, status, paginated' })
  getStockEnriched(@Query() query: StockQueryDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.getStockEnriched(user.orgId, query);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Inventory KPIs and financial alerts' })
  getInventoryDashboard(@CurrentUser() user: JwtPayload) {
    return this.inventory.getInventoryDashboard(user.orgId);
  }

  @Post('adjust')
  @Roles(Role.admin, Role.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Adjust physical stock count — creates adjustment movement' })
  adjustStock(@Body() dto: AdjustStockDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.adjustStock(dto, user.orgId, user.sub);
  }
}
