import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ImportsService } from './imports.service';

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private imports: ImportsService) {}

  @Post('upload')
  @Roles(
    // Platform-level admins
    Role.super_admin, Role.platform_admin, Role.admin,
    // Merchant roles that can import data for their own org
    Role.merchant_owner, Role.merchant_accountant,
    Role.merchant_inventory, Role.merchant_data_entry,
    // merchant_viewer is intentionally excluded — read-only role
  )
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload and process a Noon CSV file. Pass ?importType=weekly_noon|full_inventory|monthly_statement to override auto-detection.' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('importType') importType: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const ALLOWED = ['weekly_noon', 'full_inventory', 'monthly_statement', 'orders', 'transaction_view'];
    if (importType && !ALLOWED.includes(importType)) {
      throw new BadRequestException(`importType غير مدعوم: ${importType}. القيم المسموحة: ${ALLOWED.join(', ')}`);
    }
    return this.imports.processUpload(file, user.orgId, user.sub, importType);
  }

  @Post('price-update/preview')
  @Roles(
    Role.super_admin, Role.platform_admin, Role.admin,
    Role.merchant_owner, Role.merchant_accountant,
  )
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Preview product cost updates from CSV — no DB changes' })
  priceUpdatePreview(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.imports.previewPriceUpdate(file, user.orgId);
  }

  @Post('price-update/apply')
  @Roles(
    Role.super_admin, Role.platform_admin, Role.admin,
    Role.merchant_owner, Role.merchant_accountant,
  )
  @ApiOperation({ summary: 'Apply previewed product cost updates and store history' })
  priceUpdateApply(
    @Body() body: {
      rows: { productId: number | null; sku: string; partnerSku?: string | null; newCost: number }[];
      costIncludesVat:    boolean;
      fileName?:          string;
      autoCreateMissing?: boolean;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.imports.applyPriceUpdate(user.orgId, user.sub, body);
  }

  @Get('price-update/batches/:batchId')
  @ApiOperation({ summary: 'Get row-level history for a product cost update batch' })
  getPriceUpdateBatch(
    @Param('batchId') batchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.imports.getPriceUpdateBatch(batchId, user.orgId);
  }

  @Get('batches')
  @ApiOperation({ summary: 'List import batches with pagination' })
  listBatches(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.imports.listBatches(
      user.orgId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('batches/:batchId/reconciliation')
  @ApiOperation({ summary: 'Reconciliation report for a single import batch — Noon values vs PreciseFlow calculation' })
  getReconciliation(@Param('batchId') batchId: string, @CurrentUser() user: JwtPayload) {
    return this.imports.getReconciliation(batchId, user.orgId);
  }

  @Get('batches/:batchId/statements')
  @ApiOperation({ summary: 'Per-statement summaries for a Transaction View import batch' })
  getStatementSummaries(@Param('batchId') batchId: string, @CurrentUser() user: JwtPayload) {
    return this.imports.getStatementSummaries(batchId, user.orgId);
  }

  @Delete('batches/:batchId')
  @Roles(
    Role.super_admin, Role.platform_admin, Role.admin,
    Role.merchant_owner,
    // Accountant/inventory/data-entry roles cannot delete batches (destructive)
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an import batch and all linked orders, movements, and fees' })
  deleteBatch(@Param('batchId') batchId: string, @CurrentUser() user: JwtPayload) {
    return this.imports.deleteBatch(batchId, user.orgId, user.sub);
  }
}
