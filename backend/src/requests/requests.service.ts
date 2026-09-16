import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ALLOWED_TRANSITIONS, RequestStatus, ServiceRequest } from './request-status';
import { Actor } from './dev-actor';
import { OwnedRequest, RequestsStore } from './requests.store';

function response(request: OwnedRequest): ServiceRequest {
  return { id: request.id, status: request.status, history: request.history };
}

@Injectable()
export class RequestsService {
  constructor(private readonly store: RequestsStore) {}

  async findAll(actor: Actor): Promise<ServiceRequest[]> {
    return (await this.store.findAll(actor.id)).map(response);
  }

  private async visibleRequest(id: string, actor: Actor): Promise<OwnedRequest> {
    const request = await this.store.findOne(id);
    if (!request || (request.requesterId !== actor.id && request.handlerId !== actor.id)) {
      throw new NotFoundException('Request unavailable or not found.');
    }
    return request;
  }

  async findOne(id: string, actor: Actor): Promise<ServiceRequest> {
    return response(await this.visibleRequest(id, actor));
  }

  async changeStatus(id: string, target: RequestStatus, actor: Actor): Promise<ServiceRequest> {
    const request = await this.visibleRequest(id, actor);
    if (actor.role !== 'handler' || request.handlerId !== actor.id) {
      throw new ForbiddenException("Only the assigned handler can change this request's status.");
    }
    if (!ALLOWED_TRANSITIONS[request.status].includes(target)) {
      throw new ConflictException(`Transition ${request.status} -> ${target} is not allowed`);
    }
    try {
      return response(await this.store.saveStatus(id, request.status, target, actor.id));
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException('Could not save the status. Please try again.');
    }
  }
}
