import { IntakeController } from './intake/intake.controller';
import { IntakeService } from './intake/intake.service';
import { GeminiClient } from './intake/gemini.client';
import { BadRequestException, Module, ValidationError, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { RequestsStore } from './requests/requests.store';
import { ActorsController, DevActorGuard } from './requests/dev-actor';
import { RateLimiter, WriteRateGuard } from './rate-limit';
import { AiStatus } from './intake/ai-status';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

// Report the DTO's own messages instead of one fixed sentence for every body.
function validationFailure(errors: ValidationError[]) {
  const messages = errors.flatMap(error => Object.values(error.constraints ?? {}));
  return new BadRequestException(messages.length ? messages.join('; ') : 'Invalid request body.');
}

@Module({
  controllers: [RequestsController, IntakeController, ActorsController, HealthController],
  providers: [IntakeService, GeminiClient, RequestsService, RequestsStore, DevActorGuard, RateLimiter, WriteRateGuard, AiStatus, HealthService, {
    provide: APP_PIPE,
    useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationFailure }),
  }],
})
export class AppModule {}
