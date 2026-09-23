# Department workflow after AI intake

The original Week 4 assignment focused on AI suggestions. This later change adds the rest of the request process: employee confirmation -> saved request -> department inbox -> handler claim/reply/status -> employee tracking. AI advice still needs to be checked. It cannot create or change records on its own.

## Behavior

A requester enters an issue and may request an AI suggestion. The user can change the department before submitting. Only IT, HR and FINANCE can receive submitted requests; if the suggestion is UNDETERMINED, the user must choose a supported department first. The backend validates the submitted description (1-4000 characters), summary (1-600 characters) and department again. A requester may also choose a department manually when AI is unavailable.

Clicking **Submit to [department]** creates a request with NEW status and its first StatusEvent. It has no assigned handler yet. The requester receives a reference and can find the request under **My requests**.

Each demo handler has a fixed department: handler-001 = IT, handler-002 = HR, handler-003 = FINANCE. Their **department inbox** shows all requests routed to that department, including unassigned ones.

A handler can claim a request if it has no assigned handler. The database checks that condition and assigns the handler in one update, so two handlers cannot claim it at the same time. Only the assigned handler can move the request through NEW -> IN_PROGRESS -> DONE. The requester and handlers in that department can read and add replies, with the time saved for each reply. New status events can be added, but old events cannot be changed or removed.

The workspace sidebar shows the department inbox and request list directly, without a dropdown. Unassigned requests appear first, with their status and summary visible; selecting one opens the claim, conversation and status controls. On narrow screens the list becomes a horizontal strip above the details. Requesters see their own requests in the same place, not other departments' inboxes.

The original five demo requests remain. The migration sets their departments based on the handler already assigned to them. It keeps their status, history and IDs. Newly submitted requests use generated IDs. No AI call is made during submission, and a changed department cannot change the actor's access rights.

## API

| Action | Endpoint | Permission |
| --- | --- | --- |
| Submit | POST /requests | Requester only; body has description, summary, department |
| List | GET /requests | Requester sees own requests; handler sees their department inbox |
| Read | GET /requests/:id | Requester, handler in its department, or assigned handler |
| Claim | POST /requests/:id/claim | Handler in department; request must be unassigned |
| Reply | POST /requests/:id/comments | Requester, handler in department, or assigned handler; body has message |
| Progress | PATCH /requests/:id/status | Assigned handler only |

The backend rejects invalid input before saving anything. If someone tries to read a request in a department they cannot access, it returns 404 without revealing the request details. Trying to claim an already assigned request returns 409. Save failures return a consistent error message. Status and history are still saved together in one transaction. Each reply saves its author and creation time. An AI department suggestion alone never sends a request to that department.

## Data and trust

Direct reads and replies also allow the assigned handler if their department differs from the request's department; department inbox lists remain strictly filtered by department. The current submission and claim routes do not create that mismatch. Replies are allowed before a claim and after DONE; only status changes require assignment.

Prisma's ServiceRequest now stores the department, description, summary and creation time. Its handlerId can be null until someone claims the request. RequestComment stores each reply. The backend controls the allowed routing values. The current identity header and actor dropdown are still teaching tools, **not production authentication**. The fixed department assigned to each handler is enough for the assignment demo. Before real employees use it, the system needs verified identities and organization memberships. The free-tier Gemini data warning from the Week 4 note still applies; use fictional issues.

## Verification

`npm test` includes an HTTP workflow test using real SQLite storage. It checks that invalid submissions and submissions from handlers do not create records. It also checks that an HR request appears only in the HR inbox, that IT and Finance cannot read, claim or reply to it, and that HR can claim it, reply and update its status. The requester can then see the saved changes.

The existing status and AI boundary tests remain in the suite. `npm run test:integration` checks that status and history were saved by reading them through a second database client. `npm run test:e2e` follows the employee -> HR inbox -> employee journey through the browser and real backend, with only the AI provider replaced for the test. `npm run eval:ai` and `npm run eval:ai:live` remain the Week 4 advisory eval commands.

## Testing workspace

The sidebar has a visible selector for Employee, IT department, HR department and Finance department. Choosing a department selects its existing demo handler and opens that inbox; choosing Employee opens request preparation. This is a teaching identity switch, not authentication. Request details show New -> In progress -> Done. Claim an unassigned request, use Start progress, then Mark done. These actions use the normal backend permission checks and save the status history. Completed requests cannot be reset through the selector; submit another demo request to repeat the flow.
