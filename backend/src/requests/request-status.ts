// Provisional Week 1 happy path only; final business rules remain open.
export const REQUEST_STATUSES = ['NEW', 'IN_PROGRESS', 'DONE'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  NEW: ['IN_PROGRESS'],
  IN_PROGRESS: ['DONE'],
  DONE: [],
};

export interface StatusEvent {
  readonly id: string;
  readonly requestId: string;
  readonly status: RequestStatus;
  readonly changedBy: string;
  readonly changedAt: string;
}

export interface ServiceRequest {
  readonly id: string;
  readonly status: RequestStatus;
  readonly history: readonly StatusEvent[];
}
