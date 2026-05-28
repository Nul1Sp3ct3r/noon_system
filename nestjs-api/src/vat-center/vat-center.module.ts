import { Module } from '@nestjs/common';
import { VatCenterController } from './vat-center.controller';
import { VatCenterService } from './vat-center.service';

@Module({
  controllers: [VatCenterController],
  providers: [VatCenterService],
  exports: [VatCenterService],
})
export class VatCenterModule {}
