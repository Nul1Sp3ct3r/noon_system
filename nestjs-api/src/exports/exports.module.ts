import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ReportsModule } from '../reports/reports.module';
import { VatCenterModule } from '../vat-center/vat-center.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { ProfitabilityModule } from '../profitability/profitability.module';

@Module({
  imports: [ReportsModule, VatCenterModule, SettlementsModule, ProfitabilityModule],
  controllers: [ExportsController],
})
export class ExportsModule {}
