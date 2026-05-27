import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import compression = require('compression');
import express from 'express';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';

// Cached across warm invocations
let cachedApp: express.Express | null = null;

async function bootstrap(): Promise<express.Express> {
  const server = express();

  const nestApp = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn', 'log'],
  });

  nestApp.use(helmet());
  nestApp.use(compression());

  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',').map(o => o.trim()).filter(Boolean);
  const allowedOrigins = [
    'https://noon-system-frontend.vercel.app',
    ...envOrigins,
  ];
  nestApp.enableCors({
    origin:      (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: ${origin} not allowed`));
    },
    methods:     ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    credentials: true,
  });

  nestApp.setGlobalPrefix('api/v1');

  nestApp.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,
      forbidNonWhitelisted: true,
      transform:            true,
      transformOptions:     { enableImplicitConversion: false },
    }),
  );

  await nestApp.init();
  return server;
}

export default async (req: express.Request, res: express.Response) => {
  try {
    if (!cachedApp) cachedApp = await bootstrap();
    cachedApp(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[bootstrap] startup failed:', message);
    res.status(500).json({ statusCode: 500, error: 'Service unavailable', message });
  }
};
