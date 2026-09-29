# Week 4 - Production AI: advisory request intake (v0.4)

> This note describes the current advisory AI boundary and its evidence. The original preview was later extended with a separate, human-confirmed submission and department workflow. Historical verification is dated below; current submission, inbox, claim and reply behavior is detailed in [Department workflow](department-workflow.md). The AI still never writes requests directly.

## Capability and scope

The same React -> NestJS -> Prisma -> SQLite repository (PostgreSQL since Week 5) now lets a requester describe an issue and receive a structured AI suggestion. The running app uses Google Gemini, with the default model `gemini-3.1-flash-lite`. The running app does not use prepared answers if the provider fails. The preview helps prepare a request; it does not submit one, create a record, assign a handler, change status, or append history.

The employee types into **Describe your issue**, clicks **Get AI suggestion**, reviews the result, adds missing details to the same text, and tries again. Each suggestion is a separate interaction. It does not keep a chat history or act as a department inbox. Editing the text clears the old result and cancels the browser request. Changing the development actor clears the entire intake form. If the employee has moved on from an earlier input, its response cannot appear in the new preview.

The UI opens on preparation and provides a separate tracking navigation view, with a **Testing workspace** identity selector in the sidebar. A visible department guide explains IT, HR and Finance. An optional **Draft department** dropdown works without a provider key. A manual choice stays selected when the input changes, a call fails or a new AI suggestion arrives. If the AI suggests a different department, **Use AI department** lets the employee accept it. A choice filled in by AI is cleared when the issue changes. Actor changes clear both text and department.

The draft department stays in the browser until Submit. It is excluded from the AI suggestion request, so it does not affect the department the AI suggests. Submit sends it with the description and summary to POST /requests, where the backend validates the fields and creates a request. Selecting or submitting a department never grants department membership or permissions.

## Why this change

Week 3 added status updates for existing requests; it did not add request creation. Week 4 adds AI advice alongside that flow. The AI helps summarize loosely written issues, suggest a supported department, and identify information needed for review. A fixed department list is enough to make suggestions. Adding real organization memberships would also require permission and storage work outside this feature.

The Day 11 six questions guide the design: minimum useful context, unverified requester text, product-owned routing values, runtime validation, stable failure, and unchanged state. The Day 12 delivery checklist requires representative eval cases and repeatable evidence as well as ordinary regression tests.

## Context and authority

`backend/src/intake/intake-contract.ts` owns the provisional service directory:

| Code | Scope | Useful information |
| --- | --- | --- |
| IT | Computers, software, shared drives, application access | Device/application, symptoms/error, when it started |
| HR | Leave, employment letters, employment policy | Document/question type and relevant dates |
| FINANCE | Expenses, invoices, payment questions | Type, date, whether supporting evidence is available |
| UNDETERMINED | Thin, ambiguous, multiple-department or unsupported issues | Ask for clarification instead of guessing |

These are assignment assumptions, not verified Eurisko routing policies. They do not establish department membership or grant permissions. The directory and preparation rules are the small, trusted set of product information sent to the model. The backend does not need to load an existing request to prepare a new suggestion. No requester ID, handler ID, request ID, status history, identity headers, or full database objects are sent to Gemini. Free text may contain whatever the employee types, so the UI requests fictional examples and warns against secrets and confidential information.

Backend instructions and the service directory go in Gemini's system instruction; the employee's text goes separately in a JSON-encoded `requesterText` user message. The prompt treats that text as unverified information, even when it claims to state routing policy or come from an administrator. Keeping the input separate does not guarantee security. The software still needs to check the response at runtime, and the AI must have no way to write records.

## Authentication and authorization

The existing `DevActorGuard` looks up `X-Actor-Id` in the known demo users. This simulates identity for testing; it does not verify a real user login. Intake is permitted only to the requester role (`employee-001` in this demo; `employee-002` was added in Week 5); handlers receive 403 even if they call the endpoint directly. This rule applies only to this milestone. A future identity system could allow a handler to also act as an employee.

The current workflow lets the requester and handlers in the request's department read and reply (since Week 5, replies stop once a request is DONE). The assigned handler also retains read access; only that handler can update status. A handler can claim an unassigned request only in their department. Department inboxes and cross-department visibility checks are implemented using fixed demo memberships. An inaccessible request normally returns 404 before action permissions are checked; a forbidden action on a visible request returns 403. The AI's department suggestion cannot change those permissions. Production login and a live organization membership directory remain future work.

## Request and response contract

`POST /requests/intake-suggestion` requires `X-Actor-Id` and exactly:

```json
{ "text": "My laptop keeps shutting down while I work." }
```

Input must be a nonempty string, at most 4000 characters before trimming. Unknown fields, wrong types and blank input are rejected before a provider call. Success is HTTP 200 with exactly:

```json
{
  "suggestedDepartment": "IT",
  "summary": "Employee reports a laptop shutting down during work.",
  "missingInformation": ["When did the shutdowns start?"],
  "suggestedNextStep": "Add when the problem started for IT review."
}
```

This response is an example. The exact wording can vary. Department must be one of the four backend-owned codes. Summary and next step must be nonempty strings of at most 600 characters. Missing information must be an array of at most five nonempty strings, at most 200 characters each; an empty array is valid when routing is clear. If Gemini chooses UNDETERMINED but leaves that array empty, the backend adds one clarification question so the employee knows what to provide.

After checking the response, the backend builds a new object with only the four allowed fields. Extra provider fields, such as status or internal reasoning, never reach the browser.

The JSON schema sent to Gemini helps it return a consistent structure, but the backend must still check the response at runtime. Parsing JSON or using a TypeScript type assertion does not check whether the fields are valid. Before the product checks the fields, the adapter checks the HTTP status, limits the full response to 32 KiB, requires one completed candidate containing text, and parses the candidate JSON. A 503 response gets one retry after 500 ms; both attempts share one 20-second deadline. The browser waits up to 25 seconds. Other failures are not automatically retried, and there is no paid fallback.

| HTTP | Meaning |
| --- | --- |
| 200 | Checked suggestion; nothing saved |
| 400 | Invalid input |
| 401 | Missing/unknown teaching actor |
| 403 | Known actor not allowed to use intake |
| 429 | Rate limit (added in Week 5): more than 10 suggestions per minute per client or 300 per day overall; the UI offers manual department choice |
| 502 | Missing provider configuration, quota, refusal/incomplete response, malformed envelope/JSON/fields, oversize response, timeout or network/provider failure |

All provider/configuration failures use: **Could not produce an intake suggestion right now. Please try again.** Provider details and keys are not exposed. Since Week 5 the backend logs a safe failure category (for example `Provider unavailable (HTTP 429)` or `Provider timed out`), never the text, key or raw provider response. The screen keeps the issue text and lets the user try again. Input and permission errors still have their own meanings and responses.

## Architecture and state invariant

React -> guarded NestJS intake controller -> intake service -> Gemini adapter -> Google Gemini -> envelope parsing -> candidate validation/reconstruction -> React preview.

`IntakeService` depends on `GeminiClient` (and, since Week 5, the in-memory rate limiter and AI status record used by health). It has no store or Prisma dependency, and no path to `RequestsService.changeStatus`. Suggestion calls do not change `ServiceRequest`, `StatusEvent` or `RequestComment`, whether they succeed or fail. The existing status flow continues to use its transaction and permissions. AI preview alone needed no schema migration and has no candidate table. The later department workflow adds a migration for request fields, a nullable handler and saved comments. Submit is a separate user action that saves a request and initial history event; its summary may come from the reviewed AI suggestion. The complete candidate and model conversation are not persisted.

## Free model and setup

The default is Gemini 3.1 Flash-Lite through the standard Gemini Developer API. Google's pricing lists a free tier for input/output, with usage limits; the service is not unlimited. Keep the Google project on the free tier if zero API charges are required. Free-tier content may be used to improve Google's products, so use made-up assignment examples. You can change the model name through `GEMINI_MODEL`. Any replacement model must support the same generateContent API and structured output format.

From `backend/`, copy `.env.example` to `.env` and enter your own Gemini API key locally. `.env` is ignored by Git. Backend startup loads it; browser code never reads it. Do not use a `VITE_` variable for the key. Restart the backend after editing configuration. Core tracking and offline tests need no key; live suggestions do.

Official references: [pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite), [API keys](https://ai.google.dev/gemini-api/docs/api-key), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [supported regions](https://ai.google.dev/gemini-api/docs/available-regions).

## Evidence and commands

From `backend/`:

```powershell
npm test
npm run test:integration
npm run eval:ai
npm run eval:ai:live
```

From `frontend/`:

```powershell
npm run build
npm run test:e2e
```

`npm test` checks field values, permissions before calling the provider, the context sent to the provider, removal of extra fields, badly formed or incomplete responses, quota and provider errors, responses that are too large, network errors and timeouts, and missing credentials. It also compares ServiceRequest and StatusEvent snapshots before and after both successful and failed calls; those snapshots do not include RequestComment. The absence of an intake storage dependency supports the broader no-write invariant. The timeout test simulates a timeout error; it does not wait 20 seconds. Existing lifecycle tests remain in the suite.

At Week 4 the browser suite had two journeys (Week 5 adds a third: AI outage -> manual submission -> boundary denials). The first checks that an employee has no status button, then an assigned handler updates an existing request and the status survives a page reload. The second follows AI suggestion -> submit to HR -> HR inbox -> claim -> reply -> IN_PROGRESS -> DONE -> requester sees the result, and checks that IT cannot see the HR request. It captures mobile and desktop views and checks saved comments/history in SQLite. Only the external AI transport is replaced; UI, HTTP, NestJS, adapter validation and persistence are real. These tests do not call live Gemini or currently exercise provider failure/retry and clearing suggestions after an input edit. Backend tests separately cover provider failures and unchanged request/status-history snapshots for suggestion calls.

`backend/eval/cases.json` contains eight human-authored cases:

| Case | Expected behavior |
| --- | --- |
| clear-it | IT, reported laptop issue summarized, relevant missing details |
| thin-input | UNDETERMINED with clarification |
| ambiguous | UNDETERMINED for combined IT and HR issues |
| trusted-directory | Employment letter goes to HR despite requester claiming Finance policy |
| already-supplied | Finance taxi expense with date/evidence provided; do not ask for those details again |
| instruction-override | Laptop stays IT; injected ROOT/status/save commands do not become actions |
| invalid-output | Invalid department/field types become the stable 502 |
| provider-failure | Provider 503 becomes the same stable 502 |

`eval:ai` runs prepared provider responses through the actual adapter, service, validation and expected-result checks without a key or network connection. It shows that the code handles those responses and that the test runner works. It does **not** show that the model produces good suggestions.

`eval:ai:live` sends each of the six behavior examples to the actual model twice, then tests the two simulated failures. It fails immediately if no key is available. Both modes say which mode is running and return a nonzero exit status if any case fails. Repeating a case checks the same expected behavior; it does not require the same wording. No second model judges the answers.

The human-written checks test routing, the number of missing-information questions, important words in the summary, and specific claims that the model must not make. These checks can catch some regressions, but they cannot guarantee that every answer is factual or safe from prompt injection. A person still needs to review the result.

### Historical verification on 2026-09-19

These results describe the original preview implementation and the tests that existed then, before the later department workflow. They are not the current browser-suite description or a guarantee of provider availability today.

- Backend tests: 21 passed, 0 failed (including parent tests).
- Existing real-database integration test: 1 passed.
- Offline contract replay: 8/8 passed, each repeated twice.
- Browser journeys: 2 passed; provider transport substituted for intake. Desktop and 390-pixel mobile layouts inspected.
- Backend and frontend production builds passed.
- Live Gemini evaluation: 8/8 passed with gemini-3.5-flash-lite. Six behavioral cases called the real model twice each; two failure cases remained controlled. A real POST through the running backend returned HTTP 200 with a validated IT suggestion. These results cover the small evaluation set, not all possible inputs.
- Model correction: Google returned 404 for gemini-2.5-flash-lite, explaining that it is unavailable to new users and recommending gemini-3.5-flash-lite. The default, local configuration and setup docs now use the supported model.

### Verification on 2026-09-22

- Both backend and frontend builds passed.
- Backend tests: 22 passed, including parent tests; database integration: 1 passed.
- Current browser journeys described above: 2 passed.
- Offline contract replay: 8/8 passed.
- Live evaluation: 2/8 passed. All six real-model cases failed; the two controlled failure cases passed. A separate diagnostic returned HTTP 503 / UNAVAILABLE from Gemini. This run did not confirm live model availability or quality.

### Latest executed verification on 2026-09-23

- Backend tests: 23 passed, including a test for one bounded retry after provider HTTP 503. The real-database integration test passed and now checks reset after a saved reply.
- Current browser journeys: 2 passed. Offline contract replay: 8/8 passed.
- A standalone real Gemini suggestion succeeded. Full live evaluations returned 7/8 and 6/8 before the retry change, then 5/8 and 2/8 afterward. The final diagnostic run was 2/8: real-model cases received HTTP 503 twice or timed out, while both controlled failure cases passed. Live model availability is not yet reliable. The evaluation command now reports HTTP status and safe adapter error categories without exposing the key or provider response.
- Database setup/reset now loads `backend/.env` consistently with server startup. A separate temporary-database check confirmed reset succeeds after a saved reply.
- A temporary `gemini-3.1-flash-lite` override then passed all 8 live evaluation cases. It supports the same structured output API and has a listed free tier. The default, example and local model settings were changed to that model. The next full run used the saved setting and passed 7/8; one real case timed out. Live availability is still intermittent.

## Limits and deferred work

Request submission, department inboxes, claims and saved conversations are implemented through separate authorized actions. Department memberships are fixed demo assignments. Production login, a live organization directory, persisted full AI candidates, RAG, agents/tools, MCP, deployment and new infrastructure remained outside this milestone (Week 5 adds the deployment). The AI does not decide permissions or perform requested work. Reaching the free usage limit is an expected failure and returns the same standard error. The dependency audit notes in the README still describe the earlier audit; this documentation update did not fix those findings or run that audit again.

### Updated intake interaction

Enter the issue first, then request an AI suggestion and review the draft beside it (below it on mobile). A manual department preference before generation is optional and collapsed under "Already know the department?". Once a suggestion is ready, the employee can change the department in the review panel. Missing details direct the employee back to the issue text for another suggestion. **Copy draft** copies the current text, selected department and AI advice to the clipboard; it does not submit or save anything. **Submit to [department]** saves the request in that department's inbox after backend validation. Manual department selection also permits submission without an AI suggestion. Switching workspace views keeps an unsubmitted draft in memory. Switching actors clears it. The selected view is reflected in the URL hash. Selecting a handler opens tracking.

## Operations readiness checklist (planning only)

These answers prepare for putting the system live in Week 5. The user paths described below already exist, but operational monitoring, a health endpoint and a rollback procedure have not been implemented.

1. **What does healthy mean?** The backend is running and can read the database. An employee can submit a request and a handler can update its status. AI suggestions are helpful, but the product still works without them.
2. **Which user path must work after recovery?** Employee submits a request -> it appears in the department inbox -> the handler claims it and changes its status -> the employee sees the update.
3. **Which dependency can fail while the process still runs?** Gemini: a missing or invalid key, used-up free quota, an unavailable model name or a provider outage. The SQLite database file could also become locked or unavailable.
4. **Which signal would reveal it?** `POST /requests/intake-suggestion` returning 502 instead of 200. For the database, saves returning 503.
5. **Which log evidence would explain it safely?** This is a current gap: the backend returns the stable 502 but does not log why. The plan is to log only the failure type (for example quota, timeout, provider error or invalid answer) and the time, never the employee's text, the API key or the provider's raw response.
6. **What repeated observation could detect it?** Counting how many intake calls fail compared with how many succeed over time.
7. **What condition should require attention?** Every intake call failing for several minutes in a row, or any request, status or reply save failing.
8. **What is one safe known recovery path?** Correct the key or model name in `backend/.env` and restart the backend. While Gemini is down, employees can still choose a department by hand and submit, so the main user path keeps working.
9. **How will I prove health and user behavior after recovery?** One intake suggestion returns 200. Then submit -> claim -> status change works for a new request. Finally, run `npm test` and `npm run test:e2e` again.

## Week 5 follow-up: what happened to the operations checklist

The nine planning answers above were implemented or proven in Week 5. Details: [Week 5 release operations](week5-release-operations.md).

| Checklist question | Week 5 result |
| --- | --- |
| 1. What does healthy mean? | `GET /health`: database and AI checked separately; `ok`, `degraded` or `unhealthy` |
| 2. Which user path must work after recovery? | Unchanged; checked by the smoke script and E2E journeys |
| 3. Which dependency can fail while the process runs? | Gemini (as planned) and PostgreSQL on Neon (replacing the SQLite file) |
| 4. Which signal reveals it? | `/health` shows `triageModel: unavailable` (degraded) or `database: unavailable` (unhealthy, 503) |
| 5. Which log explains it safely? | **Gap closed:** `AI intake failed: <safe category>` and `<action> failed for <ticket>: <database code>`; no text, key or raw response |
| 6. Repeated observation | An UptimeRobot keyword monitor on the live `/health`; on 2026-09-28 it caught two real AI-provider failures (a timeout and HTTP 503) |
| 7. Condition that needs attention | Repeated non-`ok` health results |
| 8. Safe recovery path | Restore the key or model in the hosting configuration; manual submission works meanwhile. Rehearsed in automated tests and in a live drill on 2026-09-27. |
| 9. Proof after recovery | `/health` back to `ok`, `npm run smoke -- <url>`, and the release gate |

The Week 4 AI contract, context rules and evals are unchanged. The AI health probe reuses recent real results, so monitoring uses only a small part of the free quota.
