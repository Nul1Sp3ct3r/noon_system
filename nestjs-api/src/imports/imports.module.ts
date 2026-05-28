import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AccountingModule } from '../accounting/accounting.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [AuditLogsModule, AccountingModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
