import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseIntPipe, Patch, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ProductFamiliesService } from './product-families.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { AddProductsDto } from './dto/add-products.dto';

@ApiTags('product-families')
@ApiBearerAuth()
@Controller('product-families')
export class ProductFamiliesController {
  constructor(private readonly service: ProductFamiliesService) {}

  @Get()
  @ApiOperation({ summary: 'List product families with aggregated stats' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.orgId);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get grouping suggestions for similar products' })
  getSuggestions(@CurrentUser() user: JwtPayload) {
    return this.service.getSuggestions(user.orgId);
  }

  @Get('by-product/:productId')
  @ApiOperation({ summary: 'Get family membership for a specific product' })
  findByProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findByProduct(productId, user.orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product family detail with SKU breakdown' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.orgId);
  }

  @Post()
  @Roles(Role.admin, Role.super_admin, Role.merchant_owner, Role.merchant_accountant)
  @ApiOperation({ summary: 'Create product family' })
  create(@Body() dto: CreateFamilyDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.orgId);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.super_admin, Role.merchant_owner, Role.merchant_accountant)
  @ApiOperation({ summary: 'Update product family' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFamilyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user.orgId);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.super_admin, Role.merchant_owner)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product family' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.orgId);
  }

  @Post(':id/products')
  @Roles(Role.admin, Role.super_admin, Role.merchant_owner, Role.merchant_accountant)
  @ApiOperation({ summary: 'Add products to family' })
  addProducts(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddProductsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addProducts(id, dto, user.orgId);
  }

  @Delete(':id/products/:productId')
  @Roles(Role.admin, Role.super_admin, Role.merchant_owner, Role.merchant_accountant)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove product from family' })
  removeProduct(
    @Param('id', ParseIntPipe) id: number,
    @Param('productId', ParseIntPipe) productId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeProduct(id, productId, user.orgId);
  }
}
