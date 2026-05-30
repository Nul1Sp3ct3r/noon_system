import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MerchantStatus } from '@prisma/client';

export class CreateMerchantDto {
  @IsString()
  @MaxLength(200)
  businessName: string;

  @IsOptional() @IsString() @MaxLength(100) ownerName?: string;
  @IsOptional() @IsEmail()                  email?: string;
  @IsOptional() @IsString() @MaxLength(20)  phone?: string;
  @IsOptional() @IsString() @MaxLength(20)  crNumber?: string;
  @IsOptional() @IsString() @MaxLength(20)  vatNumber?: string;
  @IsOptional() @IsEnum(MerchantStatus)     status?: MerchantStatus;
  @IsOptional() @IsString()                 notes?: string;
}
