import { Injectable } from '@nestjs/common';

// Our own provider errors carry fixed, data-free messages; anything else is summarised
// so a log line can never contain employee text or provider response content.
const SAFE_REASONS = [/^Provider not configured$/, /^Invalid model configuration$/, /^Provider unavailable \(HTTP \d{3}\)$/,
  /^Missing provider response$/, /^Provider response too large$/, /^Invalid envelope$/, /^Incomplete candidate$/,
  /^Missing candidate text$/, /^Invalid intake candidate$/];

export function failureReason(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'Provider timed out';
  if (error instanceof SyntaxError) return 'Unreadable provider response';
  if (error instanceof TypeError) return 'Provider could not be reached';
  if (error instanceof Error && SAFE_REASONS.some(pattern => pattern.test(error.message))) return error.message;
  return 'Unexpected provider failure';
}

// Remembers the latest real or probe result so health reflects what users just experienced.
@Injectable()
export class AiStatus {
  last?: { ok: boolean; at: number; reason?: string };
  record(ok: boolean, reason?: string) { this.last = { ok, at: Date.now(), reason }; }
}
