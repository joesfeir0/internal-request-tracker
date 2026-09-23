
export type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'DONE';
export interface ServiceRequest {
  id: string;
  status: RequestStatus;
  department: 'IT' | 'HR' | 'FINANCE';
  requesterId: string;
  handlerId: string | null;
  description: string;
  summary: string;
  createdAt: string;
  comments: { id: string; requestId: string; authorId: string; message: string; createdAt: string }[];
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
    // Without a response, a status save may have succeeded; ask the user to refresh.
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

export interface IntakeCandidate {
  suggestedDepartment: 'IT' | 'HR' | 'FINANCE' | 'UNDETERMINED';
  summary: string;
  missingInformation: string[];
  suggestedNextStep: string;
}

export async function suggestIntake(actor: string, text: string, signal: AbortSignal): Promise<IntakeCandidate> {
  let response: Response;
  try {
    response = await fetch('/requests/intake-suggestion', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Actor-Id': actor },
      body: JSON.stringify({ text }), signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Could not get an intake suggestion. Please try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.message === 'string' ? body.message : 'Could not get an intake suggestion. Please try again.');
  if (!body || !['IT', 'HR', 'FINANCE', 'UNDETERMINED'].includes(body.suggestedDepartment)
    || typeof body.summary !== 'string' || typeof body.suggestedNextStep !== 'string'
    || !Array.isArray(body.missingInformation) || !body.missingInformation.every((item: unknown) => typeof item === 'string')) {
    throw new Error('Could not read the intake suggestion. Please try again.');
  }
  return body;
}

async function postRequest(actor: string, path: string, body: unknown): Promise<ServiceRequest> {
  let response: Response;
  try {
    response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Actor-Id': actor }, body: JSON.stringify(body) });
  } catch { throw new Error('Could not confirm the action. Refresh before trying again.'); }
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof value?.message === 'string' ? value.message : 'The action could not be completed.');
  if (!value || typeof value.id !== 'string' || !Array.isArray(value.history)) throw new Error('Could not read the saved request. Refresh the page.');
  return value;
}
export function submitRequest(actor: string, description: string, summary: string, department: 'IT' | 'HR' | 'FINANCE') {
  return postRequest(actor, '/requests', { description, summary, department });
}
export function claimRequest(actor: string, id: string) {
  return postRequest(actor, `/requests/${encodeURIComponent(id)}/claim`, {});
}
export function replyToRequest(actor: string, id: string, message: string) {
  return postRequest(actor, `/requests/${encodeURIComponent(id)}/comments`, { message });
}
