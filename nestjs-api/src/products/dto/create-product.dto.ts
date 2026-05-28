import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDecimal,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Z123456789' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sku: string;

  @ApiPropertyOptional({ example: 'MY-SKU-001' })
  @IsString()
  @IsOptional()
  @MaxLength(128)
  partnerSku?: string;

  @ApiPropertyOptional({ example: '6281234567890' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  barcode?: string;

  @ApiPropertyOptional({ example: 'منتج نموذجي' })
  @IsString()
  @IsOptional()
  @MaxLength(512)
  nameAr?: string;

  @ApiPropertyOptional({ example: 'Sample Product' })
  @IsString()
  @IsOptional()
  @MaxLength(512)
  nameEn?: string;

  @ApiPropertyOptional({ example: 'Samsung' })
  @IsString()
  @IsOptional()
  @MaxLength(128)
  brand?: string;

  @ApiPropertyOptional({ example: 'Electronics' })
  @IsString()
  @IsOptional()
  @MaxLength(128)
  family?: string;

  @ApiPropertyOptional({ example: '99.99' })
  @IsDecimal({ decimal_digits: '0,4' })
  @IsOptional()
  unitCost?: string;

  @ApiPropertyOptional({ example: '5.00', description: 'Additional per-unit costs (packaging, delivery, etc.)' })
  @IsDecimal({ decimal_digits: '0,4' })
  @IsOptional()
  extraCosts?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  costIncludesVat?: boolean;

  @ApiPropertyOptional({ example: 'ملاحظات خاصة بهذا المنتج' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}
