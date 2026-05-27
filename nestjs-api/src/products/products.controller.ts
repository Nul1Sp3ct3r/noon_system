import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products with search and pagination' })
  findAll(@Query() query: ListProductsDto, @CurrentUser() user: JwtPayload) {
    return this.products.findAll(user.orgId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by id' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.products.findOne(id, user.orgId);
  }

  @Post()
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Create product' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: JwtPayload) {
    return this.products.create(dto, user.orgId, user.sub);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Update product' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.products.update(id, dto, user.orgId, user.sub);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.products.remove(id, user.orgId, user.sub);
  }
}
