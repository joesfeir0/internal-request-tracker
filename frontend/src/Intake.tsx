import { useEffect, useRef, useState } from 'react';
import { submitRequest, suggestIntake, type Department, type IntakeCandidate, type ServiceRequest } from './api';

export function Intake({ actor, canSubmit, onSubmitted }: { actor: string; canSubmit: boolean; onSubmitted: (request: ServiceRequest) => void }) {
  const [text, setText] = useState('');
  const [candidate, setCandidate] = useState<IntakeCandidate | null>(null);
  const [department, setDepartment] = useState<IntakeCandidate['suggestedDepartment'] | ''>('');
  const [manualDepartment, setManualDepartment] = useState(false);
  // The manual department choice opens by itself when AI cannot help.
  const [manualOpen, setManualOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<ServiceRequest | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  const label = (code: string) => code === 'FINANCE' ? 'Finance' : code === 'UNDETERMINED' ? 'Needs clarification' : code;

  async function suggest() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(''); setCandidate(null); setCopyMessage('');
    if (!manualDepartment) setDepartment('');
    try {
      const result = await suggestIntake(actor, text, controller.signal);
      if (!controller.signal.aborted) {
        setCandidate(result);
        // A manual choice takes priority over the AI suggestion.
        if (!manualDepartment) setDepartment(result.suggestedDepartment);
      }
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Could not get a suggestion. Try again.'); setManualOpen(true); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function submit() {
    if (!text.trim() || !['IT', 'HR', 'FINANCE'].includes(department) || submitting || submitted) return;
    setSubmitting(true); setError('');
    try {
      const saved = await submitRequest(actor, text.trim(), (candidate?.summary || text.trim()).slice(0, 600), department as Department);
      setSubmitted(saved);
      onSubmitted(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit the request.'); }
    finally { setSubmitting(false); }
  }
  async function copyDraft() {
    if (!candidate) return;
    try {
      await navigator.clipboard.writeText(`Request draft (not submitted)\nDepartment: ${label(department || candidate.suggestedDepartment)}\nIssue: ${text}\nSummary: ${candidate.summary}\nMissing details: ${candidate.missingInformation.join('; ') || 'None suggested'}\nAI suggested next step: ${candidate.suggestedNextStep}`);
      setCopyMessage('Draft copied. Nothing submitted.');
    } catch { setCopyMessage('Could not copy. Select and copy the draft text instead.'); }
  }
  if (!canSubmit) return <section className="empty-access"><h2>Prepare a request</h2><p>Select the requester to prepare an issue. You can switch identity using the demo menu above.</p></section>;
  return <div className="intake">
    <div className="page-heading"><div><p className="eyebrow">AI-ASSISTED INTAKE</p><h2>What do you need help with?</h2><p>Describe the problem, review the suggested team, then submit the request.</p></div><span className="draft-tag">Draft workspace</span></div>
    <div className="intake-layout">
      <section className="compose" aria-labelledby="intake-title">
        <div className="step-heading"><span className="step">1</span><div><h3 id="intake-title">Describe your issue</h3><p>Use your own words. No need to know the department.</p></div></div>
        <form onSubmit={(event) => { event.preventDefault(); if (text.trim() && !busy) void suggest(); }}>
          <label htmlFor="issue">Describe your issue</label>
          <textarea id="issue" rows={7} maxLength={4000} required value={text} aria-describedby="issue-help"
            placeholder="For example: My laptop keeps shutting down during meetings. It started yesterday, even when it's plugged in."
            onChange={(event) => {
              // Editing invalidates the old suggestion and cancels any pending call.
              active.current?.abort(); setBusy(false); setCandidate(null); setError(''); setCopyMessage(''); setSubmitted(null); setText(event.target.value);
              if (!manualDepartment) setDepartment('');
            }} />
          <div className="field-meta"><small id="issue-help">Include what happened and when it started.</small><small>{text.length}/4000</small></div>
          <details className="optional-department" open={manualOpen} onToggle={(event) => setManualOpen(event.currentTarget.open)}>
            <summary>Already know the department? <span>Optional</span></summary>
            {!candidate && <DepartmentSelect value={department} busy={busy} onChange={(value) => { setDepartment(value); setManualDepartment(value !== ''); }} />}
            {candidate && <p>Review or change the department in your draft.</p>}
          </details>
          <div className="compose-actions"><button disabled={busy || !text.trim()} type="submit">{busy ? 'Preparing draft…' : 'Get AI suggestion'}<span aria-hidden="true"> →</span></button></div>
          <small className="privacy-note">Sent to Google Gemini. Use fictional examples; leave out passwords and confidential details.</small>
        </form>
        {error && <div className="error" role="alert"><strong>AI could not prepare a draft.</strong><p>{error}</p><p>Your text has been kept. You can still submit without AI: choose the department under “Already know the department?” above.</p></div>}
        <div className="department-guide" aria-label="Supported departments"><span>Teams we can suggest</span><p><strong>IT</strong> Devices, software &amp; access</p><p><strong>HR</strong> Leave, letters &amp; policies</p><p><strong>Finance</strong> Expenses, invoices &amp; payments</p></div>
      </section>
      <section className={`review-panel ${candidate ? 'has-candidate' : ''}`} aria-labelledby="review-title" aria-busy={busy}>
        <div className="step-heading"><span className="step">2</span><div><h3 id="review-title">Review and submit</h3><p>You choose the final department.</p></div></div>
        {!candidate && <div className="review-empty"><span className="draft-icon" aria-hidden="true">≡</span><h4>{busy ? 'Putting the details together' : 'Your draft will appear here'}</h4><p>{busy ? 'Finding a team, summarizing the issue and checking for missing details.' : 'Start with your issue. AI can suggest a department, a summary and any details still needed. You can also choose a department yourself.'}</p>{busy && <p role="status" className="loading-indicator">Preparing your suggestion…</p>}</div>}
        {candidate && <div className="candidate" role="region" aria-label="AI suggestion">
          <DepartmentSelect value={department} busy={busy} onChange={(value) => { setDepartment(value); setManualDepartment(true); setCopyMessage(''); }} reviewed />
          <p className="routing-note">AI suggested {label(candidate.suggestedDepartment)}.{manualDepartment && department !== candidate.suggestedDepartment ? ' Your choice has been kept.' : ' You can change it.'}</p>
          {department !== candidate.suggestedDepartment && <button type="button" className="text-button" onClick={() => { setDepartment(candidate.suggestedDepartment); setManualDepartment(false); setCopyMessage(''); }}>Use AI department</button>}
          <h4>Summary</h4><p className="draft-summary">{candidate.summary}</p>
          <div className="missing-details"><h4>{candidate.missingInformation.length ? 'Details to add' : 'Details look complete'}</h4>{candidate.missingInformation.length ? <><ul>{candidate.missingInformation.map((item,index) => <li key={index}>{item}</li>)}</ul><p>Add these to your issue and ask AI again before submitting, if you can.</p></> : <p>No additional details suggested. Check the summary for accuracy.</p>}</div>
          <h4>Suggested next step</h4><p>{candidate.suggestedNextStep}</p>
          <button type="button" className="secondary" onClick={() => void copyDraft()}>Copy draft</button>
          {copyMessage && <p role="status">{copyMessage}</p>}
        </div>}
        {!submitted && department && department !== 'UNDETERMINED' && text.trim() && <div className="submit-panel">
          <h4>Ready to send?</h4>
          <p>The request will be saved in the {label(department)} inbox. A handler there can claim it and reply.</p>
          <button type="button" disabled={submitting} onClick={() => void submit()}>{submitting ? 'Submitting…' : `Submit to ${label(department)}`}</button>
        </div>}
        {submitted && <div className="success" role="status"><strong>Request submitted: {submitted.id}</strong><p>Sent to {label(submitted.department)}. You can follow its status under My requests.</p><button type="button" className="secondary" onClick={() => { window.location.hash = 'requests'; }}>View my requests</button></div>}
        {!submitted && <p className="preview-label">AI advice is a draft. Nothing reaches a department until you press Submit.</p>}
      </section>
    </div>
  </div>;
}
function DepartmentSelect({ value, busy, onChange, reviewed = false }: { value: IntakeCandidate['suggestedDepartment'] | ''; busy: boolean; onChange: (value: IntakeCandidate['suggestedDepartment'] | '') => void; reviewed?: boolean }) {
  return <div className="draft-department"><label htmlFor="draft-department">Draft department</label><select id="draft-department" value={value} disabled={busy} onChange={(event) => onChange(event.target.value as IntakeCandidate['suggestedDepartment'] | '')}>
    {!reviewed && <option value="">Let AI suggest a department</option>}
    <option value="IT">IT</option><option value="HR">HR</option><option value="FINANCE">Finance</option><option value="UNDETERMINED">Not sure / needs clarification</option>
  </select></div>;
}
