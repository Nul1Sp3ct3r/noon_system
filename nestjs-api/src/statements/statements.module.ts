import { Module } from '@nestjs/common';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';
import { FinancialModule } from '../financial/financial.module';

@Module({
  imports:     [FinancialModule],
  controllers: [StatementsController],
  providers:   [StatementsService],
  exports:     [StatementsService],
})
export class StatementsModule {}
