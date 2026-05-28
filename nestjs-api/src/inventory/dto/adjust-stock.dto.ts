import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  warehouseId?: number;

  @Type(() => Number)
  @IsInt()
  newQty: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
