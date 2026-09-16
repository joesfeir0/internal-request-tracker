import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

// Teaching identities only. A header is not production authentication.
const actors = [
  { id: 'employee-001', role: 'requester' },
  { id: 'handler-001', role: 'handler' },
  { id: 'handler-002', role: 'handler' },
  { id: 'handler-003', role: 'handler' },
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
