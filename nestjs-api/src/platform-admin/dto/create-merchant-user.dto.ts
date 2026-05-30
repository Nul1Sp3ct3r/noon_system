import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export const MERCHANT_ROLES = [
  Role.merchant_owner,
  Role.merchant_accountant,
  Role.merchant_inventory,
  Role.merchant_data_entry,
  Role.merchant_viewer,
] as const;

export class CreateMerchantUserDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional() @IsString()  fullName?: string;
  @IsOptional() @IsEmail()   email?: string;
  @IsOptional() @IsString()  phone?: string;

  @IsEnum(Role)
  role: Role;
}
