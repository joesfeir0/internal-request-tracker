import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ALLOWED_TRANSITIONS, RequestStatus, ServiceRequest } from './request-status';
import { Actor } from './dev-actor';
import { OwnedRequest, RequestsStore } from './requests.store';
import { ROUTABLE_DEPARTMENTS, isObject } from '../intake/intake-contract';

function response(request: OwnedRequest): ServiceRequest { return request; }
function validText(value: unknown, max: number): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }

@Injectable()
export class RequestsService {
  constructor(private readonly store: RequestsStore) {}

  async findAll(actor: Actor): Promise<ServiceRequest[]> { return (await this.store.findAll(actor)).map(response); }

  // Hide requests from unrelated actors with 404. Assigned handlers keep direct access.
  private async visibleRequest(id: string, actor: Actor): Promise<OwnedRequest> {
    const request = await this.store.findOne(id);
    if (!request || (request.requesterId !== actor.id && !(actor.role === 'handler' && (request.department === actor.department || request.handlerId === actor.id)))) {
      throw new NotFoundException('Request unavailable or not found.');
    }
    return request;
  }

  async findOne(id: string, actor: Actor): Promise<ServiceRequest> { return response(await this.visibleRequest(id, actor)); }

  async create(actor: Actor, body: unknown): Promise<ServiceRequest> {
    if (actor.role !== 'requester') throw new ForbiddenException('Only requesters can submit a request.');
    // Validate submitted fields here; AI suggestions are only advisory.
    if (!isObject(body) || Object.keys(body).some(key => !['description', 'summary', 'department'].includes(key))
      || !validText(body.description, 4000) || !validText(body.summary, 600)
      || !ROUTABLE_DEPARTMENTS.some(code => code === body.department)) {
      throw new BadRequestException('Provide a description, summary and supported department (IT, HR or FINANCE).');
    }
    try { return response(await this.store.create(body.description.trim(), body.summary.trim(), body.department as ServiceRequest['department'], actor.id)); }
    catch { throw new ServiceUnavailableException('Could not submit the request. Please try again.'); }
  }

  async claim(id: string, actor: Actor): Promise<ServiceRequest> {
    const request = await this.visibleRequest(id, actor);
    if (actor.role !== 'handler' || request.department !== actor.department) throw new ForbiddenException('Only this department can claim the request.');
    if (request.handlerId) throw new ConflictException('This request is already assigned.');
    try { return response(await this.store.claim(id, request.department, actor.id)); }
    // Preserve a conflict from a competing claim; treat other save errors as unavailable.
    catch (error) { if (error instanceof ConflictException) throw error; throw new ServiceUnavailableException('Could not claim the request. Please try again.'); }
  }

  async addComment(id: string, actor: Actor, body: unknown): Promise<ServiceRequest> {
    await this.visibleRequest(id, actor);
    if (!isObject(body) || Object.keys(body).length !== 1 || !validText(body.message, 2000)) throw new BadRequestException('Enter a message of 1 to 2000 characters.');
    try { return response(await this.store.addComment(id, actor.id, body.message.trim())); }
    catch { throw new ServiceUnavailableException('Could not send the reply. Please try again.'); }
  }

  async changeStatus(id: string, target: RequestStatus, actor: Actor): Promise<ServiceRequest> {
    const request = await this.visibleRequest(id, actor);
    if (actor.role !== 'handler' || request.handlerId !== actor.id) throw new ForbiddenException("Only the assigned handler can change this request's status.");
    if (!ALLOWED_TRANSITIONS[request.status].includes(target)) throw new ConflictException(`Transition ${request.status} -> ${target} is not allowed`);
    try { return response(await this.store.saveStatus(id, request.status, target, actor.id)); }
    catch (error) { if (error instanceof ConflictException) throw error; throw new ServiceUnavailableException('Could not save the status. Please try again.'); }
  }
}
