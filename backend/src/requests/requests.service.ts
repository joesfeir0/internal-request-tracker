import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ALLOWED_TRANSITIONS, RequestStatus, ServiceRequest } from './request-status';
import { Actor } from './dev-actor';
import { OwnedRequest, RequestsStore } from './requests.store';
import { ROUTABLE_DEPARTMENTS, isObject } from '../intake/intake-contract';
import { AllowedActions, allowedActions, canView, isAssignedHandler, isDepartmentHandler, isOpen } from './policy';

export type RequestView = ServiceRequest & { allowedActions: AllowedActions };

function response(request: OwnedRequest, actor: Actor): RequestView { return { ...request, allowedActions: allowedActions(actor, request) }; }
function validText(value: unknown, max: number): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
const CLOSED = 'This request is closed. Submit a new request if you need more help.';
// Log a database error code (for example P1001, cannot reach server), never the query or its data.
function errorCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : error instanceof Error ? error.name : 'unknown';
}

@Injectable()
export class RequestsService {
  private readonly logger = new Logger('Requests');
  constructor(private readonly store: RequestsStore) {}

  async findAll(actor: Actor): Promise<RequestView[]> { return (await this.store.findAll(actor)).map(request => response(request, actor)); }

  // Hide requests from unrelated actors with 404 so their existence is not revealed.
  private async visibleRequest(id: string, actor: Actor): Promise<OwnedRequest> {
    const request = await this.store.findOne(id);
    if (!request || !canView(actor, request)) throw new NotFoundException('Request unavailable or not found.');
    return request;
  }

  async findOne(id: string, actor: Actor): Promise<RequestView> { return response(await this.visibleRequest(id, actor), actor); }

  async create(actor: Actor, body: unknown): Promise<RequestView> {
    if (actor.role !== 'requester') throw new ForbiddenException('Only requesters can submit a request.');
    // Validate submitted fields here; AI suggestions are only advisory.
    if (!isObject(body) || Object.keys(body).some(key => !['description', 'summary', 'department'].includes(key))
      || !validText(body.description, 4000) || !validText(body.summary, 600)
      || !ROUTABLE_DEPARTMENTS.some(code => code === body.department)) {
      throw new BadRequestException('Provide a description, summary and supported department (IT, HR or FINANCE).');
    }
    try { return response(await this.store.create(body.description.trim(), body.summary.trim(), body.department as ServiceRequest['department'], actor.id), actor); }
    catch (error) {
      this.logger.error(`Submit failed for ${actor.id}: ${errorCode(error)}`);
      throw new ServiceUnavailableException('Could not submit the request. Please try again.');
    }
  }

  async claim(id: string, actor: Actor): Promise<RequestView> {
    const request = await this.visibleRequest(id, actor);
    if (!isDepartmentHandler(actor, request)) throw new ForbiddenException('Only this department can claim the request.');
    if (!isOpen(request)) throw new ConflictException(CLOSED);
    if (request.handlerId) throw new ConflictException('This request is already assigned.');
    try { return response(await this.store.claim(id, request.department, actor.id), actor); }
    // Preserve a conflict from a competing claim; treat other save errors as unavailable.
    catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(`Claim failed for ${id}: ${errorCode(error)}`);
      throw new ServiceUnavailableException('Could not claim the request. Please try again.');
    }
  }

  async addComment(id: string, actor: Actor, body: unknown): Promise<RequestView> {
    const request = await this.visibleRequest(id, actor);
    if (!isObject(body) || Object.keys(body).length !== 1 || !validText(body.message, 2000)) throw new BadRequestException('Enter a message of 1 to 2000 characters.');
    if (!isOpen(request)) throw new ConflictException(CLOSED);
    try { return response(await this.store.addComment(id, actor.id, body.message.trim()), actor); }
    catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(`Reply failed for ${id}: ${errorCode(error)}`);
      throw new ServiceUnavailableException('Could not send the reply. Please try again.');
    }
  }

  async changeStatus(id: string, target: RequestStatus, actor: Actor, note?: string): Promise<RequestView> {
    const request = await this.visibleRequest(id, actor);
    if (!isAssignedHandler(actor, request)) throw new ForbiddenException("Only the assigned handler can change this request's status.");
    if (!ALLOWED_TRANSITIONS[request.status].includes(target)) throw new ConflictException(`Transition ${request.status} -> ${target} is not allowed`);
    try { return response(await this.store.saveStatus(id, request.status, target, actor.id, note?.trim() || undefined), actor); }
    catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(`Status change failed for ${id}: ${errorCode(error)}`);
      throw new ServiceUnavailableException('Could not save the status. Please try again.');
    }
  }
}
