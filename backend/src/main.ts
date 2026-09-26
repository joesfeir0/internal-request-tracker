import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { RELEASE } from './release';

async function bootstrap() {
  if (existsSync('.env')) loadEnvFile('.env');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  // Behind a hosting proxy, the client address arrives in X-Forwarded-For; the rate limits need it.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true');

  // One line per API call: method, path, status and duration. Never bodies, headers or query strings.
  const http = new Logger('HTTP');
  app.use((request: { method: string; path: string }, response: { statusCode: number; on(event: 'finish', listener: () => void): void }, next: () => void) => {
    const started = Date.now();
    if (!request.path.startsWith('/assets/')) response.on('finish', () => http.log(`${request.method} ${request.path} ${response.statusCode} ${Date.now() - started}ms`));
    next();
  });

  // Serve the built React app from the same origin as the API, so production needs no dev proxy or CORS.
  const frontend = resolve(process.env.FRONTEND_DIST || join(__dirname, '../../frontend/dist'));
  if (existsSync(join(frontend, 'index.html'))) app.useStaticAssets(frontend);

  // Hosting platforms need 0.0.0.0; locally the API stays on the loopback interface.
  const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
  await app.listen(Number(process.env.PORT ?? 3000), host);
  new Logger('Startup').log(`Internal Request Tracker release ${RELEASE} listening on ${await app.getUrl()}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
