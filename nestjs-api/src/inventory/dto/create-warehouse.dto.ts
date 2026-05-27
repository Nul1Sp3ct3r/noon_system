import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Riyadh Main' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional({ example: 'RUH-01' })
  @IsString()
  @IsOptional()
  @MaxLength(32)
  code?: string;
}
