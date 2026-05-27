import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { PrismaModule } from './prisma/prisma.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { InvoicesModule } from './invoices/invoices.module';
import { InventoryModule } from './inventory/inventory.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL:           Joi.string().required(),
        JWT_SECRET:             Joi.string().min(32).required(),
        JWT_EXPIRES_IN:         Joi.string().default('15m'),
        JWT_REFRESH_SECRET:     Joi.string().min(32).required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
        PORT:                   Joi.number().default(3000),
        NODE_ENV:               Joi.string().valid('development', 'production', 'test').default('development'),
        CORS_ORIGINS:           Joi.string().default(''),
      }),
    }),
    ThrottlerModule.forRoot([
      { name: 'global', ttl: 60_000, limit: 300 },
      { name: 'auth',   ttl: 60_000, limit: 20 },
    ]),
    PrismaModule,
    AuditLogsModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    ProductsModule,
    InvoicesModule,
    InventoryModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD,  useClass: JwtAuthGuard },
    { provide: APP_GUARD,  useClass: RolesGuard },
    { provide: APP_GUARD,  useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
