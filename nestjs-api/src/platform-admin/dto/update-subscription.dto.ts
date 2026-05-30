import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { BillingCycle, SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateSubscriptionDto {
  @IsOptional() @IsEnum(SubscriptionStatus) status?: SubscriptionStatus;
  @IsOptional() @IsEnum(BillingCycle)       billingCycle?: BillingCycle;
  @IsOptional() @IsDateString()             endDate?: string;
  @IsOptional() @IsBoolean()               autoRenew?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() planId?: number;
  @IsOptional() @IsString()                notes?: string;
}
