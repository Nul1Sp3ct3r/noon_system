import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, MaxLength, Min,
} from 'class-validator';
import { MovementType } from '@prisma/client';

export class CreateMovementDto {
  @ApiProperty({ example: 'Z123456789' })
  @IsString() @IsNotEmpty() @MaxLength(128)
  sku: string;

  @ApiPropertyOptional()
  @Type(() => Number) @IsInt() @IsOptional()
  productId?: number;

  @ApiPropertyOptional()
  @Type(() => Number) @IsInt() @IsOptional()
  warehouseId?: number;

  @ApiProperty({ enum: MovementType })
  @IsEnum(MovementType)
  movementType: MovementType;

  @ApiProperty({ description: 'Positive = stock in, negative = stock out', example: 10 })
  @Type(() => Number) @IsInt() @IsNotEmpty()
  quantity: number;

  @ApiPropertyOptional({ example: 'PO-2026-001' })
  @IsString() @IsOptional() @MaxLength(256)
  reference?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  notes?: string;

  // ─── Enrichment fields ────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Reference document type for traceability',
    example: 'purchase_invoice',
  })
  @IsString() @IsOptional() @MaxLength(64)
  referenceType?: string;

  @ApiPropertyOptional({
    description: 'Reason code for the movement (accounting/audit purpose)',
    example: 'purchase',
  })
  @IsString() @IsOptional() @MaxLength(64)
  reasonCode?: string;

  @ApiPropertyOptional({
    description: 'Unit cost at time of movement — overrides product cost for valuation',
    example: 18.5,
  })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @IsOptional()
  unitCostOverride?: number;
}
