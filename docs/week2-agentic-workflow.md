# Week 2 / Day 6 - First verified backend behavior

> Historical record of v0.2 and its verification at that time. The in-memory store, restart-to-reset behavior, body-supplied changedBy, seed count and unchanged-document statements below describe that version. Code links now open the current implementation. Use [README](../README.md) for current setup, persistence, permissions and tests.

## UNDERSTAND

Sources read before starting the code:

- `README.md`: the repository was documentation only.
- `docs/product-spec.md`: the assumed New -> In Progress -> Done example, FR-10 (who and when), history that can only be added to, and the final status rules that still need to be decided.
- `docs/architecture.md`: the backend checks changes; current status and history must be saved together (section 6, steps 5-6).
- `docs/data-model.md`: Request and Status Event, rules that must always hold, and the decision to store the current status as well as its history (sections 3-5).
- `docs/decisions/ADR-001.md`: Option C stores both current status and history; both change or neither does.
- Supplied Day 6 PDF: one NestJS HTTP behavior, two valid transitions, two invalid transitions, a Week 1 rule that must always hold, and checks that can be repeated.
- Supplied Day 5 PDF: inspect the project, set the task limits, plan, implement, and review. Its ShopLite courier example is teaching context, not a feature request for this product.

Status values chosen for this version: `NEW`, `IN_PROGRESS`, `DONE`. Only `NEW -> IN_PROGRESS` and `IN_PROGRESS -> DONE` are allowed. All other transitions are rejected. These are Week 1 assumptions chosen for this milestone. They are not confirmed final business rules. The rules for Rejected, Cancelled and reopening requests still need to be decided.

The rule that must always hold: every successful status change updates the current status and adds a Status Event together. The last event matches the current status. Existing events are never edited or deleted. If a change is rejected, the whole request and its history stay unchanged.

Implementation area: `backend/`, initially with an in-memory seed `REQ-1001`, extended to three mock requests in the follow-up below. Each example starts with a `NEW` event, so the same rule holds before any change. This part of the model includes only the request reference, status and events needed for this feature.

Non-goals: frontend, database or durable persistence, authentication/identity integration, permissions, employee/department management, submission, assignment, comments, notifications/email, queues, WebSockets, analytics/reports, infrastructure, and additional lifecycle rules. `changedBy` is an explicit input, not proof of identity.

## DIRECT

Task for this milestone: implement `PATCH /requests/:id/status`, validate inputs and transitions in the backend, and check through HTTP that status and history follow the rule above.

Inspection found a clean Git working tree, the Week 1 documents, and no existing backend, package configuration, or repository AGENTS.md. Node.js and npm were available. The supplied PDFs were image-based, so their pages were rendered and visually read. Their classroom prompts were used as reference material. The work followed the request pasted by the user.

Before any edits, the plan listed the exact source, configuration, test and documentation files to change. It also explained the status flow and the rule that keeps status and history together. The user explicitly asked for implementation after the inspection and planning, so the coding started then.

Plan executed:

1. Add a small NestJS module, controller, service, and status model, compiled directly with TypeScript.
2. Seed one request and validate the ID, target status, and nonblank actor before checking the transition.
3. Build a new copy of the request with the new status and added event, then replace the stored Map entry in one synchronous step. There is no asynchronous gap or separate history write. Return copies so callers cannot change the stored events.
4. Add a small read endpoint to inspect results and unchanged state after rejection.
5. Run the HTTP checks, start the app normally, repeat the required cases, write down the results, and review the changes.

The implementation stays small: one module, one controller, one service, one collection in memory, and Node's built-in test runner. It has no repository layer, database transaction framework, global CLI, or full application scaffold. Saving status and history together is guaranteed only for this operation in one process, using memory. Restarting loses all the data. A future database would need transactions and a way to keep saved data after restarts.

Files and reasons:

| File | Purpose |
| --- | --- |
| `.gitignore` | Exclude installed dependencies, compiled output, and logs. |
| `backend/package.json` | Declare NestJS/TypeScript dependencies and build/start/test commands. |
| `backend/package-lock.json` | Lock the resolved dependency versions for `npm ci`. |
| `backend/tsconfig.json` | Enable strict TypeScript and Nest decorator metadata. |
| `backend/src/main.ts` | Start NestJS on loopback, port 3000 by default. |
| `backend/src/app.module.ts` | Connect the controller and service. |
| `backend/src/requests/request-status.ts` | Define the provisional allowed transitions and small Request/Status Event types. |
| `backend/src/requests/requests.controller.ts` | Route status changes and demonstration reads to the service. |
| `backend/src/requests/requests.service.ts` | Seed data, validate changes, return HTTP errors, and update status/history together. |
| `backend/test/requests.test.cjs` | Test real HTTP behavior and compare stored data before and after changes. |
| `README.md` | Update implementation status and provide installation, run, and verification examples. |
| `docs/week2-agentic-workflow.md` | Record the scope, decisions and test results. |

## PROVE

Verified on 2026-09-06 with Node.js 24.12.0, npm 11.6.2, NestJS 11.2.3, and TypeScript 5.9.3. Initial dependency setup used `npm.cmd install`; it completed with zero reported vulnerabilities. To repeat the checks, run these commands from the main repository folder:

```powershell
cd backend
npm.cmd ci
npm.cmd test
npm.cmd start
```

`npm.cmd test` compiles and starts a fresh Nest HTTP server on a temporary port, uses `fetch` to send requests and check the results, and closes it afterward. It does not need a separately running server. `npm.cmd start` builds and runs the normal entry point at `http://127.0.0.1:3000`. See README for the exact PowerShell manual request sequence; restart the demo server to reset the seed before repeating it.

Observed automated result: **11 tests passed, 0 failed** (the parent lifecycle test and 10 subtests). This run found no problem with the status rules, so no fix was needed. Text extraction from the PDFs returned nothing. Rendering the pages as images made it possible to read them before starting the code.

The normal entry point was also started with `npm.cmd start`. A separate Node `fetch` check issued the following PATCH requests to that running server, then read the request after each one and checked its saved values:

| Case (in execution order) | Expected | Actual |
| --- | --- | --- |
| `NEW -> DONE` | 409; NEW; 1 event; unchanged | 409; NEW; 1 event; full before/after equality |
| `NEW -> IN_PROGRESS` | 200; IN_PROGRESS; 2 events | 200; IN_PROGRESS; 2 events; old event unchanged |
| `IN_PROGRESS -> DONE` | 200; DONE; 3 events | 200; DONE; 3 events; old events unchanged |
| `DONE -> IN_PROGRESS` | 409; DONE; 3 events; unchanged | 409; DONE; 3 events; full before/after equality |
| Unknown request ID | 404; seed unaffected | 404; existing request still DONE with 3 events |

Observed successful event timestamps from that run: `2026-09-06T13:26:11.119Z` (IN_PROGRESS) and `2026-09-06T13:26:11.125Z` (DONE), both attributed to `handler-001`. IDs and timestamps vary on each run.

Checks for the status and history rule:

- Every successful change adds exactly one event and keeps every earlier event unchanged.
- Latest history status equals current status, including after rejected changes.
- New events have a unique ID, correct request ID, supplied actor, and a valid timestamp within the HTTP operation.
- GET returns the same updated data as the successful PATCH response.
- Rejected calls leave the complete request unchanged, including event IDs, actors, timestamps and order.

Additional HTTP regression tests checked that all seven disallowed changes among the three selected states were rejected. They also checked unsupported statuses (including REJECTED and CANCELLED), wrongly structured request bodies, missing fields, wrong types and blank actors. Both PATCH and GET reject unknown IDs.

Final review: TypeScript compilation and HTTP verification passed. `git diff --check` passed. Reviewed the README changes and all added source, configuration, test and documentation files; generated output and dependencies are ignored. `git diff -- docs/product-spec.md docs/architecture.md docs/data-model.md docs/decisions/ADR-001.md` was empty. The Week 1 documents and architecture diagram were preserved. Changes are left uncommitted for user review; no remote submission or publication was performed.

## Follow-up: three mock requests (2026-09-07)

The user requested three mock records that can be viewed like a fake database in the terminal. The service now seeds `REQ-1001`, `REQ-1002`, and `REQ-1003`, all `NEW`, each with its own starting history event. `GET /requests` returns the complete collection, including history, as a copy. The existing individual GET and status PATCH work for all three IDs. Restarting resets all three.

Changed the service to seed/list the records, the controller to return the list, the HTTP tests to check collection contents and independent updates, and README to provide Git Bash list/table/PATCH examples. The status rules stay the same.

Ran `npm.cmd test`: **13 tests passed, 0 failed**, including the original lifecycle checks. New HTTP checks verified all three initial records and which request each event belongs to; completing REQ-1001 leaves REQ-1002 and REQ-1003 unchanged; advancing REQ-1002 affects only its status/history; rejecting NEW -> DONE for REQ-1003 leaves the entire collection unchanged. `git diff --check` passed and the original Week 1 source documents remain unchanged.
