import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFamilyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  baseCost?: number;

  @IsOptional()
  @IsBoolean()
  costIncludesVat?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  productIds?: number[];
}
