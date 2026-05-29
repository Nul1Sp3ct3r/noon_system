import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression = require('compression');
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const port   = config.get<number>('PORT') ?? 3000;
  const isProd = config.get('NODE_ENV') === 'production';

  // Graceful shutdown on SIGTERM/SIGINT
  app.enableShutdownHooks();

  // Security headers
  app.use(helmet());

  // Response compression
  app.use(compression());

  // CORS
  const originsRaw = config.get<string>('CORS_ORIGINS') ?? '';
  const origins    = originsRaw.split(',').map(o => o.trim()).filter(Boolean);
  app.enableCors({
    origin:      origins.length ? origins : false,
    methods:     ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,
      forbidNonWhitelisted: true,
      transform:            true,
      transformOptions:     { enableImplicitConversion: false },
    }),
  );

  // Swagger (dev only)
  if (!isProd) {
    const doc = new DocumentBuilder()
      .setTitle('PreciseFlow API')
      .setDescription('REST API for Noon marketplace financial management — PreciseFlow')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, doc);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port, '0.0.0.0');

  const base = `http://localhost:${port}`;
  console.log(`API     → ${base}/api/v1`);
  console.log(`Health  → ${base}/api/v1/health`);
  if (!isProd) console.log(`Swagger → ${base}/api/docs`);
}

bootstrap();
