import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class VatQueryDto {
  @ApiPropertyOptional({ example: 2024 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2099)
  @IsOptional()
  year?: number;
}
