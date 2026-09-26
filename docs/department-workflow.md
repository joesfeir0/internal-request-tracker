# Department workflow after AI intake

The original Week 4 assignment focused on AI suggestions. This later change adds the rest of the request process: employee confirmation -> saved request -> department inbox -> handler claim/reply/status -> employee tracking. AI advice still needs to be checked. It cannot create or change records on its own.

## Behavior

A requester enters an issue and may request an AI suggestion. The user can change the department before submitting. Only IT, HR and FINANCE can receive submitted requests; if the suggestion is UNDETERMINED, the user must choose a supported department first. The backend validates the submitted description (1-4000 characters), summary (1-600 characters) and department again. A requester may also choose a department manually when AI is unavailable.

Clicking **Submit to [department]** creates a request with NEW status and its first StatusEvent. It has no assigned handler yet. The requester receives a reference and can find the request under **My requests**.

Each demo handler has a fixed department: handler-001 (Rami Khoury) and handler-004 (Lina Farah) = IT, handler-002 (Nour Saleh) = HR, handler-003 (Omar Aoun) = FINANCE. There are two demo employees, employee-001 (Maya Haddad) and employee-002 (Karim Nassar). The directory lives in `backend/src/requests/dev-actor.ts` and is served by `GET /actors`, so the UI does not hardcode identities. A **department inbox** shows all requests routed to that department, including unassigned ones.

A handler can claim a request if it has no assigned handler. The database checks that condition and assigns the handler in one update, so two handlers cannot claim it at the same time. Only the assigned handler can move the request through NEW -> IN_PROGRESS -> DONE. The requester and handlers in that department can read and add replies while the request is open, with the time saved for each reply. When changing status, the assigned handler may add an optional note; it is saved as a reply in the same transaction as the status and its history event. A DONE request is closed: nobody can reply to it, and follow-up needs a new request. New status events can be added, but old events cannot be changed or removed.

The workspace sidebar shows the department inbox and request list directly, without a dropdown. Unassigned requests appear first, with their status and summary visible; selecting one opens the claim, conversation and status controls. On narrow screens the list becomes a horizontal strip above the details. Requesters see their own requests in the same place, not other departments' inboxes.

The five demo requests (REQ-1001 to REQ-1005) are created by `npm run db:setup` with their departments, fictional descriptions and assigned handlers. When the SQLite version was migrated in Week 4, existing demo requests kept their status, history and IDs; Week 5 starts PostgreSQL from a fresh baseline. Newly submitted requests get short sequential numbers from the database (REQ-1006 onward). No AI call is made during submission, and a changed department cannot change the actor's access rights.

## Permission policy

All rules live in `backend/src/requests/policy.ts`. The service enforces them, and every request response includes `allowedActions: { claim, comment, nextStatus }` computed by the same functions for the calling actor. The UI shows only those actions and explains why others are unavailable; it never decides permissions itself.

| Action | Allowed when |
| --- | --- |
| View | Actor is the requester, a handler in the request's department, or the assigned handler |
| Claim | Handler in the request's department, request unassigned and not DONE |
| Reply | Actor can view the request and it is not DONE |
| Change status | Actor is the assigned handler and the transition is NEW -> IN_PROGRESS or IN_PROGRESS -> DONE |

**Open by reference** in the sidebar asks the server for a request ID directly, so an actor without access sees the real 404 denial in the UI (for example, employee-002 opening employee-001's request). A second IT handler shows the assignment boundary: once Rami claims a request, Lina can read and reply but not change its status.

## API

| Action | Endpoint | Permission |
| --- | --- | --- |
| Submit | POST /requests | Requester only; body has description, summary, department |
| List | GET /requests | Requester sees own requests; handler sees their department inbox |
| Read | GET /requests/:id | Requester, handler in its department, or assigned handler |
| Claim | POST /requests/:id/claim | Handler in department; request must be unassigned |
| Reply | POST /requests/:id/comments | Requester, handler in department, or assigned handler; request not DONE; body has message |
| Progress | PATCH /requests/:id/status | Assigned handler only; body has status and an optional note (up to 2000 characters) |
| Directory | GET /actors | Public list of demo identities, no header needed |

The backend rejects invalid input before saving anything. If someone tries to read a request in a department they cannot access, it returns 404 without revealing the request details. Trying to claim an already assigned request returns 409. Save failures return a consistent error message. Status and history are still saved together in one transaction. Each reply saves its author and creation time. An AI department suggestion alone never sends a request to that department.

## Data and trust

Direct reads and replies also allow the assigned handler if their department differs from the request's department; department inbox lists remain strictly filtered by department. The current submission and claim routes do not create that mismatch. Replies are allowed before a claim but not after DONE; status changes require assignment.

Prisma's ServiceRequest now stores the department, description, summary and creation time. Its handlerId can be null until someone claims the request. RequestComment stores each reply. The backend controls the allowed routing values. The current identity header and actor dropdown are still teaching tools, **not production authentication**. The fixed department assigned to each handler is enough for the assignment demo. Before real employees use it, the system needs verified identities and organization memberships. The free-tier Gemini data warning from the Week 4 note still applies; use fictional issues.

## Verification

`npm test` includes HTTP workflow tests using real PostgreSQL storage in an isolated schema. A second test covers the policy boundaries: another employee is denied, the second IT handler cannot advance a colleague's ticket, status notes are saved with the status, and DONE requests reject replies. It checks that invalid submissions and submissions from handlers do not create records. It also checks that an HR request appears only in the HR inbox, that IT and Finance cannot read, claim or reply to it, and that HR can claim it, reply and update its status. The requester can then see the saved changes.

The existing status and AI boundary tests remain in the suite. `npm run test:integration` checks that status and history were saved by reading them through a second database client. `npm run test:e2e` runs three browser journeys through the real backend and database, with only the AI provider replaced: an assigned-handler update that survives reload; employee -> HR inbox -> claim -> reply -> Done with a note -> employee sees it; and AI outage -> manual submission -> another employee denied by reference -> the second IT handler cannot change status. `npm run eval:ai` and `npm run eval:ai:live` remain the Week 4 advisory eval commands.

## Testing workspace

The sidebar selector lists the demo employees and department handlers by name. Choosing a handler opens their department inbox; choosing an employee opens request preparation. This is a teaching identity switch, not authentication. The inbox has **Open** and **Done** filters and refreshes itself every 30 seconds while the tab is visible. Request details show New -> In progress -> Done. Claim an unassigned request, use Start progress, then Mark done. These actions use the normal backend permission checks and save the status history. Completed requests cannot be reset through the selector; submit another demo request to repeat the flow.
