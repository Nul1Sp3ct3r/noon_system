import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDecimal, IsInt, IsOptional, IsString, IsNotEmpty, MaxLength, Min } from 'class-validator';

export class CreateInvoiceItemDto {
  @ApiProperty({ example: 'Z123456789' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sku: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  productId?: number;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: '99.9900' })
  @IsDecimal({ decimal_digits: '0,4' })
  unitPrice: string;

  @ApiPropertyOptional({ default: '0.1500', description: 'VAT rate as decimal, e.g. 0.15 for 15%' })
  @IsDecimal({ decimal_digits: '0,4' })
  @IsOptional()
  vatRate?: string;
}
