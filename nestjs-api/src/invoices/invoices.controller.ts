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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateInvoiceItemDto } from './dto/create-invoice-item.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private invoices: InvoicesService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'KPI summary — total purchases, recoverable VAT, month expenses, count' })
  kpis(@CurrentUser() user: JwtPayload) {
    return this.invoices.kpis(user.orgId);
  }

  @Get()
  @ApiOperation({ summary: 'List invoices with pagination and filters' })
  findAll(@Query() query: ListInvoicesDto, @CurrentUser() user: JwtPayload) {
    return this.invoices.findAll(user.orgId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice with line items' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.invoices.findOne(id, user.orgId);
  }

  @Post()
  @Roles(
    Role.admin, Role.super_admin, Role.platform_admin,
    Role.merchant_owner, Role.merchant_accountant,
  )
  @ApiOperation({ summary: 'Create purchase (optionally with items)' })
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: JwtPayload) {
    return this.invoices.create(dto, user.orgId, user.sub);
  }

  @Patch(':id')
  @Roles(
    Role.admin, Role.super_admin, Role.platform_admin,
    Role.merchant_owner, Role.merchant_accountant,
  )
  @ApiOperation({ summary: 'Update purchase header fields' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invoices.update(id, dto, user.orgId, user.sub);
  }

  @Post(':id/void')
  @Roles(
    Role.admin, Role.super_admin, Role.platform_admin,
    Role.merchant_owner, Role.merchant_accountant,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Void a purchase (also voids related inventory movements)' })
  void(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invoices.void(id, dto, user.orgId, user.sub);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.super_admin, Role.merchant_owner)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hard-delete purchase and its movements' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.invoices.remove(id, user.orgId, user.sub);
  }

  @Post(':id/items')
  @Roles(
    Role.admin, Role.super_admin, Role.platform_admin,
    Role.merchant_owner, Role.merchant_accountant,
  )
  @ApiOperation({ summary: 'Add a line item to a purchase' })
  addItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateInvoiceItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invoices.addItem(id, dto, user.orgId, user.sub);
  }

  @Delete(':id/items/:itemId')
  @Roles(
    Role.admin, Role.super_admin, Role.platform_admin,
    Role.merchant_owner, Role.merchant_accountant,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a line item from a purchase' })
  removeItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invoices.removeItem(id, itemId, user.orgId, user.sub);
  }

  @Post(':id/upload-pdf')
  @Roles(
    Role.admin, Role.super_admin, Role.platform_admin,
    Role.merchant_owner, Role.merchant_accountant,
  )
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a PDF attachment to a purchase' })
  uploadPdf(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invoices.uploadPdf(id, user.orgId, file);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download the PDF attachment for an invoice' })
  async getPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const inv = await this.invoices.getPdf(id, user.orgId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${inv.pdfFilename ?? 'invoice.pdf'}"`);
    res.send(inv.pdfData);
  }

  @Delete(':id/pdf')
  @Roles(
    Role.admin, Role.super_admin, Role.platform_admin,
    Role.merchant_owner, Role.merchant_accountant,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove the PDF attachment from a purchase' })
  deletePdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invoices.deletePdf(id, user.orgId);
  }
}
