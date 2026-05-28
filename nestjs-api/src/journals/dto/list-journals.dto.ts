import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListJournalsDto {
  @IsOptional() @IsString()         from?: string;
  @IsOptional() @IsString()         to?: string;
  @IsOptional() @IsString()         q?: string;
  @IsOptional() @IsEnum(['draft', 'posted', 'reversed']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)     accountId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)     page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)     limit?: number;
}
