import { ForbiddenException, Injectable, BadGatewayException } from '@nestjs/common';
import { Actor } from '../requests/dev-actor';
import { GeminiClient } from './gemini.client';
import { intakeText, validateCandidate } from './intake-contract';

export const INTAKE_FAILURE = 'Could not produce an intake suggestion right now. Please try again.';
@Injectable()
export class IntakeService {
  constructor(private readonly provider: GeminiClient) {}
  async suggest(actor: Actor, body: unknown) {
    if (actor.role !== 'requester') throw new ForbiddenException('Only requesters can use AI intake in this demo.');
    const text = intakeText(body);
    // Provider failures and invalid answers share one safe response.
    try { return validateCandidate(await this.provider.generate(text)); }
    catch { throw new BadGatewayException(INTAKE_FAILURE); }
  }
}
