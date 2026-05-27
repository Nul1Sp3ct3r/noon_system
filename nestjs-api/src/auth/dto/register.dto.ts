import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Acme Trading' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  organizationName: string;

  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, { message: 'username: lowercase letters, numbers, underscores only' })
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @ApiPropertyOptional({ example: 'Mohammed Al-Ahmad' })
  @IsString()
  @IsOptional()
  @MaxLength(128)
  fullName?: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
