# Internal Request Tracker

Operations Hub tracks service requests, helps employees prepare them with **AI-assisted Request Intake**, and sends them to departments. It uses React -> HTTP -> NestJS -> Prisma -> SQLite. The backend connects to Gemini.

The status flow used for now is `NEW -> IN_PROGRESS -> DONE`. Only the assigned handler may change status. Every successful change saves the new status and a history event together. If a change is rejected, the record stays the same. Saved data is still there after the backend restarts.

## Install and run

Requires Node.js **22.12+** and npm. Verified with Node 24.12.0, npm 11.6.2, and PowerShell 7 on Windows. These commands use PowerShell 7. Core tracking and offline tests need no global Nest CLI, external database, credentials, or `.env` file. Live AI suggestions require a Gemini API key; see the AI setup below.

Open a terminal in the main folder of the cloned repository:

```powershell
cd backend
npm ci
npm run db:setup
npm start
```

`npm ci` generates the Prisma client. Setup runs the database migration stored in the repository and adds any missing example requests without replacing existing records. The start command builds TypeScript and starts the backend at http://127.0.0.1:3000. Leave this terminal running.

In a second terminal at the repository root:

```powershell
cd frontend
npm ci
npm run build
npm run dev
```

Open [the React app](http://127.0.0.1:5173). Vite forwards `/requests` calls to port 3000. The frontend has AI-assisted intake, a separate submit action, department inboxes, conversations, and the five seeded examples. The actor selector lets you switch users for the demo. It does not provide real login.

## AI intake: setup and use

The requester types an issue and clicks **Get AI suggestion**. The backend calls Gemini, checks its response, and returns a suggested department, summary, missing details and next step. Edit the issue to add details and try again. The AI gives advice for the employee to review. After reviewing the draft, the employee can choose to submit it to IT, HR or Finance. That action creates a real request for the selected department. Existing request status/history remain unchanged.

The screen opens on **Prepare a request**, with **My requests** in the workspace sidebar. Handlers see their own **Department inbox** and a visible list of requests, with unassigned requests first. On phones this list sits above the request details. The visible **Testing workspace** selector switches between Employee, IT, HR and Finance demo roles.

IT, HR and Finance descriptions are visible before any AI call. The **Draft department** dropdown is optional: choose manually or let AI populate it. Your manual choice stays selected when you edit the issue, encounter an error or get a new suggestion; **Use AI department** lets you accept a different recommendation.

AI-filled choices clear when the issue changes. Switching actors clears the whole draft. The choice routes a request only after the employee presses **Submit**; it never grants department access.

The default model is `gemini-3.1-flash-lite`. Google lists a [free API tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite), with usage limits. Use a free-tier project if you require zero API charges. Free-tier content may be used to improve Google's products: use fictional assignment issues, not confidential employee data.

Get an API key through [Google AI Studio](https://aistudio.google.com/apikey). From `backend/`, create the local configuration **once**:

```powershell
Copy-Item .env.example .env
```

Edit `.env` locally and put your key after `GEMINI_API_KEY=`. Leave `GEMINI_MODEL=gemini-3.1-flash-lite` unless intentionally choosing another compatible model. Do not overwrite an existing `.env`; edit it instead. Backend startup loads this file; restart after editing it. The file is Git-ignored. Never commit the key or put it in frontend / `VITE_` configuration.

Start both servers using the commands above, select `employee-001`, and enter an issue such as "My laptop keeps shutting down while I work." Intake is requester-only in this demo. IT, HR, FINANCE and UNDETERMINED are suggestion values controlled by the backend. These values do not make someone a department member or give them access. The demo now includes separate department inboxes, request claiming, replies and status updates. Choosing an identity is still a way to demonstrate the system; it is not real sign-in.

Without a key, or when Gemini is unavailable, the screen shows a retry message and keeps your text. There is no fake-answer or paid fallback in the running app. Editing input clears the previous preview; changing actors clears the intake form.

From `backend/`:

```powershell
npm run eval:ai
npm run eval:ai:live
```

- `eval:ai`: eight prepared response examples run through the real adapter and validator, each repeated twice. This needs no model call or key. It checks how the code handles responses, but does not measure model quality.
- `eval:ai:live`: six cases that check real Gemini responses, each run twice, plus two simulated failures. This needs your key and uses part of the free-tier allowance. It reports pass or fail; the wording does not have to match the prepared examples exactly.

For the full context, permissions, output limits, test cases and results, see [Week 4 production AI](docs/week4-production-ai.md).

## Exercise the flow

After database setup, this journey creates a new request; no reset is needed:

1. Open http://127.0.0.1:5173 without a URL hash. The app starts as Employee (`employee-001`) on **Prepare a request**.
2. Enter a fictional issue such as "I need an employment letter by Friday." Click **Get AI suggestion** and review the result. Choose HR as the final department. If AI is unavailable, expand **Already know the department?** and choose HR manually.
3. Click **Submit to HR**. Note the generated request reference, then click **View my requests**. The saved request is NEW and unassigned, with its first history event.
4. Choose **HR department** under **Testing workspace**, then select that reference from the HR inbox. Click **Claim request**.
5. Add a reply using **Send reply**, then click **Start progress**. Confirm IN_PROGRESS and the added history event.
6. Click **Mark done**. Confirm DONE and a third history event.
7. Switch to **Employee**, open **My requests**, and select the same reference. Confirm the reply and DONE status. Reload and reselect that reference to verify the saved result is still available; the selected request itself is not preserved across reloads.

Employees do not see status-change buttons. The backend independently rejects unauthorized status changes with 403; use the manual HTTP checks below to demonstrate that denial.

### Development identities

| Actor ID | Relationship and permission |
| --- | --- |
| `employee-001` | Requester of all five seed requests; can read them, cannot change official status. |
| `handler-001` | Assigned to REQ-1001, REQ-1004, and REQ-1005; can read and advance them. |
| `handler-002` | Assigned to REQ-1002; can read and advance it. |
| `handler-003` | Assigned to REQ-1003; can read and advance it. |

The UI and API expose all four actors. The backend looks up `X-Actor-Id` in this known list. It does not accept a role claimed by the client or a `changedBy` value sent by the client.

### More examples

Select `employee-001` to see all five requests in **My requests**. To advance an example, choose its department under **Testing workspace**; that handler's sidebar inbox shows only requests routed to their department. Select a request from the list to see its details, conversation and saved history.

| Additional example | Assigned handler | Try on a fresh example |
| --- | --- | --- |
| REQ-1002 | handler-002 | Start progress, then mark done. |
| REQ-1003 | handler-003 | View as Employee and confirm no status button appears; switch to Finance department to start progress. |
| REQ-1004 | handler-001 | Start progress, refresh the request, and inspect the saved event. |
| REQ-1005 | handler-001 | Advance this request and confirm the other requests' histories remain independent. |

`npm run db:setup` adds missing examples without changing existing ones, including a completed REQ-1001. All five start at NEW only on a fresh database or explicit reset.

**The demo identity selector is not a real login system.** Anyone can select a known actor ID. The architecture draft assumes an organizational Identity Service, but it has not been connected.

## Database and reset

Development data is in `backend/prisma/dev.db`, ignored by Git. `DATABASE_URL` optionally selects another SQLite file; its parent directory must exist. Both the backend and database commands load `backend/.env`. You can also set `DATABASE_URL` in the PowerShell environment (`$env:DATABASE_URL = 'file:C:/absolute/path/demo.db'`); a shell value takes precedence over `.env`. Normal startup never seeds or resets data.

To repeat the demo, stop the backend with Ctrl+C, then run from `backend/`:

```powershell
npm run db:reset
npm start
```

Reset deletes all replies, history and requests in the selected database, then creates the five records again as NEW. It is a local utility, not an API endpoint. Use `npm run db:setup` when you want to preserve existing data.

## HTTP contract and manual checks

| Endpoint | Successful result |
| --- | --- |
| `GET /requests` | 200; requests visible to the actor, including history |
| `GET /requests/:id` | 200; one visible request |
| `POST /requests` | 201; new request with NEW status, no handler and its first history event |
| `POST /requests/:id/claim` | 201; request assigned to the department handler who claimed it |
| `POST /requests/:id/comments` | 201; updated request including the saved reply |
| `PATCH /requests/:id/status` | 200; updated request after the database transaction commits |
| `POST /requests/intake-suggestion` | 200; validated advisory candidate, no database changes |

All routes require `X-Actor-Id`. PATCH accepts only `{ "status": "IN_PROGRESS" }` (or another supported status). Submission accepts exactly `{ "description": "your issue", "summary": "request summary", "department": "HR" }`: nonblank description up to 4000 characters, nonblank summary up to 600, and IT, HR or FINANCE. Claim needs no body. A reply accepts exactly `{ "message": "your reply" }`, nonblank and up to 2000 characters.

Request reads and successful writes return `{ id, requesterId, handlerId, department, description, summary, createdAt, status, history, comments }`; GET /requests returns an array of these objects. `handlerId` is null until assigned. Each history event contains `{ id, requestId, status, changedBy, changedAt }`, ordered oldest first. Each comment contains `{ id, requestId, authorId, message, createdAt }`. Dates are ISO strings. See [the current TypeScript contract](backend/src/requests/request-status.ts) and [Department workflow](docs/department-workflow.md) for permissions and behavior. The Week 3 note preserves the older contract.

Errors are readable `{ statusCode, message, error }` objects:

| Code | Meaning |
| --- | --- |
| 400 | Malformed/unsupported input or extra fields, including changedBy |
| 401 | Missing/unknown actor |
| 403 | Known actor cannot perform the action: for example, a requester changing status or claiming, an unassigned handler changing a visible request's status, or a handler submitting a request or calling intake |
| 404 | Request missing or not visible to the actor |
| 409 | Invalid lifecycle transition, already assigned claim, or an update based on old data |
| 503 | Saving to the database failed; no success response |
| 502 | Intake provider/configuration failure; stable message, no database changes |

Visibility is checked before claim, reply and status permissions. A handler trying to access another department's request normally receives 404; forbidden actions on a visible request receive 403. Only the assigned handler can change status. The requester, handlers in the request's department and the assigned handler can read and reply; only a handler in that department can claim an unassigned request. Direct access retains the assigned-handler exception even if its department differs, while the handler list is filtered strictly by department. Current submission and claim routes do not create such cross-department assignments.

Intake POST accepts only `{ "text": "your issue" }`, text that is not blank and is no longer than 4000 characters. Its response is `{ suggestedDepartment, summary, missingInformation, suggestedNextStep }`. Unknown/missing actors receive 401; handlers receive 403 for intake; invalid input receives 400. All provider/configuration failures receive 502 with **Could not produce an intake suggestion right now. Please try again.**

For manual status checks, reset the database and start the backend first. In another PowerShell 7 terminal, run these in order:

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

For restart proof: after that update, stop the backend with Ctrl+C and run `npm start` again in its terminal. Repeat the GET above. It must still show IN_PROGRESS and the same two events. The complete records were compared to check this sequence, including event IDs and timestamps.

### Expected save failure

If saving to the database fails, the API returns 503: **Could not save the status. Please try again.** React keeps its last confirmed status/history, removes the old success message, and lets the user retry. If the HTTP response is lost, the screen asks the user to refresh because it cannot tell whether the save succeeded.

The backend test replaces the save operation with one that always throws an error. There is no failure-toggle endpoint or SQLite-lock setup. A separate manual browser check on 2026-09-14 verified the 503 message and retry behavior. The current E2E suite uses real requests for successful workflows and checks that employees have no status button. HTTP/backend tests prove the 403 denial; the current browser suite does not trigger that denial or a save failure.

## Automated evidence and builds

From `backend/`:

```powershell
npm test
npm run test:integration
```

- `npm test`: **23 passing tests**, including parent tests. Keeps the original status and history checks, and adds checks for intake input, permissions, sending only the needed context, a bounded retry after provider HTTP 503, simulated provider failures, and ServiceRequest/StatusEvent snapshots that show those records stayed unchanged during suggestion calls. Those snapshots do not include RequestComment.
- `npm run test:integration`: **1 passing test**, using the real service, Prisma and a separate SQLite test database. A second Prisma client reads the saved status and history again. The test also checks that a rejected status change leaves the data unchanged and that reset removes replies before deleting requests.

From `frontend/` (backend dependencies must already be installed):

```powershell
npx playwright install chromium
npm run test:e2e
```

**2 passing browser journeys:** existing request -> employee has no status button -> assigned-handler update -> history -> reload; and AI suggestion -> submit to HR -> HR inbox -> claim -> reply -> IN_PROGRESS -> DONE -> employee sees the saved result. The second journey checks that IT cannot see the HR request and captures desktop/mobile views. It replaces only the connection to the external provider; it does not call live Gemini. The current browser suite does not test provider failure/retry or clearing suggestions after an input edit. The command builds the backend, starts the actual Nest app and Vite on ports 3001/5174, and closes them afterward. Those ports must be free. The normal demo can stay on 3000/5173.

Automated database tests create a fresh SQLite database in its own temporary folder, then close the connections and remove it. They do not reset development data. Playwright artifacts, dependencies, and build output are ignored by Git.

To build without starting servers, run this from each of `backend/` and `frontend/`:

```powershell
npm run build
```

Latest executed verification, 2026-09-23: backend build and 23 tests, one real-database integration test, two browser journeys and 8/8 offline eval cases passed. A separate database command check confirmed setup and reset after a saved reply. With `gemini-3.1-flash-lite`, one full live evaluation passed 8/8 and the next passed 7/8 because a real case timed out. Earlier same-day runs with `gemini-3.5-flash-lite` also had HTTP 503 and timeouts, even with one bounded retry. Live service availability is still intermittent. Earlier results are retained in [Week 4 production AI](docs/week4-production-ai.md). Stop backend processes before reinstalling dependencies on Windows, since their Prisma DLL may be in use.

## Troubleshooting and scope

- **Cannot GET /** on port 3000: this is the API. Open the React app on 5173.
- **AI suggestion unavailable:** check backend `.env` has your key, restart the backend, and confirm model access/free-tier quota. The app deliberately hides provider details. Core tracking still works.
- **401 opening an API URL directly:** navigation does not send the actor header. Use React or the HTTP commands above.
- **Could not load the request:** check that the backend is running, then use **Refresh request**.
- **409 repeating an update:** it already advanced or the transition is invalid. Refresh, or explicitly reset the demo.
- **Missing tables:** run `npm run db:setup` from `backend/`.
- **Port in use:** stop the previous instance using that port before starting another.

Prisma is kept at version 6.19.3 to work with the existing CommonJS backend. The prior Week 3 audit reported six high-severity findings in the Nest/Multer and Prisma configuration dependency chains and zero for the frontend; this was not re-audited during Week 4. These problems are still unresolved. No major-version updates were forced. No upload endpoint or untrusted Prisma configuration is used by this slice.

No production authentication, live organization directory, deployment, or new infrastructure is included. Gemini is the one external runtime integration. Department memberships use fixed assignments for the demo.

## Project documents

- [Department workflow](docs/department-workflow.md): submission, inboxes, claims, replies and permissions.
- [Week 4 production AI](docs/week4-production-ai.md): intake contract, provider setup, assumptions, evals and evidence.
- [Week 3 delivery](docs/week3-full-stack-delivery.md): slice, boundaries, contract, evidence, and assumptions.
- [Product specification](docs/product-spec.md), [architecture](docs/architecture.md), [data model](docs/data-model.md), and [ADR-001](docs/decisions/ADR-001.md): Week 1 foundation; product, architecture and data-model docs include explicit Week 4 amendments.
- [Week 2 workflow](docs/week2-agentic-workflow.md): preserved historical implementation and verification. Its in-memory and changedBy examples describe v0.2; this README describes v0.4.

### Updated intake interaction

Enter the issue first, then request an AI suggestion and review the draft beside it (below it on mobile). A manual department preference before generation is optional and collapsed under "Already know the department?". Once a suggestion is ready, you can change the department in the review panel. Missing details direct the employee back to the issue text for another suggestion. **Copy draft** only copies text. **Submit to [department]** saves the request in that department's inbox. The employee can follow replies and status in **My requests**; a department handler can claim and work on it. Switching workspace views keeps an unsubmitted draft in memory. Switching actors clears it.
