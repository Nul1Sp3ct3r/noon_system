import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateFamilyDto } from './create-family.dto';

export class UpdateFamilyDto extends PartialType(CreateFamilyDto) {
  @IsOptional()
  @IsBoolean()
  updateProductCosts?: boolean;
}
