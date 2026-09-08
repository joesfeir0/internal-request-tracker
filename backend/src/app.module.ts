import { Module } from '@nestjs/common';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';

@Module({
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class AppModule {}
