import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateMerchantUserDto {
  @IsOptional() @IsEnum(Role)              role?: Role;
  @IsOptional() @IsBoolean()               isActive?: boolean;
  @IsOptional() @IsString() @MinLength(8)  newPassword?: string;
}
