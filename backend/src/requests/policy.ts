import { Actor } from './dev-actor';
import { ALLOWED_TRANSITIONS, RequestStatus } from './request-status';

// The single permission policy. The service enforces it; responses expose the same
// answers so the UI only shows actions the server will accept.
type PolicyRequest = { requesterId: string; handlerId: string | null; department?: string; status: RequestStatus };

export interface AllowedActions {
  claim: boolean;
  comment: boolean;
  nextStatus: RequestStatus | null;
}

export function canView(actor: Actor, request: PolicyRequest): boolean {
  if (request.requesterId === actor.id) return true;
  // Assigned handlers keep direct access to their own work.
  return actor.role === 'handler' && (request.department === actor.department || request.handlerId === actor.id);
}

export function isDepartmentHandler(actor: Actor, request: PolicyRequest): boolean {
  return actor.role === 'handler' && request.department === actor.department;
}

export function isAssignedHandler(actor: Actor, request: PolicyRequest): boolean {
  return actor.role === 'handler' && request.handlerId === actor.id;
}

// Completed requests are closed; follow-up needs a new request.
export function isOpen(request: PolicyRequest): boolean {
  return request.status !== 'DONE';
}

export function allowedActions(actor: Actor, request: PolicyRequest): AllowedActions {
  const nextStatus = ALLOWED_TRANSITIONS[request.status][0] ?? null;
  return {
    claim: isDepartmentHandler(actor, request) && !request.handlerId && isOpen(request),
    comment: canView(actor, request) && isOpen(request),
    nextStatus: isAssignedHandler(actor, request) ? nextStatus : null,
  };
}
