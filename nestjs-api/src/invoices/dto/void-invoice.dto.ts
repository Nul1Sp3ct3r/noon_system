import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoidInvoiceDto {
  @ApiProperty({ example: 'Duplicate entry' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  reason: string;
}
