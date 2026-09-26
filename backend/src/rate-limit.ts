import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

function limit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Fixed-window counters kept in memory. Enough for one free instance; limits reset on restart.
@Injectable()
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  readonly aiPerMinute = limit('AI_REQUESTS_PER_MINUTE', 10);
  readonly aiPerDay = limit('AI_REQUESTS_PER_DAY', 300);
  readonly writesPerMinute = limit('WRITE_REQUESTS_PER_MINUTE', 60);

  take(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    if (this.windows.size > 10_000) {
      for (const [stored, window] of this.windows) if (window.resetAt <= now) this.windows.delete(stored);
    }
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (window.count >= max) return false;
    window.count++;
    return true;
  }
}

export function clientKey(request: { ip?: string }): string {
  return request.ip || 'unknown';
}

// Limits saves per client so a public demo cannot be flooded with writes.
@Injectable()
export class WriteRateGuard implements CanActivate {
  constructor(private readonly limiter: RateLimiter) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method: string; ip?: string }>();
    if (request.method === 'GET') return true;
    if (!this.limiter.take(`write:${clientKey(request)}`, this.limiter.writesPerMinute, 60_000)) {
      throw new HttpException('Too many changes in a short time. Wait a minute and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
