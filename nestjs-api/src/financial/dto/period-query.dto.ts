import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class PeriodQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'year', 'month', 'custom'], description: 'نوع الفترة الزمنية' })
  @IsIn(['all', 'year', 'month', 'custom'])
  @IsOptional()
  periodType?: 'all' | 'year' | 'month' | 'custom';

  @ApiPropertyOptional({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional({ example: 6, description: 'رقم الشهر 1–12' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  month?: number;

  @ApiPropertyOptional({ example: '2026-04-01', description: 'بداية الفترة المخصصة (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'استخدم تنسيق YYYY-MM-DD' })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-04-30', description: 'نهاية الفترة المخصصة (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'استخدم تنسيق YYYY-MM-DD' })
  @IsOptional()
  to?: string;
}
