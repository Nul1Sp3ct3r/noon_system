import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  name: string;

  @IsString() @IsOptional() @MaxLength(16)
  accountCode?: string;
}
