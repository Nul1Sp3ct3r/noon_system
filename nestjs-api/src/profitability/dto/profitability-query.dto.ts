import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class ProfitabilityQueryDto {
  // ── Period params (preferred) ──────────────────────────────────────────────
  @ApiPropertyOptional({ enum: ['all', 'year', 'month', 'custom'] })
  @IsIn(['all', 'year', 'month', 'custom'])
  @IsOptional()
  periodType?: string;

  @ApiPropertyOptional({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional({ example: 6 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  month?: number;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  to?: string;

  // ── Legacy date range (still accepted) ─────────────────────────────────────
  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsString()
  @IsOptional()
  endDate?: string;

  // ── Filters ────────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Samsung' })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({ example: 'ABC-123' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: 'profitable', enum: ['profitable', 'low_margin', 'loss', 'missing_cost'] })
  @IsString()
  @IsOptional()
  badge?: string;
}
