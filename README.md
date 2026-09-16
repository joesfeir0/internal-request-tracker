# Internal Request Tracker

Eurisko AI Academy v0.3: one integrated Service Request status flow using **React -> HTTP -> NestJS -> Prisma -> SQLite**.

The provisional lifecycle is `NEW -> IN_PROGRESS -> DONE`. Only the assigned handler may change status. Every successful change saves the status and a new history event together. Rejected changes preserve the record. Saved data survives backend restart.

## Install and run

Requires Node.js **22.12+** and npm. Verified with Node 24.12.0, npm 11.6.2, and PowerShell 7 on Windows. These commands use PowerShell 7. No global Nest CLI, external database, credentials, or `.env` file is required.

In a terminal at the cloned repository root:

```powershell
cd backend
npm ci
npm run db:setup
npm start
```

`npm ci` generates the Prisma client. Setup applies the committed migration and seeds missing requests without overwriting existing records. Start builds TypeScript and starts the backend at http://127.0.0.1:3000. Leave this terminal running.

In a second terminal at the repository root:

```powershell
cd frontend
npm ci
npm run build
npm run dev
```

Open [the React app](http://127.0.0.1:5173). Vite forwards `/requests` calls to port 3000. The frontend is one request screen with a selector for five examples, with no routing or login system.

## Exercise the flow

On a fresh/reset database:

1. The screen starts as `employee-001`, showing REQ-1001 as NEW with one history event.
2. Click **Start progress**. The backend returns 403; a readable denial appears and status/history stay unchanged.
3. Select `handler-001` under **Development actor**.
4. Click **Start progress**. Status becomes IN_PROGRESS, a handler-001 event appears, and the page confirms the save.
5. Reload. IN_PROGRESS and its history remain. Reload defaults the development actor to the requester, who can still read the saved result.
6. Select handler-001 again and click **Mark done** to finish the existing lifecycle.

The requester can attempt the action so the backend denial can be demonstrated. Hiding a button is not the authorization rule.

### Development identities

| Actor ID | Relationship and permission |
| --- | --- |
| `employee-001` | Requester of all five seed requests; can read them, cannot change official status. |
| `handler-001` | Assigned to REQ-1001, REQ-1004, and REQ-1005; can read and advance them. |
| `handler-002` | Assigned to REQ-1002; can read and advance it. |
| `handler-003` | Assigned to REQ-1003; can read and advance it. |

The UI and API expose all four actors. The backend resolves `X-Actor-Id` to this known list; it never accepts a client role claim or client-supplied `changedBy`.

### More examples

Select `employee-001` to see all five requests in **Service request**. To advance an example, select its handler below; the request selector then shows only that handler's assigned records. Each record has its own saved status and history.

| Additional example | Assigned handler | Try on a fresh example |
| --- | --- | --- |
| REQ-1002 | handler-002 | Start progress, then mark done. |
| REQ-1003 | handler-003 | Attempt Start progress as the requester, see denial, then switch to its handler and retry. |
| REQ-1004 | handler-001 | Start progress, refresh the request, and inspect the saved event. |
| REQ-1005 | handler-001 | Advance this request and confirm the other requests' histories remain independent. |

`npm run db:setup` adds missing examples without changing existing ones, including a completed REQ-1001. All five start at NEW only on a fresh database or explicit reset.

**Teaching identity is not production authentication.** Anyone can select a known actor ID. The organizational Identity Service remains an unimplemented assumption from the architecture draft.

## Database and reset

Development data is in `backend/prisma/dev.db`, ignored by Git. `DATABASE_URL` optionally selects another SQLite file; its parent directory must exist. Normal startup never seeds or resets data.

To repeat the demo, stop the backend with Ctrl+C, then run from `backend/`:

```powershell
npm run db:reset
npm start
```

Reset intentionally discards demo requests/history and recreates the five records as NEW. It is a local utility, not an API endpoint. Use `npm run db:setup` when you want to preserve existing data.

## HTTP contract and manual checks

| Endpoint | Successful result |
| --- | --- |
| `GET /requests` | 200; requests visible to the actor, including history |
| `GET /requests/:id` | 200; one visible request |
| `PATCH /requests/:id/status` | 200; updated request after the database transaction commits |

All routes require `X-Actor-Id`. PATCH accepts only `{ "status": "IN_PROGRESS" }` (or another supported status). The response is `{ id, status, history }`; each history event contains `id`, `requestId`, `status`, `changedBy`, and ISO `changedAt`, ordered oldest first. See [the delivery note](docs/week3-full-stack-delivery.md) for the full typed contract.

Errors are readable `{ statusCode, message, error }` objects:

| Code | Meaning |
| --- | --- |
| 400 | Malformed/unsupported input or extra fields, including changedBy |
| 401 | Missing/unknown actor |
| 403 | Requester cannot change official status |
| 404 | Request missing or not visible to the actor |
| 409 | Invalid lifecycle transition or stale write |
| 503 | Persistence save failed; no success response |

For manual checks, reset the database and start the backend first. In another PowerShell 7 terminal, run these in order:

```powershell
$base = 'http://127.0.0.1:3000'
$handler = @{ 'X-Actor-Id' = 'handler-001' }
$requester = @{ 'X-Actor-Id' = 'employee-001' }

Invoke-RestMethod "$base/requests/REQ-1001" -Headers $handler

# Requester denied: 403
Invoke-WebRequest "$base/requests/REQ-1001/status" -Method Patch -Headers $requester -ContentType 'application/json' -Body '{"status":"IN_PROGRESS"}' -SkipHttpErrorCheck

# Handler attempts NEW -> DONE: 409
Invoke-WebRequest "$base/requests/REQ-1001/status" -Method Patch -Headers $handler -ContentType 'application/json' -Body '{"status":"DONE"}' -SkipHttpErrorCheck

# Client-supplied changedBy is rejected: 400
Invoke-WebRequest "$base/requests/REQ-1001/status" -Method Patch -Headers $handler -ContentType 'application/json' -Body '{"status":"IN_PROGRESS","changedBy":"handler-001"}' -SkipHttpErrorCheck

# Still NEW, with the original history only
Invoke-RestMethod "$base/requests/REQ-1001" -Headers $handler

# Assigned handler succeeds: 200, IN_PROGRESS and two events
Invoke-RestMethod "$base/requests/REQ-1001/status" -Method Patch -Headers $handler -ContentType 'application/json' -Body '{"status":"IN_PROGRESS"}'
```

For restart proof: after that update, stop the backend with Ctrl+C and run `npm start` again in its terminal. Repeat the GET above. It must still show IN_PROGRESS and the same two events. This sequence was verified with full record equality, including event IDs and timestamps.

### Expected save failure

A failed persistence save becomes 503: **Could not save the status. Please try again.** React keeps its last confirmed status/history, clears old success feedback, and allows retry. A lost HTTP response instead asks the user to refresh because the save outcome is unknown.

The focused backend test makes the persistence boundary throw deterministically. There is no failure-toggle endpoint or SQLite-lock setup. Separate browser inspection verified the 503 display and retry behavior; the committed E2E journey uses real successful/denied requests throughout.

## Automated evidence and builds

From `backend/`:

```powershell
npm test
npm run test:integration
```

- `npm test`: **16 passing tests**, counting the HTTP parent test and its 13 subtests plus the focused authorization and save-failure tests. Preserves Week 2 lifecycle/history/independent-record checks.
- `npm run test:integration`: **1 passing test**, using real service + Prisma + isolated SQLite and a separate Prisma client to re-query saved status/history. Also checks invalid-transition rejection without mutation.

From `frontend/` (backend dependencies must already be installed):

```powershell
npx playwright install chromium
npm run test:e2e
```

**1 passing browser journey:** requester denial -> assigned-handler update -> visible history -> reload. The command builds the backend, starts the actual Nest app and Vite on ports 3001/5174, and closes them afterward. Those ports must be free. The normal demo can stay on 3000/5173.

Automated database tests use a fresh SQLite database in a unique operating-system temporary directory, then close connections and remove it. They do not reset development data. Playwright artifacts, dependencies, and build output are ignored by Git.

To build without starting servers, run this from each of `backend/` and `frontend/`:

```powershell
npm run build
```

Both builds were verified. Stop backend processes before reinstalling dependencies on Windows, since their Prisma DLL may be in use.

## Troubleshooting and scope

- **Cannot GET /** on port 3000: this is the API. Open the React app on 5173.
- **401 opening an API URL directly:** navigation does not send the actor header. Use React or the HTTP commands above.
- **Could not load the request:** check that the backend is running, then use **Refresh request**.
- **409 repeating an update:** it already advanced or the transition is invalid. Refresh, or explicitly reset the demo.
- **Missing tables:** run `npm run db:setup` from `backend/`.
- **Port in use:** stop the previous instance using that port before starting another.

Prisma 6.19.3 is pinned for the existing CommonJS backend. npm audit reports six high-severity findings in the Nest/Multer and Prisma configuration dependency chains; frontend audit reports zero. These remain unresolved; no forced major-version changes were made. No upload endpoint or untrusted Prisma configuration is used by this slice.

No production authentication, external services, department/account management, request submission, comments, extra statuses, deployment, or infrastructure is included.

## Project documents

- [Week 3 delivery](docs/week3-full-stack-delivery.md): slice, boundaries, contract, evidence, and assumptions.
- [Product specification](docs/product-spec.md), [architecture](docs/architecture.md), [data model](docs/data-model.md), and [ADR-001](docs/decisions/ADR-001.md): preserved Week 1 foundation.
- [Week 2 workflow](docs/week2-agentic-workflow.md): preserved historical implementation and verification. Its in-memory and changedBy examples describe v0.2; this README describes v0.3.
