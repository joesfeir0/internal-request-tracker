import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ALLOWED_TRANSITIONS, REQUEST_STATUSES, RequestStatus, ServiceRequest } from './request-status';

@Injectable()
export class RequestsService {
  private readonly requests = new Map<string, ServiceRequest>();

  constructor() {
    for (const id of ['REQ-1001', 'REQ-1002', 'REQ-1003']) {
      this.requests.set(id, {
        id,
        status: 'NEW',
        history: [{
          id: randomUUID(),
          requestId: id,
          status: 'NEW',
          changedBy: 'seed',
          changedAt: new Date().toISOString(),
        }],
      });
    }
  }

  findAll(): ServiceRequest[] {
    return structuredClone([...this.requests.values()]);
  }

  findOne(id: string): ServiceRequest {
    const request = this.requests.get(id);
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    // Callers cannot mutate the stored request or its existing events.
    return structuredClone(request);
  }

  changeStatus(id: string, body: unknown): ServiceRequest {
    const request = this.findOne(id);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Body must contain status and changedBy');
    }
    const { status, changedBy } = body as Record<string, unknown>;
    if (typeof status !== 'string' || !REQUEST_STATUSES.includes(status as RequestStatus)) {
      throw new BadRequestException('status must be NEW, IN_PROGRESS, or DONE');
    }
    if (typeof changedBy !== 'string' || changedBy.trim().length === 0) {
      throw new BadRequestException('changedBy must be a non-empty string');
    }
    const target = status as RequestStatus;
    if (!ALLOWED_TRANSITIONS[request.status].includes(target)) {
      throw new ConflictException(`Transition ${request.status} -> ${target} is not allowed`);
    }

    const updated: ServiceRequest = {
      ...request,
      status: target,
      history: [...request.history, {
        id: randomUUID(),
        requestId: id,
        status: target,
        changedBy: changedBy.trim(),
        changedAt: new Date().toISOString(),
      }],
    };
    // One synchronous replacement commits status and history together.
    // No await or separate writes can expose a partially updated request.
    this.requests.set(id, updated);
    return structuredClone(updated);
  }
}
