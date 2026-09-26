import { Injectable, Logger } from '@nestjs/common';
import { AiStatus, failureReason } from '../intake/ai-status';
import { GeminiClient } from '../intake/gemini.client';
import { validateCandidate } from '../intake/intake-contract';
import { RequestsStore } from '../requests/requests.store';
import { RELEASE } from '../release';

export type Check = 'ok' | 'unavailable' | 'not_configured';
export interface Health { status: 'ok' | 'degraded' | 'unhealthy'; checks: { database: Check; triageModel: Check }; release: string; checkedAt: string }

// A recent success is trusted for 10 minutes; a failure is rechecked after 1 minute so recovery shows quickly.
const OK_FOR_MS = 10 * 60_000;
const FAILURE_FOR_MS = 60_000;
const DATABASE_TIMEOUT_MS = 5_000;
const PROBE_TEXT = 'Health check: my laptop does not turn on since this morning.';

@Injectable()
export class HealthService {
  private readonly logger = new Logger('Health');
  private probing?: Promise<void>;
  constructor(private readonly store: RequestsStore, private readonly provider: GeminiClient, private readonly ai: AiStatus) {}

  async check(): Promise<Health> {
    const [database, triageModel] = await Promise.all([this.database(), this.triageModel()]);
    // Without the database the core journey cannot work; without AI, manual submission still does.
    const status = database !== 'ok' ? 'unhealthy' : triageModel !== 'ok' ? 'degraded' : 'ok';
    if (status !== 'ok') this.logger.warn(`Health ${status}: database=${database}, triageModel=${triageModel}${this.ai.last?.reason ? ` (${this.ai.last.reason})` : ''}`);
    return { status, checks: { database, triageModel }, release: RELEASE, checkedAt: new Date().toISOString() };
  }

  private async database(): Promise<Check> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.store.ping(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Database check timed out')), DATABASE_TIMEOUT_MS); }),
      ]);
      return 'ok';
    } catch { return 'unavailable'; }
    finally { clearTimeout(timer); }
  }

  // Uses the latest real intake result when fresh; otherwise runs one shared probe.
  private async triageModel(): Promise<Check> {
    if (!process.env.GEMINI_API_KEY?.trim()) return 'not_configured';
    const last = this.ai.last;
    if (!last || Date.now() - last.at > (last.ok ? OK_FOR_MS : FAILURE_FOR_MS)) {
      this.probing ??= this.probe().finally(() => { this.probing = undefined; });
      await this.probing;
    }
    return this.ai.last?.ok ? 'ok' : 'unavailable';
  }

  private async probe() {
    try { validateCandidate(await this.provider.generate(PROBE_TEXT)); this.ai.record(true); }
    catch (error) { this.ai.record(false, failureReason(error)); }
  }
}
