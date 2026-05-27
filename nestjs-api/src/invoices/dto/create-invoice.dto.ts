import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { VatMode } from '@prisma/client';
import { CreateInvoiceItemDto } from './create-invoice-item.dto';

export class CreateInvoiceDto {
  @ApiPropertyOptional({ example: 'Acme Supplies' })
  @IsString()
  @IsOptional()
  @MaxLength(256)
  supplierName?: string;

  @ApiPropertyOptional({ example: 'INV-2026-001' })
  @IsString()
  @IsOptional()
  @MaxLength(128)
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  invoiceDate?: string;

  @ApiPropertyOptional({ enum: VatMode, default: VatMode.inclusive })
  @IsEnum(VatMode)
  @IsOptional()
  vatMode?: VatMode;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  warehouseId?: number;

  @ApiPropertyOptional({ type: [CreateInvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  @IsOptional()
  items?: CreateInvoiceItemDto[];
}
