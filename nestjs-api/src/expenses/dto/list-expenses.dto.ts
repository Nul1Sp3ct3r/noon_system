import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListExpensesDto {
  @IsDateString() @IsOptional() from?: string;
  @IsDateString() @IsOptional() to?: string;

  @IsString() @IsOptional()
  q?: string;         // combined search: vendor + description + referenceNumber

  @IsString() @IsOptional()
  vendor?: string;

  @IsInt() @IsOptional() @Type(() => Number)
  categoryId?: number;

  @IsString() @IsOptional()
  paymentMethod?: string;

  @IsString() @IsOptional()
  status?: string;

  @IsNumber() @Min(0) @Type(() => Number) @IsOptional()
  amountMin?: number;

  @IsNumber() @Min(0) @Type(() => Number) @IsOptional()
  amountMax?: number;

  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  page?: number = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(200) @IsOptional()
  limit?: number = 50;
}
