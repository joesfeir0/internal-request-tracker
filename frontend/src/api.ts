// Mirrors the documented NestJS request/response contract.
export type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'DONE';
export interface ServiceRequest {
  id: string;
  status: RequestStatus;
  history: {
    id: string;
    requestId: string;
    status: RequestStatus;
    changedBy: string;
    changedAt: string;
  }[];
}

async function callApi(actor: string, path: string, options: { status?: RequestStatus; signal?: AbortSignal } = {}) {
  const saving = options.status !== undefined;
  let response: Response;
  try {
    response = await fetch(path, {
      method: saving ? 'PATCH' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Actor-Id': actor },
      body: saving ? JSON.stringify({ status: options.status }) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    // A lost response cannot tell us whether the server committed the update.
    throw new Error(saving
      ? 'Could not confirm the save. Refresh the request before trying again.'
      : 'Could not load the request. Check the backend and try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof body?.message === 'string'
      ? body.message
      : 'The request could not be completed. Please try again.');
  }
  return body;
}

export async function requestApi(actor: string, id: string, options: { status?: RequestStatus; signal?: AbortSignal } = {}): Promise<ServiceRequest> {
  const body = await callApi(actor, `/requests/${encodeURIComponent(id)}${options.status ? '/status' : ''}`, options);
  if (!body || !Array.isArray(body.history)) throw new Error('Could not read the response. Refresh the request.');
  return body;
}

export async function listRequests(actor: string, signal?: AbortSignal): Promise<ServiceRequest[]> {
  const body = await callApi(actor, '/requests', { signal });
  if (!Array.isArray(body)) throw new Error('Could not read the response. Refresh the request.');
  return body;
}
