import {
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
  @Roles(Role.admin, Role.super_admin)
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
    const ALLOWED = ['weekly_noon', 'full_inventory', 'monthly_statement', 'orders'];
    if (importType && !ALLOWED.includes(importType)) {
      throw new BadRequestException(`importType غير مدعوم: ${importType}. القيم المسموحة: ${ALLOWED.join(', ')}`);
    }
    return this.imports.processUpload(file, user.orgId, user.sub, importType);
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

  @Delete('batches/:batchId')
  @Roles(Role.admin, Role.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an import batch and all linked orders, movements, and fees' })
  deleteBatch(@Param('batchId') batchId: string, @CurrentUser() user: JwtPayload) {
    return this.imports.deleteBatch(batchId, user.orgId, user.sub);
  }
}
