import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { claimRequest, listActors, listRequests, replyToRequest, requestApi, type Actor, type RequestStatus, type ServiceRequest } from './api';
import './style.css';
import { Intake } from './Intake';

const STATUSES: RequestStatus[] = ['NEW', 'IN_PROGRESS', 'DONE'];
const statusLabel: Record<RequestStatus, string> = { NEW: 'New', IN_PROGRESS: 'In progress', DONE: 'Done' };
const departmentLabel = (code: string | null) => code === 'FINANCE' ? 'Finance' : code ?? '';
// Background refresh so requesters see replies and progress without reloading.
const REFRESH_MS = 30_000;

function Header({ actor }: { actor?: Actor }) {
  return <header className="app-header">
    <div className="brand"><span className="brand-mark" aria-hidden="true">O</span><div><p className="eyebrow">WORKPLACE SERVICES</p><h1>Operations Hub</h1></div></div>
    {actor && <div className="identity-summary"><span className="avatar" aria-hidden="true">{actor.name.slice(0, 1)}</span><div><strong>{actor.name}</strong><small>{actor.role === 'requester' ? 'Employee' : `${departmentLabel(actor.department)} handler`}</small></div></div>}
  </header>;
}

function App() {
  const [actors, setActors] = useState<Actor[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    listActors().then(items => { if (active) setActors(items); }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [attempt]);
  if (actors) return <Workspace actors={actors} />;
  return <main><Header /><section className="request" aria-busy={!error}>
    {error ? <><p className="error" role="alert">{error}</p><button onClick={() => setAttempt(value => value + 1)}>Try again</button></> : <p role="status">Loading Operations Hub…</p>}
  </section></main>;
}

function Workspace({ actors }: { actors: Actor[] }) {
  const [view, setView] = useState(window.location.hash === '#requests' ? 'requests' : 'prepare');
  function navigate(next: string) { setView(next); window.location.hash = next; }
  useEffect(() => {
    const change = () => setView(window.location.hash === '#requests' ? 'requests' : 'prepare');
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const [actorId, setActorId] = useState(() => (actors.find(item => item.role === 'requester') ?? actors[0]).id);
  const actor = actors.find(item => item.id === actorId) ?? actors[0];
  const isRequester = actor.role === 'requester';
  const departmentName = departmentLabel(actor.department);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [requestId, setRequestId] = useState('');
  const [filter, setFilter] = useState<'open' | 'done'>('open');
  const request = requests.find((item) => item.id === requestId);
  const openCount = requests.filter(item => item.status !== 'DONE').length;
  const queue = requests.filter(item => (item.status === 'DONE') === (filter === 'done')).sort((a, b) => {
    if (!isRequester && Boolean(a.handlerId) !== Boolean(b.handlerId)) return a.handlerId ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  });
  const unassignedCount = requests.filter(item => !item.handlerId && item.status !== 'DONE').length;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [refresh, setRefresh] = useState(0);
  // Counts local saves so a slower background refresh cannot overwrite a newer result.
  const changes = useRef(0);

  function nameOf(id: string) {
    if (id === actor.id) return 'You';
    if (id === 'seed') return 'Demo data';
    const known = actors.find(item => item.id === id);
    if (!known) return id;
    return known.role === 'handler' ? `${known.name} (${departmentLabel(known.department)})` : known.name;
  }

  // Keep the current selection; otherwise start with the most useful open request.
  function pick(items: ServiceRequest[], current: string) {
    if (items.some(item => item.id === current)) return current;
    const open = items.filter(item => item.status !== 'DONE');
    return (isRequester ? open[0] : open.find(item => !item.handlerId) ?? open[0])?.id ?? items[0]?.id ?? '';
  }

  // Ignore a previous actor's response if the user switches roles while it loads.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listRequests(actorId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        changes.current++;
        setRequests(items);
        setRequestId(current => pick(items, current));
      })
      .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [actorId, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const version = changes.current;
      listRequests(actorId, controller.signal)
        .then(items => { if (!controller.signal.aborted && version === changes.current) setRequests(items); })
        .catch(() => { /* The next refresh or a manual refresh will try again. */ });
    }, REFRESH_MS);
    return () => { clearInterval(timer); controller.abort(); };
  }, [actorId]);

  function apply(saved: ServiceRequest) {
    changes.current++;
    setRequests(items => items.some(item => item.id === saved.id) ? items.map(item => item.id === saved.id ? saved : item) : [saved, ...items]);
    setRequestId(saved.id);
    setFilter(saved.status === 'DONE' ? 'done' : 'open');
  }

  async function run(action: () => Promise<ServiceRequest>, message: string) {
    setSaving(true); setError(''); setSuccess('');
    try { apply(await action()); setSuccess(message); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The action could not be completed.'); return false; }
    finally { setSaving(false); }
  }

  async function claim() {
    if (request) await run(() => claimRequest(actorId, request.id), 'Request assigned to you. You can now update its status.');
  }
  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (request && reply.trim() && await run(() => replyToRequest(actorId, request.id, reply.trim()), 'Reply saved.')) setReply('');
  }
  async function changeStatus(event: FormEvent) {
    event.preventDefault();
    const status = request?.allowedActions.nextStatus;
    if (!request || !status) return;
    if (await run(() => requestApi(actorId, request.id, { status, note: note.trim() || undefined }), note.trim() ? 'Status and note saved.' : 'Status saved. History updated.')) setNote('');
  }
  // Asks the server directly, so a request outside this actor's access shows the real denial.
  async function openReference(event: FormEvent) {
    event.preventDefault();
    const id = reference.trim();
    if (!id) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const found = await requestApi(actorId, id);
      changes.current++;
      setRequests(items => items.some(item => item.id === found.id) ? items.map(item => item.id === found.id ? found : item) : [found, ...items]);
      setRequestId(found.id); setFilter(found.status === 'DONE' ? 'done' : 'open'); setReference(''); setReply(''); setNote('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open the request.'); }
    finally { setSaving(false); }
  }

  function explanation(item: ServiceRequest) {
    const actions = item.allowedActions;
    if (item.status === 'DONE') return isRequester ? 'This request is complete and closed. Submit a new request if you need more help.' : 'This request is complete and closed.';
    if (actions.claim) return 'Claim this request to take responsibility for it and update its status.';
    if (actions.nextStatus) return '';
    if (isRequester) return item.handlerId ? `${nameOf(item.handlerId)} is handling this request and will update its status.` : `Waiting for the ${departmentLabel(item.department)} team to claim this request.`;
    return item.handlerId ? `Assigned to ${nameOf(item.handlerId)}. You can read and reply, but only the assignee can update its status.` : '';
  }

  const requesters = actors.filter(item => item.role === 'requester');
  const handlers = actors.filter(item => item.role === 'handler');

  return <main>
    <Header actor={actor} />
    <div className="workspace-layout">
      <aside className="workspace-sidebar" aria-label="Workspace sidebar">
        <div className="testing-workspace">
          <p className="eyebrow">DEMO TESTING</p>
          <label htmlFor="testing-workspace">Testing workspace</label>
          <select id="testing-workspace" value={actorId} disabled={saving} onChange={event => {
            const next = actors.find(item => item.id === event.target.value);
            if (!next || next.id === actorId) return;
            setRequests([]); setRequestId(''); setLoading(true); setError(''); setSuccess(''); setReply(''); setNote(''); setReference(''); setFilter('open');
            setActorId(next.id);
            navigate(next.role === 'requester' ? 'prepare' : 'requests');
          }}>
            <optgroup label="Employees">{requesters.map(item => <option key={item.id} value={item.id}>{item.name} — employee</option>)}</optgroup>
            <optgroup label="Department handlers">{handlers.map(item => <option key={item.id} value={item.id}>{item.name} — {departmentLabel(item.department)} handler</option>)}</optgroup>
          </select>
          <small>Demo accounts, not real sign-in. Switch to test each role; actions save real changes to this demo.</small>
        </div>
        <p className="eyebrow sidebar-label">WORKSPACE</p>
        <nav className="workspace-nav" aria-label="Workspace">
          {isRequester && <button aria-current={view === 'prepare' ? 'page' : undefined} onClick={() => navigate('prepare')}><span aria-hidden="true">✎</span> Prepare a request</button>}
          <button aria-current={view === 'requests' ? 'page' : undefined} onClick={() => navigate('requests')}><span aria-hidden="true">▤</span> {isRequester ? 'My requests' : `${departmentName} inbox`}{!isRequester && unassignedCount > 0 && <span className="nav-count">{unassignedCount}</span>}</button>
        </nav>
        {view === 'requests' && <div className="sidebar-queue">
          <div className="queue-filter" role="group" aria-label="Filter requests">
            <button type="button" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Open <span>{openCount}</span></button>
            <button type="button" aria-pressed={filter === 'done'} onClick={() => setFilter('done')}>Done <span>{requests.length - openCount}</span></button>
          </div>
          {loading && <p className="sidebar-empty">Loading requests…</p>}
          {!loading && !queue.length && <p className="sidebar-empty">{filter === 'done' ? 'No completed requests yet.' : isRequester ? 'No open requests.' : `No open ${departmentName} requests.`}</p>}
          {!loading && !!queue.length && <div className="queue-list">{queue.map(item => <button key={item.id} className="queue-item" disabled={saving} aria-current={item.id === requestId ? 'true' : undefined} onClick={() => { setRequestId(item.id); setError(''); setSuccess(''); setReply(''); setNote(''); }}>
            <span className="queue-item-top"><strong>{item.id}</strong><span className={`queue-status ${item.status}`}>{statusLabel[item.status]}</span></span>
            <span className="queue-summary">{item.summary || item.description || 'Service request'}</span>
            <span className="queue-meta">{isRequester ? departmentLabel(item.department) : item.handlerId ? `Assigned to ${nameOf(item.handlerId)}` : 'Needs a handler'}</span>
          </button>)}</div>}
          <form className="reference-form" onSubmit={(event) => void openReference(event)}>
            <label htmlFor="reference">Open by reference</label>
            <div><input id="reference" value={reference} onChange={event => setReference(event.target.value)} placeholder="REQ-…" autoComplete="off" /><button type="submit" className="secondary" disabled={saving || !reference.trim()}>Open</button></div>
          </form>
        </div>}
        <p className="sidebar-note">{isRequester ? 'Only your own requests appear here.' : `Only ${departmentName} requests appear here.`}</p>
      </aside>
      <div className="workspace-content">
    {/* Remount intake on actor change so an earlier user's draft cannot carry over. */}
    <div hidden={view !== 'prepare' || !isRequester}><Intake key={actorId} actor={actorId} canSubmit={isRequester} onSubmitted={apply} /></div>
    <div hidden={view !== 'requests' && isRequester}>
    <section className="request" aria-labelledby="request-title" aria-busy={loading || saving}>
      <p className="eyebrow">{isRequester ? 'MY REQUESTS' : 'DEPARTMENT INBOX'}</p>
      <h2 className="tracking-title">{isRequester ? 'My requests' : `${departmentName} requests`}</h2>
      <p className="hint">{isRequester ? 'Follow requests you submitted and read replies from the team.' : 'Requests sent to your department. Claim an unassigned request to update its status.'}</p>
      <div className="row">
        <div><p className="eyebrow">SERVICE REQUEST</p><h2 id="request-title">{request?.id ?? 'Service request'}</h2></div>
        <button className="secondary" disabled={loading || saving} onClick={() => { setError(''); setSuccess(''); setRefresh((value) => value + 1); }}>Refresh</button>
      </div>
      {loading && <p role="status">Loading request…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {success && <p className="success" role="status">{success}</p>}
      {!loading && !request && <p className="hint">No requests to display yet.</p>}
      {request && <>
        <div className="request-overview">
          <p><strong>Department:</strong> {departmentLabel(request.department)}</p>
          <p><strong>Submitted by:</strong> {nameOf(request.requesterId)}</p>
          <p><strong>Assigned handler:</strong> {request.handlerId ? nameOf(request.handlerId) : 'Unassigned'}</p>
          <p><strong>Submitted:</strong> <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString()}</time></p>
        </div>
        {request.description && <><h3>Issue</h3><p className="issue-description">{request.description}</p></>}
        {request.summary && <p className="hint"><strong>Summary:</strong> {request.summary}</p>}
        <ol className="process-steps" aria-label="Request process">{STATUSES.map((status, index) => <li key={status} aria-current={request.status === status ? 'step' : undefined} className={index <= STATUSES.indexOf(request.status) ? 'reached' : ''}><span>{index + 1}</span>{statusLabel[status]}</li>)}</ol>
        <p className="status-line">Current status <strong className={`badge ${request.status}`} data-testid="current-status">{request.status}</strong></p>
        <div className="request-actions">
          {request.allowedActions.claim && <button disabled={loading || saving} onClick={() => void claim()}>Claim request</button>}
          {request.allowedActions.nextStatus && <form className="status-form" onSubmit={(event) => void changeStatus(event)}>
            <label htmlFor="status-note">{request.status === 'NEW' ? 'Note to the requester (optional)' : 'Resolution note (optional)'}</label>
            <textarea id="status-note" rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder={request.status === 'NEW' ? 'For example: I will look at this today.' : 'For example: Replaced the charger; the laptop now stays on.'} />
            <button type="submit" disabled={loading || saving}>{saving ? 'Saving…' : request.status === 'NEW' ? 'Start progress' : 'Mark done'}</button>
          </form>}
          {explanation(request) && <p className="hint boundary-note">{explanation(request)}</p>}
        </div>
        <h3>Conversation</h3>
        {request.comments.length ? <ol className="conversation" aria-label="Conversation">{request.comments.map(comment => <li key={comment.id}><div><strong>{nameOf(comment.authorId)}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></div><p>{comment.message}</p></li>)}</ol> : <p className="hint">No replies yet.</p>}
        {request.allowedActions.comment
          ? <form className="reply-form" onSubmit={(event) => void sendReply(event)}><label htmlFor="reply">{isRequester ? 'Add information or ask a question' : 'Reply to the requester'}</label><textarea id="reply" maxLength={2000} rows={3} value={reply} onChange={event => setReply(event.target.value)} placeholder="Write a message about this request" /><button type="submit" disabled={saving || !reply.trim()}>Send reply</button></form>
          : <p className="hint">The conversation is closed.</p>}
        <h3>Status history</h3>
        <ol className="history" aria-label="Status history">
          {request.history.map((event) => <li key={event.id}>
            <strong>{statusLabel[event.status]}</strong>
            <span>By {nameOf(event.changedBy)}</span>
            <time dateTime={event.changedAt}>{new Date(event.changedAt).toLocaleString()}</time>
          </li>)}
        </ol>
      </>}
    </section>
    </div>
      </div>
    </div>
    <footer>Operations Hub · Internal service requests · Demo data only</footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
