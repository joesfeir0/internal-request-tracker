import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ActorRequest, DevActorGuard } from '../requests/dev-actor';
import { IntakeService } from './intake.service';

@Controller('requests/intake-suggestion')
@UseGuards(DevActorGuard)
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}
  @Post()
  @HttpCode(200)
  suggest(@Req() request: ActorRequest, @Body() body: unknown) {
    return this.intake.suggest(request.actor, body);
  }
}
