import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
