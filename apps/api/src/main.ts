import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.INTERNAL_JWT_SECRET || process.env.INTERNAL_JWT_SECRET === 'change-me') {
    throw new Error('INTERNAL_JWT_SECRET must be set (see .env.example)');
  }
  // 5 MB covers a 10k-row lead import sent as JSON.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ bodyLimit: 5 * 1024 * 1024 }), {
    // Instagram webhooks are signed over the exact bytes received.
    rawBody: true,
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}
bootstrap();
