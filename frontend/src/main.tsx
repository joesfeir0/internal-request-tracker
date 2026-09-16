import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { listRequests, requestApi, type RequestStatus, type ServiceRequest } from './api';
import './style.css';

const nextStatus: Record<RequestStatus, RequestStatus | null> = { NEW: 'IN_PROGRESS', IN_PROGRESS: 'DONE', DONE: null };

function App() {
  const [actor, setActor] = useState('employee-001');
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [requestId, setRequestId] = useState('REQ-1001');
  const request = requests.find((item) => item.id === requestId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSuccess('');
    listRequests(actor, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setRequests(items);
        setRequestId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? '');
      })
      .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [actor, refresh]);

  async function changeStatus() {
    if (!request) return;
    const status = nextStatus[request.status];
    if (!status) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const saved = await requestApi(actor, request.id, { status });
      setRequests((items) => items.map((item) => item.id === saved.id ? saved : item));
      setSuccess('Status saved. History updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the status. Please try again.');
    } finally { setSaving(false); }
  }

  return <main>
    <header>
      <h1>Internal Request Tracker</h1>
      <p>Follow a request from New to Done, with every status change recorded.</p>
    </header>

    <section className="identity" aria-label="Development identity">
      <label htmlFor="actor">Development actor</label>
      <select id="actor" value={actor} disabled={saving} onChange={(event) => {
        if (event.target.value === actor) return;
        setRequests([]); setLoading(true); setError(''); setSuccess(''); setActor(event.target.value);
      }}>
        <option value="employee-001">employee-001 — Requester</option>
        <option value="handler-001">handler-001 — REQ-1001, REQ-1004, REQ-1005</option>
        <option value="handler-002">handler-002 — REQ-1002</option>
        <option value="handler-003">handler-003 — REQ-1003</option>
      </select>
      <small>Teaching identity only, not a production login. The backend checks permission.</small>
      <label htmlFor="request-selector">Service request</label>
      <select id="request-selector" value={requestId} disabled={loading || saving || !requests.length} onChange={(event) => {
        setRequestId(event.target.value); setError(''); setSuccess('');
      }}>
        {requests.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
      </select>
      <small>Requesters can try all five examples. Handlers see only their assigned requests.</small>
    </section>

    <section className="request" aria-labelledby="request-title" aria-busy={loading || saving}>
      <div className="row">
        <div><p className="eyebrow">SERVICE REQUEST</p><h2 id="request-title">{request?.id ?? 'Service request'}</h2></div>
        <button className="secondary" disabled={loading || saving} onClick={() => setRefresh((value) => value + 1)}>Refresh request</button>
      </div>
      {loading && <p role="status">Loading request…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {success && <p className="success" role="status">{success}</p>}
      {request && <>
        <p className="status-line">Current status <strong className={`badge ${request.status}`} data-testid="current-status">{request.status}</strong></p>
        <p className="hint">Only the assigned handler can change the official status.</p>
        {nextStatus[request.status]
          ? <button disabled={loading || saving} onClick={changeStatus}>
              {saving ? 'Saving…' : request.status === 'NEW' ? 'Start progress' : 'Mark done'}
            </button>
          : <p>This request is complete.</p>}
        <h3>Status history</h3>
        <ol className="history" aria-label="Status history">
          {request.history.map((event) => <li key={event.id}>
            <strong>{event.status}</strong>
            <span>By {event.changedBy}</span>
            <time dateTime={event.changedAt}>{new Date(event.changedAt).toLocaleString()}</time>
          </li>)}
        </ol>
      </>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
