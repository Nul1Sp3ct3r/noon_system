import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ReportYearDto {
  @ApiPropertyOptional({ example: 2024 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2099)
  @IsOptional()
  year?: number;
}

export class SalesReportDto extends ReportYearDto {
  @ApiPropertyOptional({ example: 'Samsung' })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({ example: 'profit', enum: ['profit', 'revenue', 'units'] })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'Delivered' })
  @IsString()
  @IsOptional()
  status?: string;
}

export class FeesReportDto extends ReportYearDto {
  @ApiPropertyOptional({ example: 'Samsung' })
  @IsString()
  @IsOptional()
  brand?: string;
}

export class DateRangeDto {
  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsString()
  @IsOptional()
  endDate?: string;
}
