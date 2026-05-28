import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AccountType, NormalBalance } from '@prisma/client';

export class CreateAccountDto {
  @IsString() @IsNotEmpty()
  code: string;

  @IsString() @IsNotEmpty()
  nameAr: string;

  @IsString() @IsOptional()
  nameEn?: string;

  @IsEnum(AccountType)
  accountType: AccountType;

  @IsEnum(NormalBalance)
  normalBalance: NormalBalance;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  parentId?: number;

  @IsString() @IsOptional()
  description?: string;
}
