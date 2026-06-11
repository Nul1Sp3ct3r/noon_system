import { IsArray, IsInt, ArrayNotEmpty } from 'class-validator';

export class AddProductsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  productIds: number[];
}
