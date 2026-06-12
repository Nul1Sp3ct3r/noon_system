import { Module } from '@nestjs/common';
import { VatCenterController } from './vat-center.controller';
import { VatCenterService } from './vat-center.service';
import { FinancialModule } from '../financial/financial.module';

@Module({
  imports:     [FinancialModule],
  controllers: [VatCenterController],
  providers:   [VatCenterService],
  exports:     [VatCenterService],
})
export class VatCenterModule {}
