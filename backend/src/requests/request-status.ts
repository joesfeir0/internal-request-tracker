
// Provisional lifecycle for this assignment; final business rules may differ.
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
  readonly department: 'IT' | 'HR' | 'FINANCE';
  readonly requesterId: string;
  readonly handlerId: string | null;
  readonly description: string;
  readonly summary: string;
  readonly createdAt: string;
  readonly comments: readonly { id: string; requestId: string; authorId: string; message: string; createdAt: string }[];
  readonly status: RequestStatus;
  readonly history: readonly StatusEvent[];
}
