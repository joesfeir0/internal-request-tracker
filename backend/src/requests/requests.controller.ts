import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { ChangeStatusDto } from './change-status.dto';
import { ActorRequest, DevActorGuard } from './dev-actor';

@Controller('requests')
@UseGuards(DevActorGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  findAll(@Req() request: ActorRequest) {
    return this.requests.findAll(request.actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: ActorRequest) {
    return this.requests.findOne(id, request.actor);
  }

  @Patch(':id/status')
  changeStatus(@Param('id') id: string, @Body() body: ChangeStatusDto, @Req() request: ActorRequest) {
    return this.requests.changeStatus(id, body.status, request.actor);
  }
}
