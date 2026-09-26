import { ForbiddenException, Injectable, BadGatewayException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Actor } from '../requests/dev-actor';
import { RateLimiter } from '../rate-limit';
import { AiStatus, failureReason } from './ai-status';
import { GeminiClient } from './gemini.client';
import { intakeText, validateCandidate } from './intake-contract';

export const INTAKE_FAILURE = 'Could not produce an intake suggestion right now. Please try again.';
export const INTAKE_LIMITED = 'AI suggestions are busy right now. Choose the department yourself, or try again in a minute.';
@Injectable()
export class IntakeService {
  private readonly logger = new Logger('AiIntake');
  constructor(private readonly provider: GeminiClient, private readonly limiter: RateLimiter, private readonly status: AiStatus) {}
  async suggest(actor: Actor, body: unknown, client = 'unknown') {
    if (actor.role !== 'requester') throw new ForbiddenException('Only requesters can use AI intake in this demo.');
    const text = intakeText(body);
    // Only calls that would reach the provider count, protecting the free model quota.
    if (!this.limiter.take(`ai:${client}`, this.limiter.aiPerMinute, 60_000)
      || !this.limiter.take('ai:all', this.limiter.aiPerDay, 86_400_000)) {
      this.logger.warn('AI intake rate limited');
      throw new HttpException(INTAKE_LIMITED, HttpStatus.TOO_MANY_REQUESTS);
    }
    // Provider failures and invalid answers share one safe response; the log keeps the reason.
    try {
      const candidate = validateCandidate(await this.provider.generate(text));
      this.status.record(true);
      return candidate;
    } catch (error) {
      const reason = failureReason(error);
      this.status.record(false, reason);
      this.logger.warn(`AI intake failed: ${reason}`);
      throw new BadGatewayException(INTAKE_FAILURE);
    }
  }
}
