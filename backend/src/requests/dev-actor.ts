import { CanActivate, Controller, ExecutionContext, Get, Injectable, UnauthorizedException } from '@nestjs/common';

// Fixed demo identities. A caller can choose one by header; this is not real login.
// Two employees and two IT handlers make visibility and assignment boundaries demonstrable.
export const ACTORS = [
  { id: 'employee-001', name: 'Maya Haddad', role: 'requester', department: null },
  { id: 'employee-002', name: 'Karim Nassar', role: 'requester', department: null },
  { id: 'handler-001', name: 'Rami Khoury', role: 'handler', department: 'IT' },
  { id: 'handler-004', name: 'Lina Farah', role: 'handler', department: 'IT' },
  { id: 'handler-002', name: 'Nour Saleh', role: 'handler', department: 'HR' },
  { id: 'handler-003', name: 'Omar Aoun', role: 'handler', department: 'FINANCE' },
] as const;
export type Actor = (typeof ACTORS)[number];
export interface ActorRequest { actor: Actor; headers: Record<string, string | string[] | undefined>; ip?: string }

@Injectable()
export class DevActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    const actor = ACTORS.find((known) => known.id === request.headers['x-actor-id']);
    if (!actor) throw new UnauthorizedException('Select a known development actor.');
    request.actor = actor;
    return true;
  }
}

// Public demo directory so the UI does not hardcode identities or roles.
@Controller('actors')
export class ActorsController {
  @Get()
  list() { return ACTORS; }
}
