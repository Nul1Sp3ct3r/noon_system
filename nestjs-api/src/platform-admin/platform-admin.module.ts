import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { SubscriptionAccessService } from './subscription-access.service';

@Module({
  controllers: [PlatformAdminController],
  providers:   [PlatformAdminService, SubscriptionAccessService],
  exports:     [SubscriptionAccessService],
})
export class PlatformAdminModule {}
