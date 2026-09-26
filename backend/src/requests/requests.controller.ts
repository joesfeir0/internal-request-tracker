import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { ChangeStatusDto } from './change-status.dto';
import { ActorRequest, DevActorGuard } from './dev-actor';
import { WriteRateGuard } from '../rate-limit';

@Controller('requests')
// This guard resolves a demo actor from X-Actor-Id; it does not verify identity.
@UseGuards(DevActorGuard, WriteRateGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  findAll(@Req() request: ActorRequest) {
    return this.requests.findAll(request.actor);
  }

  @Post()
  create(@Req() request: ActorRequest, @Body() body: unknown) { return this.requests.create(request.actor, body); }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: ActorRequest) {
    return this.requests.findOne(id, request.actor);
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @Req() request: ActorRequest) { return this.requests.claim(id, request.actor); }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() body: unknown, @Req() request: ActorRequest) { return this.requests.addComment(id, request.actor, body); }

  @Patch(':id/status')
  changeStatus(@Param('id') id: string, @Body() body: ChangeStatusDto, @Req() request: ActorRequest) {
    return this.requests.changeStatus(id, body.status, request.actor, body.note);
  }
}
