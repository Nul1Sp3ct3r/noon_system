import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListExpensesDto {
  @IsDateString() @IsOptional()
  from?: string;

  @IsDateString() @IsOptional()
  to?: string;

  @IsString() @IsOptional()
  q?: string;

  @IsString() @IsOptional()
  vendor?: string;

  @IsInt() @IsOptional() @Type(() => Number)
  categoryId?: number;

  @IsString() @IsOptional()
  paymentMethod?: string;

  @IsString() @IsOptional()
  status?: string;

  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  page?: number = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(200) @IsOptional()
  limit?: number = 50;
}
