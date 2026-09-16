# Week 3 / v0.3 - Integrated Product Slice

This work follows **UNDERSTAND -> DIRECT -> PROVE** and **BUILD -> PROTECT -> AUTOMATE**. It adds one complete status-change flow to the existing Internal Request Tracker repository.

A **slice** means one small feature that works through all the parts it needs: the screen, backend, and database. Here, the feature is changing a request's status and saving its history.

## UNDERSTAND - what we built and which rules we kept

**The selected feature:** the handler responsible for a Service Request opens it, moves it to the next status, and sees the saved status and history in React.

Week 2 already had the NestJS status rules and HTTP tests. Week 3 builds on that work. It adds the React screen, saves records in SQLite instead of only keeping them in memory, checks permission in the backend, and adds tests that can be run again.

The [product specification](product-spec.md), [architecture](architecture.md), [data model](data-model.md), [ADR-001](decisions/ADR-001.md), and [Week 2 report](week2-agentic-workflow.md) have not been changed. We kept these rules from the earlier work:

- Only `NEW -> IN_PROGRESS` and `IN_PROGRESS -> DONE` are allowed in this milestone.
- Every successful change adds one history event showing who changed the status and when.
- The current status and its new history event must be saved together. Older events must not be edited.
- Only the assigned handler may change the official status. A requester may read their own requests.
- A rejected change must leave the status and history unchanged. The screen shows success only after the save succeeds.

These status rules are working assumptions for the assignment, not final business rules. Rejected, Cancelled, and reopening a request are not included.

## DIRECT - how the feature works from screen to database

`React action -> HTTP API -> NestJS actor guard and DTO validation -> controller -> service authorization/lifecycle rule -> Prisma transaction -> SQLite -> response -> visible React result`

In simpler words:

1. The user chooses an action on the React screen.
2. The screen sends an HTTP request to the backend's API.
3. The backend identifies the selected user and checks the input format.
4. The controller passes the request to the service. The service checks permission and the status-change rule.
5. Prisma saves the status and history together in SQLite.
6. The backend sends the result back. React shows the saved result.

The [React screen](../frontend/src/main.tsx) has a development actor selector, a request selector, the current status, history, a next-status button, a refresh button, and readable messages. An **actor** is the user making the request. The request selector shows only records that actor may see. The [API helper](../frontend/src/api.ts) sends the selected actor's ID and the requested status.

### Saved data and the five examples

The [Prisma schema](../backend/prisma/schema.prisma) describes two kinds of stored records: `ServiceRequest` and `StatusEvent`.

- A request stores its reference, requester ID, assigned handler ID, and current status.
- A history event stores its public ID, request ID, status, actor, and time.
- Events also have an internal sequence number. This keeps them in the right order even when two events have the same time.

The [database store](../backend/src/requests/requests.store.ts) saves the status update and new history event in one **Prisma transaction**. A transaction means both changes succeed together, or neither is saved.

Before adding the event, the update checks that the saved status and assigned handler still match the values it expects. This stops an old request from writing over a more recent change. Such an update is called a **stale write**, and it is rejected. There is no API for editing or deleting history.

The default database file is `backend/prisma/dev.db`. Setting `DATABASE_URL` allows a different database location. The [setup utility](../backend/scripts/database.cjs) applies the migration saved in the repository and adds any missing example records. A **migration** is the file that sets up or changes the database structure. **Seeding** means adding starting example data.

Setup does not overwrite existing records. Starting the backend normally does not add seed data or reset anything. Running the explicit demo reset recreates all five requests as NEW, each with one starting history event.

| Request | Requester | Assigned handler |
| --- | --- | --- |
| REQ-1001 | employee-001 | handler-001 |
| REQ-1002 | employee-001 | handler-002 |
| REQ-1003 | employee-001 | handler-003 |
| REQ-1004 | employee-001 | handler-001 |
| REQ-1005 | employee-001 | handler-001 |



### API contract: what the screen sends and receives

An **API contract** describes the input the backend accepts and the response it returns. The [controller](../backend/src/requests/requests.controller.ts) keeps the existing three routes. Each needs a known development actor in a request header, for example `X-Actor-Id: handler-001`.

| Method and route | What to send | Successful response |
| --- | --- | --- |
| `GET /requests` | Actor header | 200; a list of requests the actor may see, sorted by ID |
| `GET /requests/:id` | Actor header and request reference | 200; one request the actor may see |
| `PATCH /requests/:id/status` | Actor header, reference, and JSON `{ "status": "IN_PROGRESS" }` | 200; the complete updated request after the save succeeds |

The [DTO](../backend/src/requests/change-status.dto.ts) defines the accepted input. Nest's ValidationPipe checks that input. Only the `status` field is allowed, and its value must be supported. Extra fields such as `changedBy` or a claimed role are rejected. The backend fills in history's `changedBy` using the actor it identified.

A successful read or update returns the following structure. The list route returns an array of these objects:

```ts
type ServiceRequest = {
  id: string;
  status: 'NEW' | 'IN_PROGRESS' | 'DONE';
  history: {
    id: string;
    requestId: string;
    status: 'NEW' | 'IN_PROGRESS' | 'DONE';
    changedBy: string;
    changedAt: string; // ISO timestamp, oldest events first
  }[];
};
```

`changedAt` is the event's date and time in ISO format. History is returned with the oldest event first.

| Error code | What it means |
| --- | --- |
| 400 | The body has a wrong format, an unsupported value, or an extra field |
| 401 | The development actor is missing or unknown |
| 403 | A requester is trying to change the official status |
| 404 | The request does not exist, or this actor may not see it |
| 409 | The status change is not allowed, or the update is based on old data |
| 503 | The database save operation failed unexpectedly |

The errors handled on purpose use `{ statusCode, message, error }`. React shows a readable message instead of raw JSON. These are the errors covered by this feature. This does not mean every possible infrastructure problem has been handled.

## PROTECT AND AUTOMATE - the seven assignment requirements

### 1. One permission rule, with an allowed case and a denied case

**Authorization** means deciding what a user is allowed to do.

**Rule:** only the handler assigned to a request may change its official status. The [actor guard](../backend/src/requests/dev-actor.ts) finds the selected user in the known actor list. [RequestsService](../backend/src/requests/requests.service.ts) then decides whether that user may make the change.

| Case, starting with REQ-1001 = NEW | Expected result |
| --- | --- |
| handler-001 requests IN_PROGRESS | **200**; the status changes and one history event is added |
| employee-001 requests IN_PROGRESS | **403**; the status and history stay unchanged |

The requester can click the action in the UI so the instructor can see the backend refuse it. Other actors cannot automatically read the request. For example, handler-002 gets 404 for REQ-1001. The list route returns only requests where the actor is the requester or assigned handler.

**How we prove it:** the HTTP regression tests and browser test check the allowed and denied cases. The business-rule test in section 4 also checks that the save method is never called after permission is denied.

### 2. One invalid request rejected on purpose

**Example:** REQ-1001 is NEW. Handler-001 sends `PATCH /requests/REQ-1001/status` with `{ "status": "DONE" }`.

DONE is a valid status name. However, moving straight from NEW to DONE is not allowed: the request must go through IN_PROGRESS first. The service checks the existing [status-change rules](../backend/src/requests/request-status.ts) and returns **409** before saving. The status and every history event stay unchanged.

**How we prove it:** the [HTTP tests](../backend/test/requests.test.cjs) include `NEW -> DONE: 409 and unchanged`. The [integration test](../backend/test/database.test.cjs) also reads the database before and after the rejected action and compares the results. Existing 400 checks cover unsupported input and the client `changedBy` field, which is no longer accepted.

### 3. One expected failure handled on purpose

**Example:** the database save method throws an unexpected error. The service returns **503** with this response:

```json
{
  "statusCode": 503,
  "message": "Could not save the status. Please try again.",
  "error": "Service Unavailable"
}
```

React keeps showing the last confirmed request. It removes any old success message, shows the error, and lets the user retry. It does not show the update as successful.

If the HTTP response is lost, the screen asks the user to refresh instead. In that situation, it cannot know whether the backend saved the change.

**Automated proof:** [rules.test.cjs](../backend/test/rules.test.cjs) contains `save failure becomes readable HTTP 503 without false success or fixture mutation`. Here, **mutation** means changing data. The test replaces the save method with a small fake method, called a **stub**, that throws an error. It checks:

- The real Nest HTTP response has the expected error code and message.
- The save method was called once.
- The starting test data did not change.
- Reading the request again returns unchanged data.

**What this test does not prove:** it checks how a save error becomes a safe HTTP response. It does not make a real database fail halfway through a transaction, and it does not prove database rollback. **Rollback** means undoing the changes in a failed transaction. The actual application uses a Prisma transaction to make the status and history save together.

A separate browser check on 2026-09-14 supplied a controlled 503 response. It confirmed that the saved state stayed visible, old success feedback disappeared, and retry worked. That check is not part of the E2E test stored in the repository. No failure endpoint, code to acquire/release SQLite locks, or external service was added.

### 4. One automated test for a business rule

**Test:** `requester is denied before persistence mutation` in [rules.test.cjs](../backend/test/rules.test.cjs).

The test calls the real RequestsService with employee-001, REQ-1001, and IN_PROGRESS. A small fake store returns information about who owns the request and who handles it. The test checks for a **403** permission error and **zero calls to saveStatus**.

This test does not need a real database. The service still has to read the ownership information before it can decide permission. The test therefore proves that no save is called after denial; it does not claim that no read happens.

### 5. One integration test between the backend and database

An **integration test** checks that connected parts work together.

**Test:** `real service persists status and appended history in isolated SQLite` in [database.test.cjs](../backend/test/database.test.cjs).

This test uses the real RequestsService, RequestsStore, Prisma, and a separate SQLite test database. It starts with NEW and has handler-001 change REQ-1001 to IN_PROGRESS. A second Prisma client reads the database directly and checks that:

- The stored status is IN_PROGRESS.
- Exactly one new history event was added for handler-001 and REQ-1001.
- Every older event stayed unchanged.

Before that successful change, the same test checks that NEW -> DONE returns 409 and leaves the stored record unchanged. Database access is real, not faked. The test checks what was actually saved instead of trusting only the object returned by the service.

### 6. One meaningful E2E test

**E2E** means **end-to-end**: the test follows a user's action through the working application.

**Test:** `requester is denied; assigned handler saves status and history through reload` in [status.e2e.ts](../frontend/test/status.e2e.ts).

Playwright runs this path: real browser -> React -> HTTP -> NestJS -> Prisma -> separate SQLite test database.

1. Open REQ-1001 as employee-001. Check that it is NEW with one history event.
2. Click Start progress. Check for 403, a readable denial message, and unchanged status/history on screen.
3. Switch to handler-001. Submit the allowed change. Check for 200, IN_PROGRESS, and its new history event.
4. Select and advance the four other examples using their assigned handlers. Check that their histories stay separate.
5. Return to REQ-1001 and reload the page. Check that IN_PROGRESS and its two events are still there.

HTTP responses are not faked in this test. The actor selector is still a teaching tool, not real organizational login. Reloading the page proves that the app reads the saved result again. Keeping data after a backend restart was checked separately.

### 7. Regression protection for behavior that already worked

A **regression** is when a later change breaks something that worked before. Regression tests help catch that.

We updated the existing [Week 2 HTTP test file](../backend/test/requests.test.cjs) instead of replacing it. It still checks that:

- NEW -> IN_PROGRESS and IN_PROGRESS -> DONE succeed.
- NEW -> DONE and the other unsupported changes are rejected without changing data.
- Each successful change adds exactly one event and keeps older events unchanged.
- The newest history event's status matches the current request status.
- Unknown requests are handled, and changing one record does not change the others.
- Input with a wrong format or unsupported value is rejected.

Some API changes were intentional, so the tests were updated to match them. The actor ID moved from body `changedBy` to the `X-Actor-Id` header. The backend now decides which actor to record in history. Reads return only requests the actor may see. There are now five seed records.

The old requirement to send an actor label in the body was replaced because it no longer matches the API. The authorization tests cover new behavior. The existing status and history checks protect the behavior that already worked in Week 2.

## PROVE - how to run the checks and what passed

First install the dependencies by following [README](../README.md). Then run these commands from `backend/`:

```powershell
npm test
npm run test:integration
```

Run these commands from `frontend/`:

```powershell
npx playwright install chromium
npm run test:e2e
```

The [test database helper](../backend/test/database-helper.cjs) creates a new temporary SQLite file for each setup. It applies the real migration and seed data, closes the connections afterward, and removes the temporary data. Tests that use a database do not reset development data. The small rule and failure tests do not use a real database.

E2E uses ports 3001 and 5174. The normal demo uses 3000 and 5173, so the two stay separate.

### Automated results verified on 2026-09-15

| Command | Result |
| --- | --- |
| `npm test` | 16 passed, 0 failed: HTTP parent test + 13 subtests + permission-rule test + save-failure test |
| `npm run test:integration` | 1 passed, 0 failed; real backend and database saving |
| `npm run test:e2e` | 1 passed, 0 failed; browser journey covering all five examples |

The count of 16 includes the outer HTTP test as well as its 13 smaller tests.

### Earlier setup and manual checks

- **2026-09-14 setup:** dependencies were installed cleanly in the existing working directory. Database setup/reset, both builds, and both normal servers worked. This was not a fresh Git checkout.
- **2026-09-14 restart check:** start with NEW, save IN_PROGRESS, stop the backend, run `npm start` again, and GET the record. The status and both events were identical after restart, including their IDs, actors, times, and order.
- **2026-09-14 screen failure check:** a controlled 503 kept the last confirmed state visible, removed old success feedback, and allowed retry after the controlled response was removed.
- **2026-09-15 examples:** seeding added missing records without changing existing requests or history. Builds and the expanded browser journey passed. Development records can change later as the instructor tries them.

README has the verified installation, setup/reset, server, build, manual HTTP, and test commands. Editing this document does not reset the demo database.

## Assumptions, limits, and work outside this assignment

- The development actor header is not production authentication. Anyone can select a known actor ID. The organization's Identity Service has not been connected.
- Status names, seeded ownership, and handler assignments are assumptions for this milestone. Department-wide permissions, changing assignments, accounts, comments, and creating requests are not implemented.
- Prisma is fixed at version 6.19.3 to work with the existing CommonJS backend. On Windows, setup first opens a missing SQLite file through Prisma, then runs migrations. This handles the setup problem seen during verification. The Prisma client is generated during installation. Builds therefore do not replace a DLL file that a running backend is using.
- The last dependency audit reported six high-severity findings in the Nest/Multer and Prisma configuration dependency chains, and zero for the frontend. These problems were not fixed or checked again during this document edit. No forced major-version updates were made.
- No external integration, production login, cloud database, Docker, microservices, queues, runtime AI, RAG, MCP, CI/CD, deployment, or monitoring was added.
