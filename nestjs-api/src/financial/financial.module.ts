import { Module } from '@nestjs/common';
import { FinancialController } from './financial.controller';
import { FinancialSummaryService } from './financial.service';

@Module({
  controllers: [FinancialController],
  providers:   [FinancialSummaryService],
  exports:     [FinancialSummaryService],
})
export class FinancialModule {}
