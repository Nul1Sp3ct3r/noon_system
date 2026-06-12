import { IsOptional, IsInt, Min, Max, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FinancialQueryDto {
  @ApiPropertyOptional({ description: 'Filter by year (e.g. 2026)', example: 2026 })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Filter by month YYYY-MM', example: '2026-05' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({ description: 'Start date inclusive YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date inclusive YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
