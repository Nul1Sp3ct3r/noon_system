import {
  IsDateString, IsEnum, IsInt, IsNumber, IsOptional,
  IsString, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class UpdateExpenseDto {
  @IsDateString() @IsOptional()
  expenseDate?: string;

  @IsString() @IsOptional() @MaxLength(256)
  vendor?: string;

  @IsInt() @IsOptional() @Type(() => Number)
  categoryId?: number;

  @IsString() @IsOptional() @MaxLength(1000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Type(() => Number) @IsOptional()
  amountBeforeVat?: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Type(() => Number) @IsOptional()
  vatAmount?: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Type(() => Number) @IsOptional()
  totalAmount?: number;

  @IsEnum(PaymentMethod) @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsString() @IsOptional() @MaxLength(128)
  referenceNumber?: string;

  @IsString() @IsOptional()
  notes?: string;
}
