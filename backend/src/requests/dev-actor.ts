import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

// Fixed demo identities. A caller can choose one by header; this is not real login.
const actors = [
  { id: 'employee-001', role: 'requester', department: null },
  { id: 'handler-001', role: 'handler', department: 'IT' },
  { id: 'handler-002', role: 'handler', department: 'HR' },
  { id: 'handler-003', role: 'handler', department: 'FINANCE' },
] as const;
export type Actor = (typeof actors)[number];
export interface ActorRequest { actor: Actor; headers: Record<string, string | string[] | undefined> }

@Injectable()
export class DevActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    const actor = actors.find((known) => known.id === request.headers['x-actor-id']);
    if (!actor) throw new UnauthorizedException('Select a known development actor.');
    request.actor = actor;
    return true;
  }
}
