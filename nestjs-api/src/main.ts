import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  const isProd = config.get('NODE_ENV') === 'production';

  // Security headers
  app.use(helmet());

  // CORS
  const originsRaw = config.get<string>('CORS_ORIGINS') ?? '';
  const origins = originsRaw.split(',').map(o => o.trim()).filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Swagger (disable in production if desired)
  if (!isProd) {
    const doc = new DocumentBuilder()
      .setTitle('Noon Financial API')
      .setDescription('REST API for Noon marketplace financial management')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, doc);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api/v1`);
  if (!isProd) console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
