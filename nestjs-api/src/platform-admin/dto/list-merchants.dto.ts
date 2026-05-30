import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MerchantStatus } from '@prisma/client';

export class ListMerchantsDto {
  @IsOptional() @IsString()                       q?: string;
  @IsOptional() @IsEnum(MerchantStatus)           status?: MerchantStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)        page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 25;
}
