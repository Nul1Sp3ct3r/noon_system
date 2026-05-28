import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports:     [AccountsModule],
  controllers: [AccountingController],
  providers:   [AccountingService],
  exports:     [AccountingService],
})
export class AccountingModule {}
