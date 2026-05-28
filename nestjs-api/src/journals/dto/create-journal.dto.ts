import { Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber,
  IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export class CreateJournalLineDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  accountId?: number;

  @IsString() @IsOptional()
  accountAr?: string;

  @IsNumber() @Min(0)
  debit: number;

  @IsNumber() @Min(0)
  credit: number;

  @IsString() @IsOptional()
  notes?: string;
}

export class CreateJournalDto {
  @IsString() @IsNotEmpty()
  entryDate: string;

  @IsString() @IsOptional()
  description?: string;

  @IsString() @IsOptional()
  reference?: string;

  @IsEnum(['draft', 'posted']) @IsOptional()
  status?: 'draft' | 'posted';

  @IsString() @IsOptional()
  sourceType?: string;

  @IsString() @IsOptional()
  sourceId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  lines: CreateJournalLineDto[];
}
