import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { claimRequest, listRequests, replyToRequest, requestApi, type RequestStatus, type ServiceRequest } from './api';
import './style.css';
import { Intake } from './Intake';

const nextStatus: Record<RequestStatus, RequestStatus | null> = { NEW: 'IN_PROGRESS', IN_PROGRESS: 'DONE', DONE: null };

function App() {
  const [view, setView] = useState(window.location.hash === '#requests' ? 'requests' : 'prepare');
  function navigate(next: string) { setView(next); window.location.hash = next; }
  useEffect(() => {
    const change = () => setView(window.location.hash === '#requests' ? 'requests' : 'prepare');
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const [actor, setActor] = useState('employee-001');
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [requestId, setRequestId] = useState('REQ-1001');
  const request = requests.find((item) => item.id === requestId);
  const isEmployee = actor === 'employee-001';
  const departmentName = actor === 'handler-001' ? 'IT' : actor === 'handler-002' ? 'HR' : 'Finance';
  const queue = [...requests].sort((a, b) => {
    if (!isEmployee && Boolean(a.handlerId) !== Boolean(b.handlerId)) return a.handlerId ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  });
  const unassignedCount = requests.filter(item => !item.handlerId).length;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reply, setReply] = useState('');
  const [refresh, setRefresh] = useState(0);

  // Ignore a previous actor's response if the user switches roles while it loads.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSuccess('');
    listRequests(actor, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setRequests(items);
        setRequestId((current) => items.some((item) => item.id === current) ? current : (actor === 'employee-001' ? items[0] : items.find(item => !item.handlerId) ?? items[0])?.id ?? '');
      })
      .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [actor, refresh]);

  async function claim() {
    if (!request) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const saved = await claimRequest(actor, request.id);
      setRequests(items => items.map(item => item.id === saved.id ? saved : item));
      setSuccess('Request assigned to you. You can now update its status.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not claim the request.'); }
    finally { setSaving(false); }
  }
  async function sendReply() {
    if (!request || !reply.trim()) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const saved = await replyToRequest(actor, request.id, reply.trim());
      setRequests(items => items.map(item => item.id === saved.id ? saved : item));
      setReply(''); setSuccess('Reply saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the reply.'); }
    finally { setSaving(false); }
  }
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
    <header className="app-header">
      <div className="brand"><span className="brand-mark" aria-hidden="true">O</span><div><p className="eyebrow">WORKPLACE SERVICES</p><h1>Operations Hub</h1></div></div>
      <div className="identity-summary"><span className="avatar" aria-hidden="true">{isEmployee ? 'E' : departmentName.slice(0, 1)}</span>{isEmployee ? 'Employee' : `${departmentName} handler`}</div>
    </header>
    <div className="workspace-layout">
      <aside className="workspace-sidebar" aria-label="Workspace sidebar">
        <div className="testing-workspace">
          <p className="eyebrow">DEMO TESTING</p>
          <label htmlFor="testing-workspace">Testing workspace</label>
          <select id="testing-workspace" value={actor} disabled={saving} onChange={event => {
            if (event.target.value === actor) return;
            setRequests([]); setLoading(true); setError(''); setSuccess(''); setReply('');
            setActor(event.target.value);
            navigate(event.target.value === 'employee-001' ? 'prepare' : 'requests');
          }}>
            <option value="employee-001">Employee — submit a request</option>
            <option value="handler-001">IT department</option>
            <option value="handler-002">HR department</option>
            <option value="handler-003">Finance department</option>
          </select>
          <small>Switch roles to test the full process. Actions save real changes to this demo.</small>
        </div>
        <p className="eyebrow sidebar-label">WORKSPACE</p>
        <nav className="workspace-nav" aria-label="Workspace">
          {isEmployee && <button aria-current={view === 'prepare' ? 'page' : undefined} onClick={() => navigate('prepare')}><span aria-hidden="true">✎</span> Prepare a request</button>}
          <button aria-current={view === 'requests' ? 'page' : undefined} onClick={() => navigate('requests')}><span aria-hidden="true">▤</span> {isEmployee ? 'My requests' : `${departmentName} inbox`}{!isEmployee && unassignedCount > 0 && <span className="nav-count">{unassignedCount}</span>}</button>
        </nav>
        {view === 'requests' && <div className="sidebar-queue">
          <div className="sidebar-queue-heading"><span>{isEmployee ? 'YOUR REQUESTS' : 'DEPARTMENT REQUESTS'}</span><span>{requests.length}</span></div>
          {loading && <p className="sidebar-empty">Loading requests…</p>}
          {!loading && !queue.length && <p className="sidebar-empty">{isEmployee ? 'No requests submitted yet.' : 'No requests for this department yet.'}</p>}
          {!loading && !!queue.length && <div className="queue-list">{queue.map(item => <button key={item.id} className="queue-item" disabled={saving} aria-current={item.id === requestId ? 'true' : undefined} onClick={() => { setRequestId(item.id); setError(''); setSuccess(''); setReply(''); }}>
            <span className="queue-item-top"><strong>{item.id}</strong><span className={`queue-status ${item.status}`}>{item.status.replace('_', ' ')}</span></span>
            <span className="queue-summary">{item.summary || item.description || 'Service request'}</span>
            <span className="queue-meta">{isEmployee ? (item.department === 'FINANCE' ? 'Finance' : item.department) : item.handlerId ? `Assigned to ${item.handlerId}` : 'Needs a handler'}</span>
          </button>)}</div>}
        </div>}
        <p className="sidebar-note">{isEmployee ? 'Only your requests appear here.' : `Only ${departmentName} requests appear here.`}</p>
      </aside>
      <div className="workspace-content">
    {/* Remount intake on actor change so an earlier user's draft cannot carry over. */}
    <div hidden={view !== 'prepare' || !isEmployee}><Intake key={actor} actor={actor} onSubmitted={(saved) => { setRequests(items => [saved, ...items]); setRequestId(saved.id); }} /></div>
    <div hidden={view !== 'requests' && isEmployee}>
    <section className="request" aria-labelledby="request-title" aria-busy={loading || saving}>
      <p className="eyebrow">{isEmployee ? 'MY REQUESTS' : 'DEPARTMENT INBOX'}</p>
      <h2 className="tracking-title">{isEmployee ? 'My requests' : `${departmentName} requests`}</h2>
      <p className="hint">{isEmployee ? 'Follow requests you submitted and read replies from the team.' : 'Requests sent to your department. Claim an unassigned request to update its status.'}</p>
      <div className="row">
        <div><p className="eyebrow">SERVICE REQUEST</p><h2 id="request-title">{request?.id ?? 'Service request'}</h2></div>
        <button className="secondary" disabled={loading || saving} onClick={() => setRefresh((value) => value + 1)}>Refresh request</button>
      </div>
      {loading && <p role="status">Loading request…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {success && <p className="success" role="status">{success}</p>}
      {!loading && !request && <p className="hint">No requests to display yet.</p>}
      {request && <>
        <div className="request-overview"><p><strong>Department:</strong> {request.department === 'FINANCE' ? 'Finance' : request.department}</p><p><strong>Submitted by:</strong> {request.requesterId}</p><p><strong>Assigned handler:</strong> {request.handlerId ?? 'Unassigned'}</p></div>
        {request.description && <><h3>Issue</h3><p className="issue-description">{request.description}</p></>}
        {request.summary && <p className="hint"><strong>Summary:</strong> {request.summary}</p>}
        <ol className="process-steps" aria-label="Request process">{(['NEW', 'IN_PROGRESS', 'DONE'] as RequestStatus[]).map((status, index) => <li key={status} aria-current={request.status === status ? 'step' : undefined} className={index <= ['NEW', 'IN_PROGRESS', 'DONE'].indexOf(request.status) ? 'reached' : ''}><span>{index + 1}</span>{status === 'NEW' ? 'New' : status === 'IN_PROGRESS' ? 'In progress' : 'Done'}</li>)}</ol>
        {!isEmployee && !request.handlerId && <p className="hint">First claim this request, then start progress. Mark it done after resolving the issue.</p>}
        <p className="status-line">Current status <strong className={`badge ${request.status}`} data-testid="current-status">{request.status}</strong></p>
        {actor !== 'employee-001' && !request.handlerId && <button disabled={loading || saving} onClick={claim}>Claim request</button>}
        {actor !== 'employee-001' && request.handlerId && request.handlerId !== actor && <p className="hint">Assigned to another handler. You can read and reply, but only the assignee can update status.</p>}
        {request.handlerId === actor && nextStatus[request.status]
          ? <button disabled={loading || saving} onClick={changeStatus}>
              {saving ? 'Saving…' : request.status === 'NEW' ? 'Start progress' : 'Mark done'}
            </button>
          : request.status === 'DONE' ? <p>This request is complete.</p> : null}
        <h3>Conversation</h3>
        {request.comments.length ? <ol className="conversation" aria-label="Conversation">{request.comments.map(comment => <li key={comment.id}><div><strong>{comment.authorId === actor ? 'You' : comment.authorId}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></div><p>{comment.message}</p></li>)}</ol> : <p className="hint">No replies yet.</p>}
        <form className="reply-form" onSubmit={(event) => { event.preventDefault(); void sendReply(); }}><label htmlFor="reply">{actor === 'employee-001' ? 'Add information or ask a question' : 'Reply to the requester'}</label><textarea id="reply" maxLength={2000} rows={3} value={reply} onChange={event => setReply(event.target.value)} placeholder="Write a message about this request" /><button type="submit" disabled={saving || !reply.trim()}>Send reply</button></form>
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
    </div>
      </div>
    </div>
    <footer>Operations Hub · Internal service requests</footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
