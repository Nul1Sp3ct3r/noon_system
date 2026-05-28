import { Module } from '@nestjs/common';
import { JournalsController } from './journals.controller';
import { JournalsService } from './journals.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports:     [AccountingModule],
  controllers: [JournalsController],
  providers:   [JournalsService],
})
export class JournalsModule {}
