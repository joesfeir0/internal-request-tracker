# Operations Hub - Internal Request Tracker

[![Release gate](https://github.com/joesfeir0/internal-request-tracker/actions/workflows/release-gate.yml/badge.svg)](https://github.com/joesfeir0/internal-request-tracker/actions/workflows/release-gate.yml)

Operations Hub lets employees send internal service requests to IT, HR or Finance and follow them until they are done. **AI-assisted Request Intake** helps the employee describe the problem and suggests a department; a person always makes the final choice. Department handlers claim requests, reply, and move them through `NEW -> IN_PROGRESS -> DONE`.

Stack: React -> HTTP -> NestJS -> Prisma -> PostgreSQL, with Google Gemini for AI suggestions. Runs for free on Render (app) and Neon (database).

This README is the handoff:

1. [Live app](#1-live-app): try the product.
2. [Engineer quick start](#2-engineer-quick-start): run and test it.
3. [Operations](#3-operations): keep it healthy and recover it.
4. [Evidence map](#4-evidence-map): the proof behind every week.

Reference details come after these four sections.

## 1. Live app

**Live app: https://operations-hub-3j52.onrender.com**

It runs on free hosting. A monitor keeps it awake, but if the first visit is slow, wait up to a minute for the server to wake.

### What it does

- An **employee** describes an issue, can ask AI for a suggestion (department, summary, missing details), chooses the department and submits. They get a ticket number such as `REQ-1006` and follow replies and status under **My requests**.
- A **department handler** sees their department's inbox, claims a ticket, replies, and moves it to In progress and then Done, with an optional note to the employee.
- The AI only advises. It never saves, routes or changes anything. If it is down, the employee picks the department by hand and everything else still works.

### Demo access and roles

There is no password: choose an account in the **Testing workspace** menu on the left. These are demo accounts, not real sign-in. All data is fictional; do not enter real personal information.

| Account | ID | Role | What it can do |
| --- | --- | --- | --- |
| Maya Haddad | `employee-001` | Employee | Submit tickets; read and reply to her own. Owns demo tickets REQ-1001 to REQ-1005. |
| Karim Nassar | `employee-002` | Employee | Same as Maya, but cannot see Maya's tickets. |
| Rami Khoury | `handler-001` | IT handler | IT inbox. Assigned to REQ-1001, REQ-1004, REQ-1005. |
| Lina Farah | `handler-004` | IT handler | IT inbox. Cannot change the status of a ticket Rami claimed. |
| Nour Saleh | `handler-002` | HR handler | HR inbox. Assigned to REQ-1002. |
| Omar Aoun | `handler-003` | Finance handler | Finance inbox. Assigned to REQ-1003. |

### One critical journey to try

1. As **Maya Haddad**, on **Prepare a request**, type *I need an employment letter for my bank by next Friday.* Click **Get AI suggestion**, review it and keep **HR** (if AI is unavailable, choose HR under **Already know the department?**). Click **Submit to HR** and note the ticket number. It is NEW, unassigned, with one history entry.
2. Switch to **Nour Saleh**. Open the ticket in the HR inbox, **Claim request**, send a reply, **Start progress**, then **Mark done** with a short resolution note. The conversation closes when the ticket is Done.
3. Switch back to **Maya Haddad**, open **My requests**, choose **Done**, and see the status, replies and full history. Reload the page: everything is still there.

**Try a rejected action.** As **Karim Nassar**, type Maya's ticket number into **Open by reference**: the server answers "Request unavailable or not found." As **Lina Farah**, open a ticket Rami claimed: she can read and reply but cannot change its status.

## 2. Engineer quick start

### Prerequisites

- Node.js **22.12+** and npm. Verified with Node 24.12.0 and npm 11.6.2 on Windows (PowerShell 7); CI uses Node 24 on Ubuntu. `.nvmrc` pins 24.
- A **PostgreSQL** database: a free [Neon](https://neon.tech) project with a separate `development` branch (recommended), or a local PostgreSQL. Never develop against the live `production` branch.
- Optional: a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) for real AI suggestions. Everything else, including all tests, works without it.

### Configure

```powershell
cd backend
Copy-Item .env.example .env
```

Then edit `backend/.env`:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** address (host contains `-pooler`), or your local PostgreSQL address |
| `DIRECT_URL` | Neon **direct** address (the same without `-pooler`); for local PostgreSQL, the same as `DATABASE_URL` |
| `GEMINI_API_KEY` | Your key, or empty to run without AI |

`.env` is ignored by Git. Never commit these values or put them in frontend code.

### Database and demo data

```powershell
cd backend
npm ci
npm run db:setup
```

`npm ci` installs dependencies and generates the Prisma client. `db:setup` creates the tables and adds the five demo tickets if they are missing; it never replaces existing data.

### Run in development (two terminals)

```powershell
cd backend
npm start
```

```powershell
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite forwards `/requests`, `/actors` and `/health` to the backend on port 3000.

### Run in production mode (one address, as on Render)

From the repository root:

```powershell
npm run build
npm start
```

Open http://127.0.0.1:3000. The backend serves both the built frontend and the API.

### Test everything

```powershell
# Once, from frontend/: install the browser used by E2E tests
npx playwright install chromium

# From the repository root: all checks in order, stopping at the first failure
npm run verify:release
```

The release gate runs: backend build -> frontend type-check and build -> backend tests -> database integration test -> offline AI evals -> browser E2E. Individual commands are in [Automated evidence](#automated-evidence).

## 3. Operations

| Need | How |
| --- | --- |
| **Is it running?** | `GET /health/live` returns `{ "status": "ok" }` while the process is alive. Render's own checks use it. |
| **Is it healthy?** | `GET /health` returns `ok`, `degraded` (AI down; manual flow still works) or `unhealthy` (database down; HTTP 503), with separate `database` and `triageModel` checks and the running `release` (commit). |
| **Why did it fail?** | Logs (Render **Logs** tab, or the backend terminal): one line per API call, plus safe reasons such as `AI intake failed: Provider unavailable (HTTP 429)`. Never ticket text, prompts or keys. |
| **Does the critical path work?** | `npm run smoke -- <url>`: read-only checks of health, frontend, accounts, tracking, a 404 boundary, a 401 boundary and one AI suggestion (`--skip-ai` skips it). |
| **Monitoring** | Two free UptimeRobot monitors email the owner: one checks that the site answers (every 5 min), the other that `/health` contains `"status":"ok"` (every 30 min), so it also catches `degraded`. On 2026-09-28 it caught two real AI-provider failures ([details](docs/week5-release-operations.md#9-monitoring-and-alerting)). |
| **Failure -> recovery** | Break one dependency (for example an invalid `GEMINI_API_KEY` in Render), see `degraded` and the log reason, confirm manual submission still works, restore the key, then prove `/health` is `ok` and the smoke check passes again. Recovery is not rollback. Done live on 2026-09-27 ([results](docs/week5-release-operations.md#live-drill-results-2026-09-27-utc-release-41d00c15fe3a-throughout)). |
| **Reset demo data** | `npm run db:reset` in `backend/` deletes all tickets and recreates the five demo ones. It refuses a remote database unless run as `node scripts/database.cjs reset --confirm-remote`. Never part of a deploy. |

Deployment settings, the full drill and all recorded evidence: [Week 5 release operations](docs/week5-release-operations.md).

## 4. Evidence map

| Week | Topic | Documents |
| --- | --- | --- |
| 1 | Design: product, architecture, data model, decisions | [Product spec](docs/product-spec.md), [architecture](docs/architecture.md) ([Week 1 diagram](docs/architectureDiagram.png); the current deployed diagram is in its [Week 5 amendment](docs/architecture.md#week-5-amendment---deployed-system)), [data model](docs/data-model.md), [ADR-001 status history](docs/decisions/ADR-001.md) |
| 2 | Engineering ownership: lifecycle rules, valid and invalid behavior | [Week 2 agentic workflow](docs/week2-agentic-workflow.md) |
| 3 | Full stack: React + NestJS + database, permissions, E2E | [Week 3 full-stack delivery](docs/week3-full-stack-delivery.md) |
| 4 | Production AI: bounded context, AI is not authority, failure safety, evals | [Week 4 production AI](docs/week4-production-ai.md), [department workflow and permissions](docs/department-workflow.md) |
| 5 | Release ownership: config and secrets, release gate, health, logs, monitoring, recovery, GO/HOLD | [Week 5 release operations](docs/week5-release-operations.md), [ADR-002 hosting and database](docs/decisions/ADR-002.md), [ADR-003 demo identity and permissions](docs/decisions/ADR-003.md) |

Key code: [permission policy](backend/src/requests/policy.ts), [status transaction and ticket numbers](backend/src/requests/requests.store.ts), [AI adapter](backend/src/intake/gemini.client.ts) and [AI contract](backend/src/intake/intake-contract.ts), [health](backend/src/health/health.service.ts), [release gate](scripts/verify-release.mjs), [smoke check](scripts/smoke.mjs), [CI workflow](.github/workflows/release-gate.yml).

The Week 2 and Week 3 documents are dated records of earlier versions (in-memory, SQLite, `changedBy` in the body). This README describes the current version, v0.5.

---

# Reference

## How the app works

- **Two views.** Employees start on **Prepare a request** and track tickets under **My requests**. Handlers see their **Department inbox**, unassigned tickets first. Both lists have **Open** / **Done** filters, refresh themselves every 30 seconds while the tab is visible, and have a **Refresh** button. On phones the list sits above the ticket details.
- **AI suggestion.** The employee types the issue and clicks **Get AI suggestion**. The backend asks Gemini, checks the answer and returns a department (IT, HR, Finance or "needs clarification"), a summary, missing details and a next step. The employee can add details and ask again.
- **The employee decides.** The **Draft department** choice is optional before AI and editable after it. A manual choice is kept when the text changes or AI fails; **Use AI department** accepts the AI's choice instead. Nothing reaches a department until **Submit**, and choosing a department never grants access to it. **Copy draft** only copies text.
- **When AI fails** (down, not configured or rate limited), the screen says so, keeps the text and opens **Already know the department?** so the employee can submit without AI. There is no fake answer and no paid fallback.
- **Switching accounts** clears any unsubmitted draft; switching views keeps it.
- **Model and data.** Default model `gemini-3.1-flash-lite` on Google's [free API tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite), which has usage limits and may use submitted content to improve Google's products. Use fictional examples only. Restart the backend after changing `.env`.

Context sent to the model, output limits and eval results: [Week 4 production AI](docs/week4-production-ai.md).

### Accounts and permissions

The accounts are listed in [Demo access and roles](#demo-access-and-roles). `GET /actors` serves them to the UI. The backend looks up `X-Actor-Id` in that fixed list and never accepts a role or `changedBy` sent by the browser. All permission rules live in [policy.ts](backend/src/requests/policy.ts); every ticket response includes `allowedActions` for the calling account, and the UI shows only those actions. **This is not a real login system:** anyone can choose a demo account ([ADR-003](docs/decisions/ADR-003.md)).

### Demo tickets

| Ticket | Department | Assigned handler | Try |
| --- | --- | --- | --- |
| REQ-1001 | IT | Rami Khoury | As Maya: no status button. As Rami: Start progress, then Mark done. |
| REQ-1002 | HR | Nour Saleh | Start progress, then Mark done. |
| REQ-1003 | Finance | Omar Aoun | View as Maya, then advance as Omar. |
| REQ-1004 | IT | Rami Khoury | Start progress, refresh, inspect the new history entry. |
| REQ-1005 | IT | Rami Khoury | Advance it; the other tickets' histories stay unchanged. |

New tickets get short numbers from a database sequence (REQ-1006, REQ-1007, ...). Numbers are never reused, even after a reset.

## Database commands

Data lives in the PostgreSQL database named by `DATABASE_URL`, outside the app server, so restarts and redeploys keep it. The backend and these commands load `backend/.env`; a value set in the shell wins. Normal startup never migrates, seeds or resets. Without `DATABASE_URL` the backend refuses to start instead of guessing a database.

| Command (in `backend/`) | Effect |
| --- | --- |
| `npm run db:migrate` | Applies committed migrations only; never changes rows. Used for deployment. |
| `npm run db:setup` | Migrates, then adds any missing demo tickets REQ-1001 to REQ-1005. Keeps existing data, including demo tickets already advanced. |
| `npm run db:reset` | Deletes all tickets, replies and history, then recreates the five demo tickets as NEW. Refuses a non-local database unless run as `node scripts/database.cjs reset --confirm-remote`. |

## HTTP contract and manual checks

| Endpoint | Successful result |
| --- | --- |
| `GET /actors` | 200; demo accounts (no header needed) |
| `GET /requests` | 200; tickets visible to the account, with history and comments |
| `GET /requests/:id` | 200; one visible ticket |
| `POST /requests` | 201; new NEW ticket, no handler, first history entry |
| `POST /requests/:id/claim` | 201; ticket assigned to the claiming handler |
| `POST /requests/:id/comments` | 201; ticket including the new reply |
| `PATCH /requests/:id/status` | 200; ticket after the database transaction commits |
| `POST /requests/intake-suggestion` | 200; checked AI suggestion; nothing saved |
| `GET /health`, `GET /health/live` | See [Operations](#3-operations); no header needed |

Bodies (all other fields are rejected):

- **Submit:** `{ "description", "summary", "department" }`: description 1-4000 characters, summary 1-600, department IT, HR or FINANCE.
- **Reply:** `{ "message" }`, 1-2000 characters.
- **Status:** `{ "status": "IN_PROGRESS" }` (or `DONE`), plus an optional `note` up to 2000 characters, saved as a reply in the same transaction.
- **Claim:** no body.
- **AI suggestion:** `{ "text" }`, 1-4000 characters. Returns `{ suggestedDepartment, summary, missingInformation, suggestedNextStep }`.

`/requests` routes need the `X-Actor-Id` header. Ticket responses are `{ id, requesterId, handlerId, department, description, summary, createdAt, status, history, comments, allowedActions }`; `handlerId` is null until claimed; history entries are `{ id, requestId, status, changedBy, changedAt }`, oldest first; comments are `{ id, requestId, authorId, message, createdAt }`; dates are ISO strings. See [the TypeScript contract](backend/src/requests/request-status.ts).

Errors are `{ statusCode, message, error }`:

| Code | Meaning |
| --- | --- |
| 400 | Invalid input or extra fields (such as `changedBy`) |
| 401 | Missing or unknown account |
| 403 | Known account not allowed (for example an employee changing status, a handler who is not the assignee, a handler submitting or using AI intake) |
| 404 | Ticket missing, or not visible to this account |
| 409 | Invalid status move, already claimed, reply to a Done ticket, or a change based on old data |
| 429 | Rate limit: over 10 AI suggestions a minute per client (300 a day in total), or over 60 saves a minute per client |
| 502 | AI provider or configuration failure; one stable message; nothing saved |
| 503 | Database save failed; no success response |

Rules: visibility is checked first, so another department's ticket returns 404, and a forbidden action on a visible ticket returns 403. The employee who sent it, handlers of its department and the assigned handler can read it and reply while it is not Done. Only a handler of that department can claim an unassigned ticket. Only the assigned handler can change its status.

Manual checks in PowerShell 7 (after `npm run db:reset`, with the backend running):

```powershell
$base = 'http://127.0.0.1:3000'
$handler = @{ 'X-Actor-Id' = 'handler-001' }
$requester = @{ 'X-Actor-Id' = 'employee-001' }

Invoke-RestMethod "$base/requests/REQ-1001" -Headers $handler

# Employee denied: 403
Invoke-WebRequest "$base/requests/REQ-1001/status" -Method Patch -Headers $requester -ContentType 'application/json' -Body '{"status":"IN_PROGRESS"}' -SkipHttpErrorCheck

# NEW -> DONE skips a step: 409
Invoke-WebRequest "$base/requests/REQ-1001/status" -Method Patch -Headers $handler -ContentType 'application/json' -Body '{"status":"DONE"}' -SkipHttpErrorCheck

# changedBy from the client is rejected: 400
Invoke-WebRequest "$base/requests/REQ-1001/status" -Method Patch -Headers $handler -ContentType 'application/json' -Body '{"status":"IN_PROGRESS","changedBy":"handler-001"}' -SkipHttpErrorCheck

# Still NEW, original history only
Invoke-RestMethod "$base/requests/REQ-1001" -Headers $handler

# Assigned handler succeeds: 200, IN_PROGRESS, two history entries
Invoke-RestMethod "$base/requests/REQ-1001/status" -Method Patch -Headers $handler -ContentType 'application/json' -Body '{"status":"IN_PROGRESS"}'
```

**Restart proof:** stop the backend (Ctrl+C), start it again and repeat the GET. It still shows IN_PROGRESS and both history entries, because the data is in PostgreSQL, not in the app.

**Save failure:** the API returns 503 (for example "Could not save the status. Please try again.") and logs the ticket and database error code. The screen keeps the last confirmed state and lets the user retry; if the response was lost, it asks the user to refresh, because it cannot know whether the save happened.

## Automated evidence

| Command | Where | What it covers |
| --- | --- | --- |
| `npm test` | `backend/` | **27 passing tests** (counting parent tests): status rules and history, permission policy (other employee denied, second handler limited, Done tickets closed, status notes), input validation, AI context and output limits, AI failures and retry, AI rate limit, health states and safe output, ticket numbers, and no data changes during AI calls. |
| `npm run test:integration` | `backend/` | **1 test**: status and history saved in an isolated PostgreSQL schema and read back through a second connection; reset removes replies before tickets. |
| `npm run eval:ai` | `backend/` | **8 offline cases** through the real adapter and checks, no key or network. Proves the code's handling, not the model's quality. |
| `npm run eval:ai:live` | `backend/` | 6 cases against the real model (twice each) plus 2 controlled failures. Needs a key; uses free quota. |
| `npm run test:e2e` | `frontend/` | **3 browser journeys** in Chromium with the real backend and database (only the AI network call is replaced): handler update survives reload; AI draft -> HR inbox -> claim -> reply -> Done with a note -> employee sees it; AI outage -> manual submit -> other employee denied -> second IT handler cannot change status. Uses ports 3001 and 5174. |
| `npm run verify:release` | root | Everything above except the live eval, in order, stopping at the first failure. |

Database tests create a temporary schema (`test_<random>`) in the database from `TEST_DATABASE_URL`, `DIRECT_URL` or `DATABASE_URL` (first one set), then drop it. They never read or change the main data.

### Verification history

- **2026-09-29:** Gemini returned HTTP 503 again (15:47-15:49 and 18:15 UTC); status `degraded`, database `ok`, no action taken; live smoke 7/7 again at 19:28 UTC. A local release gate stopped at the backend tests because each database round trip from the laptop to Neon (US East) took 220-450 ms, pushing transactions over Prisma's 5 s limit; the same code is green in CI ([details](docs/week5-release-operations.md#gate-results)).
- **2026-09-28, live app (`41d00c1`):** two real AI-provider failures (a timeout, then HTTP 503) with no change by the owner. Health showed `degraded` with the database `ok`, the log gave the reason, the monitor emailed the owner, and both recovered on their own within about 5 and 15 minutes.
- **2026-09-27, live app (`41d00c1`):** GitHub Actions release gate 6/6. Live smoke 7/7 three times. Live failure/recovery drill: AI key broken -> `degraded`, log reason and monitor alert -> manual submission still worked -> key restored -> `ok` again (cycle 1 fully recorded; repeated twice more), no data lost. Decision **GO** ([details](docs/week5-release-operations.md#release-decision)).
- **2026-09-26, Neon PostgreSQL `development` branch:** release gate 6/6: both builds, 27/27 backend tests, 1/1 integration, 8/8 offline evals, 3/3 browser journeys; no test schemas left behind. The first gate run stopped with HOLD on a real test-isolation bug, now fixed ([details](docs/week5-release-operations.md#incident-caught-by-the-gate-ticket-numbers-leaking-between-tests)). Production-mode smoke check 7/7 locally.
- **2026-09-23, SQLite:** build, 23 backend tests, 1 integration test, 2 browser journeys and 8/8 offline evals passed. Live AI evaluation passed 8/8 once and 7/8 the next time (one timeout); live Gemini availability is intermittent. Earlier results: [Week 4 production AI](docs/week4-production-ai.md).

## Production configuration

`npm run build` (root) installs and builds both apps; `npm start` (root) runs the built backend, which also serves `frontend/dist`. Variables: `DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`, `PORT`, `HOST` (default `0.0.0.0` on Render, otherwise `127.0.0.1`), `TRUST_PROXY` (proxy hops, so rate limits see the real visitor) and the three rate limits in `backend/.env.example`. Which ones are secret: [Week 5, section 3](docs/week5-release-operations.md#3-configuration-and-secrets). Render build and start commands: [Week 5, section 6](docs/week5-release-operations.md#6-deployment-design).

## Troubleshooting

- **`DATABASE_URL is not set`:** create `backend/.env` from `.env.example`.
- **Missing tables:** run `npm run db:setup` in `backend/`.
- **Cannot GET /** on port 3000: the frontend is not built. Run `npm run build` in `frontend/`, or use Vite on 5173.
- **Live app slow to open:** the free Render server was asleep; wait up to a minute.
- **AI suggestion unavailable:** check the key in `.env` (or Render) and the free-tier quota, then restart. `/health` shows `triageModel`; the log shows the reason. Manual submission still works.
- **401 when opening an API URL in the browser:** the browser does not send the account header. Use the app, the smoke check or the commands above.
- **Could not load the request:** check the backend is running, then click **Refresh**.
- **409 when repeating an update:** it already moved on, or the move is not allowed. Refresh, or reset the demo.
- **Port in use:** stop the earlier instance. E2E tests need ports 3001 and 5174 free.
- **Windows reinstall fails with a Prisma DLL error:** stop running backend processes first; they hold the Prisma engine file open.

## Scope and known limits

- **Demo identity, not login** ([ADR-003](docs/decisions/ADR-003.md)). No organization directory; department memberships are fixed in code.
- **Free hosting** ([ADR-002](docs/decisions/ADR-002.md)): cold starts, compute and storage limits, no uptime promise.
- **Not built (deferred):** cancelling or rejecting tickets, transfers between departments, reopening, priorities and due dates, attachments, email notifications. See the [product spec's Week 5 amendment](docs/product-spec.md#week-5-amendment---final-scope-and-answers-to-open-questions).
- **Dependencies:** Prisma stays at 6.19.3 for the CommonJS backend. `npm audit` on 2026-09-29 reports 5 high-severity findings in the backend (Nest/Multer and Prisma/deepmerge-ts chains) and none in the frontend. They are not fixed for this release ([Week 5 remaining risks](docs/week5-release-operations.md#remaining-risks-accepted-for-the-demo)). No upload endpoint or untrusted Prisma configuration is used.
