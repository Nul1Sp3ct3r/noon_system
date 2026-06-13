import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { VatMode } from '@prisma/client';

export class UpdateInvoiceDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(256)
  supplierName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(128)
  invoiceNumber?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  invoiceDate?: string;

  @ApiPropertyOptional({ enum: VatMode })
  @IsEnum(VatMode)
  @IsOptional()
  vatMode?: VatMode;

  @ApiPropertyOptional({ example: 'goods_purchase' })
  @IsString()
  @IsOptional()
  expenseType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  warehouseId?: number;
}
