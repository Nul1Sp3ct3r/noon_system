import { Module } from '@nestjs/common';
import { ProductFamiliesController } from './product-families.controller';
import { ProductFamiliesService } from './product-families.service';

@Module({
  controllers: [ProductFamiliesController],
  providers: [ProductFamiliesService],
  exports: [ProductFamiliesService],
})
export class ProductFamiliesModule {}
