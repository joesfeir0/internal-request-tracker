import { BadRequestException, Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { RequestsStore } from './requests/requests.store';
import { DevActorGuard } from './requests/dev-actor';

@Module({
  controllers: [RequestsController],
  providers: [RequestsService, RequestsStore, DevActorGuard, {
    provide: APP_PIPE,
    useValue: new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
      exceptionFactory: () => new BadRequestException('Body must contain only status: NEW, IN_PROGRESS, or DONE.'),
    }),
  }],
})
export class AppModule {}
