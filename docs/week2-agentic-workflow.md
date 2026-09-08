# Week 2 / Day 6 - First verified backend behavior

## UNDERSTAND

Sources inspected before implementation:

- `README.md`: the repository was documentation only.
- `docs/product-spec.md`: the assumed New -> In Progress -> Done example, FR-10 (who and when), append-only history, and unresolved final lifecycle.
- `docs/architecture.md`: the backend checks changes; current status and history must be saved together (section 6, steps 5-6).
- `docs/data-model.md`: Request and Status Event, lifecycle invariants, and the deliberately duplicated current status (sections 3-5).
- `docs/decisions/ADR-001.md`: Option C stores both current status and history; both change or neither does.
- Supplied Day 6 PDF: one NestJS HTTP behavior, two valid transitions, two invalid transitions, a Week 1 invariant, and reproducible evidence.
- Supplied Day 5 PDF: inspect, bound the task, plan, implement, and review. Its ShopLite courier example is teaching context, not a feature request for this product.

Selected provisional states: `NEW`, `IN_PROGRESS`, `DONE`. Only `NEW -> IN_PROGRESS` and `IN_PROGRESS -> DONE` are allowed. All other transitions are rejected. These are bounded Week 1 assumptions selected for this milestone, not confirmed final business rules. Rejected, Cancelled, reopening, and their rules remain unresolved.

Invariant: every successful status change updates current status and appends a Status Event together. The last event agrees with current status. Existing events are never edited or deleted; rejection preserves the entire request and history.

Implementation area: `backend/`, initially with an in-memory seed `REQ-1001`, extended to three mock requests in the follow-up below. Each seed has a `NEW` event, so the invariant holds before any change too. This intentionally models only the request reference, status, and events needed for the slice.

Non-goals: frontend, database or durable persistence, authentication/identity integration, permissions, employee/department management, submission, assignment, comments, notifications/email, queues, WebSockets, analytics/reports, infrastructure, and additional lifecycle rules. `changedBy` is an explicit input, not proof of identity.

## DIRECT

Bounded task: implement `PATCH /requests/:id/status`, validate inputs and transitions in the backend, and prove the status/history invariant over HTTP.

Inspection found a clean Git working tree, the Week 1 documents, and no existing backend, package configuration, or repository AGENTS.md. Node.js and npm were available. The supplied PDFs were image-based, so their pages were rendered and visually read. Their classroom prompts were treated as reference material; the user's pasted request governed this implementation.

Before edits, the plan identified the exact source, configuration, verification, and documentation files and explained the lifecycle and invariant. Implementation proceeded under the user's explicit instruction to implement after inspection and planning.

Plan executed:

1. Add a small NestJS module, controller, service, and status model, compiled directly with TypeScript.
2. Seed one request and validate the ID, target status, and nonblank actor before checking the transition.
3. Build a replacement request containing both the new status and appended event, then commit it with one synchronous Map replacement. No asynchronous gap or separate history write exists. Return copies so callers cannot change stored events.
4. Add a small read endpoint to inspect results and unchanged state after rejection.
5. Run HTTP assertions, start the normal entry point, repeat the required cases, document results, and inspect the diff.

Why small: one module, one controller, one service, one in-memory collection, and Node's built-in test runner. No repository layer, database transaction framework, global CLI, or full application scaffold. Atomicity applies to this single-process in-memory operation; restarting loses all state. A future database would need its own transaction and durability guarantees.

Files and reasons:

| File | Purpose |
| --- | --- |
| `.gitignore` | Exclude installed dependencies, compiled output, and logs. |
| `backend/package.json` | Declare NestJS/TypeScript dependencies and build/start/test commands. |
| `backend/package-lock.json` | Lock the resolved dependency versions for `npm ci`. |
| `backend/tsconfig.json` | Enable strict TypeScript and Nest decorator metadata. |
| `backend/src/main.ts` | Start NestJS on loopback, port 3000 by default. |
| `backend/src/app.module.ts` | Wire the controller and service. |
| `backend/src/requests/request-status.ts` | Define the provisional allowed transitions and small Request/Status Event types. |
| `backend/src/requests/requests.controller.ts` | Route status changes and demonstration reads to the service. |
| `backend/src/requests/requests.service.ts` | Seed data, validate changes, return HTTP errors, and update status/history together. |
| `backend/test/requests.test.cjs` | Exercise actual HTTP behavior and compare persisted state before/after changes. |
| `README.md` | Update implementation status and provide installation, run, and verification examples. |
| `docs/week2-agentic-workflow.md` | Record scope, decisions, and observed evidence. |

## PROVE

Verified on 2026-09-06 with Node.js 24.12.0, npm 11.6.2, NestJS 11.2.3, and TypeScript 5.9.3. Initial dependency setup used `npm.cmd install`; it completed with zero reported vulnerabilities. Reproduce from the repository root:

```powershell
cd backend
npm.cmd ci
npm.cmd test
npm.cmd start
```

`npm.cmd test` compiles and starts a fresh Nest HTTP server on a temporary port, uses `fetch` with assertions, and closes it afterward. It does not need a separately running server. `npm.cmd start` builds and runs the normal entry point at `http://127.0.0.1:3000`. See README for the exact PowerShell manual request sequence; restart the demo server to reset the seed before repeating it.

Observed automated result: **11 tests passed, 0 failed** (the parent lifecycle test and 10 subtests). No lifecycle defect appeared in this run, so no defect/fix cycle was needed. PDF text extraction returned no text; using rendered pages resolved that inspection limitation before implementation.

The normal entry point was also started with `npm.cmd start`. A separate Node `fetch` check issued the following PATCH requests to that running server, then read the request after each one and asserted its state:

| Case (in execution order) | Expected | Actual |
| --- | --- | --- |
| `NEW -> DONE` | 409; NEW; 1 event; unchanged | 409; NEW; 1 event; full before/after equality |
| `NEW -> IN_PROGRESS` | 200; IN_PROGRESS; 2 events | 200; IN_PROGRESS; 2 events; old event unchanged |
| `IN_PROGRESS -> DONE` | 200; DONE; 3 events | 200; DONE; 3 events; old events unchanged |
| `DONE -> IN_PROGRESS` | 409; DONE; 3 events; unchanged | 409; DONE; 3 events; full before/after equality |
| Unknown request ID | 404; seed unaffected | 404; existing request still DONE with 3 events |

Observed successful event timestamps from that run: `2026-09-06T13:26:11.119Z` (IN_PROGRESS) and `2026-09-06T13:26:11.125Z` (DONE), both attributed to `handler-001`. IDs and timestamps vary on each run.

Invariant assertions checked:

- Every successful change appends exactly one event and preserves every earlier event.
- Latest history status equals current status, including after rejected changes.
- New events have a unique ID, correct request ID, supplied actor, and a valid timestamp within the HTTP operation.
- GET returns the same updated data as the successful PATCH response.
- Rejected calls preserve the complete request, including event IDs, actors, timestamps, and order.

Additional HTTP regression coverage rejected all seven disallowed pairs among the three selected states, unsupported statuses (including REJECTED and CANCELLED), malformed body shapes, missing fields, wrong types, and blank actors. Both PATCH and GET reject unknown IDs.

Final review: TypeScript compilation and HTTP verification passed. `git diff --check` passed. Reviewed the README diff and all added source/configuration/test/documentation files; generated output and dependencies are ignored. `git diff -- docs/product-spec.md docs/architecture.md docs/data-model.md docs/decisions/ADR-001.md` was empty. The Week 1 documents and architecture diagram were preserved. Changes are left uncommitted for user review; no remote submission or publication was performed.

## Follow-up: three mock requests (2026-09-07)

The user requested three mock records that can be viewed like a fake database in the terminal. The service now seeds `REQ-1001`, `REQ-1002`, and `REQ-1003`, all `NEW`, with independent initial history events. `GET /requests` returns the complete collection, including history, as a copy. The existing individual GET and status PATCH work for all three IDs. Restarting resets all three.

Changed the service to seed/list the records, the controller to expose the list, the HTTP tests to check collection contents and independent updates, and README to provide Git Bash list/table/PATCH examples. Lifecycle rules remain the same.

Ran `npm.cmd test`: **13 tests passed, 0 failed**, including the original lifecycle checks. New HTTP checks verified all three initial records and their event ownership; completing REQ-1001 leaves REQ-1002 and REQ-1003 unchanged; advancing REQ-1002 affects only its status/history; rejecting NEW -> DONE for REQ-1003 leaves the entire collection unchanged. `git diff --check` passed and the original Week 1 source documents remain unchanged.
