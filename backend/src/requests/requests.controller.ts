import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  findAll() {
    return this.requests.findAll();
  }

  // Small read endpoint for demonstrating current state and unchanged history.
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.requests.findOne(id);
  }

  @Patch(':id/status')
  changeStatus(@Param('id') id: string, @Body() body: unknown) {
    return this.requests.changeStatus(id, body);
  }
}
