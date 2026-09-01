# Internal Request Tracker - Architecture Draft

Based on product-spec.md, with its requirements unchanged. The matching diagram is in architectureDiagram.png .

This is an architecture draft only: no code, no database tables, no endpoint details, no infrastructure.

## 1. Purpose and scope

The tracker lets an employee submit an internal request and follow it until it is closed, and lets a handler keep it up to date. It does not do the requested work, and it is not for customers, AI features, or analytics.

This draft covers the main components, the system boundary, the important flows, what happens when something fails, and the decisions behind the design.

## 2. Requirements that shaped the architecture

Only the requirements that forced a structural choice are listed here.

- **R1 - Submitting.** An employee submits a request, and an incomplete one is rejected with a clear message. The app collects the information, but the backend checks it before anything is saved. *(spec FR-1, FR-11)*
- **R2 - Confirmation.** A saved request gets a reference and a starting status, shown only after storage confirms the save. *(FR-2)*
- **R3 - Viewing.** An employee lists and opens their own requests and sees status, latest update and history. This needs storage and a protected read path. *(FR-3, FR-4)*
- **R4 - Handler updates and comments.** A handler sees the requests they are responsible for, takes responsibility, changes status and adds updates. Both sides can comment, so comments need the same permission check. *(FR-5, FR-6, FR-7, FR-8, FR-9)*
- **R5 - Permissions.** Users must not see or change requests without permission, so every protected action is checked in one place. *(FR-12)*
- **R6 - Reliable saving.** If the tracker says something was saved, it must not lose it, and both sides must see the same status. *(Reliability)*
- **R7 - Scale is unknown.** No user or request numbers are given, so I kept the design direct and small. *(Performance, Scale)*
- **R8 - History cannot be rewritten.** Every status change records who and when, and history may be added to but never edited or deleted. This applies to everyone, including handlers. *(FR-10, Auditability, and the history constraint)*
- **C1 - Open questions.** Status transitions, visibility rules, assignment, transfers and notifications are still unknown. The design needs a place to check these rules later, but I should not invent the answers.

## 3. Actors

- **Employee (requester)** - submits a request and follows it.
- **Request handler** - handles requests they are responsible for and updates them.
- **Responsible department** - does the actual work. How it does that is outside this product.
- **Process owner** - answers the open questions.

The last three are assumptions from product-spec.md, and I kept them as assumptions.

## 4. System boundary

**Inside:** the User-Facing App, the Request Backend, Request Storage.

**Outside:** employees and handlers themselves, the departments doing the work, the process owner, and the organization's Identity Service. The Identity Service is the one external part the tracker really depends on, because sign-in stops working when it is unavailable.

## 5. Components and responsibilities

**User-Facing App.** Shows forms, lists, request details, history and error messages. It can catch simple input mistakes to help the user, but it is not where permission and request rules are finally checked. It exists because R1 to R4 need a surface.

**Request Backend.** Receives every action, checks permission and required information, creates references, applies the request rules, and reads or saves through storage. I kept these together because the rules must be checked in one trusted place. It is one component, not microservices, because nothing in the spec needs that complexity. It exists because of R1, R4, R5 and R8.

**Request Storage.** Keeps the official saved information: requester, responsibility, current status, latest update and history. History is only added to, never edited, because of R8. The storage type is not chosen yet. It exists because of R2, R3, R6 and R8.

**Organization Identity Service (external).** Signs users in and tells the tracker who they are. product-spec.md already assumes login exists, so I did not build a separate account system.

## 6. Data flows

The main flows are: sign in, submit a request, list or open requests, and update a status. All of them follow the same shape - the app sends an action, the backend checks who the user is and what they may do, and storage holds the result.

### Tracing one request

Below is one action followed step by step, asking at each step what crosses, what rule applies and what can fail. I chose a handler changing a status because it touches every component.

1. **Handler opens the app.** Crosses: sign-in information. Rule: the user must be signed in. Can fail: sign-in expired, or the Identity Service is down.
2. **App asks the backend for the handler's requests.** Crosses: identity and the request wanted. Rule: a handler only receives requests they may handle. Can fail: identity cannot be confirmed, so the backend returns nothing rather than everything.
3. **Backend confirms what the user may do.** Crosses: identity information from the Identity Service. Rule: permission is decided in the backend, not on the screen. Can fail: the Identity Service is slow or silent, so the action is refused rather than assumed.
4. **Handler submits the status change.** Crosses: the reference, new status and update text. Rule: the handler must be allowed to update this request. Can fail: another handler already took it.
5. **Backend checks the change.** Crosses: current and new status. Rule: only allowed changes are accepted. The status names are assumed in the spec and the allowed transitions are not decided yet, but this is where they will be checked. Can fail: the change is rejected and the old status stays.
6. **Storage saves the status and history together.** Crosses: status, who changed it, when. Rule: both are saved or neither is. Can fail: storage is unavailable, so the handler is told it was not saved.
7. **Employee opens the request later.** Crosses: reference and identity. Rule: an employee sees only their own request. Can fail: nothing new, because the same check as step 3 applies.

Step 3 matters most. Permission depends on information from outside the tracker, so it has to be re-checked in the backend every time.

## 7. Trust, permissions and validation

**Authentication asks who you are.** The Identity Service handles sign-in.
**Authorization asks what you may do.** The backend checks this before every protected action. The app may hide buttons to help the user, but hiding a button is not security.

Information from a user's device is never trusted on its own. The backend validates required information and allowed changes before saving.

There are two trust boundaries:

1. **User device to tracker.** User input enters the trusted system here. The tracker checks identity, permission and input, and returns only what that user may see.
2. **Tracker to Identity Service.** Information crosses to an external system the tracker does not control, so its answers are checked before use.

Backend to storage is an internal boundary, not an external one. Users never reach storage directly.

## 8. Communication

The app talks to the backend through an API using simple request-and-response communication, and the backend reads and saves through storage. I chose this because users need an immediate answer.

Updates reach the employee by reading: when they open or refresh a request, the app asks the backend for the current status through the same API. Nothing pushes updates to them.

I looked at the three options from the lecture and none of them fits a requirement here. A webhook is how an outside provider tells us something changed, but every status change is made by a handler through our own backend, so there is nobody outside to notify us. Polling means repeatedly asking for something that may not be ready, but storage always holds the current status. A WebSocket keeps a connection open for live exchange, and status changes here happen minutes or hours apart. product-spec.md never asks the employee to see a change without opening the app, so reading on demand is enough. Endpoint details are implementation work and are not part of this draft.

## 9. Failures

For each one: who notices, what the user sees, what the safe behavior is.

- **Missing required information.** Backend notices. User sees what to fix. Nothing is created or half-saved. *(R1)*
- **No permission.** Backend notices. User sees a clear message with no private details. The request is unchanged. *(R5)*
- **Identity Service unavailable.** Backend notices. The action cannot continue. Never skip authentication - ask the user to retry. *(R5, C1)*
- **Storage slow or unavailable on save.** Backend notices. User is told the save did not finish. Never show "saved" when it was not. *(R2, R6)*
- **Status saved but history entry not.** Backend notices. The user sees nothing unusual, which is what makes this dangerous. Save both or neither. *(R6, R8)*
- **Two handlers act on the same request.** Backend notices. The second handler is told someone else is already responsible. Only one handler is responsible at a time, so the second action is rejected rather than merged. *(R4, R5)*
- **App or backend temporarily down.** The failed action reveals it. User sees a temporary error. Already-saved requests stay safe and the user retries. *(R6)*

The rule I care about most: **the tracker only says "saved" after storage has actually saved it**, and the status and its history entry are saved together.

## 10. Scalability

product-spec.md gives no user or request numbers, so I am not designing for an imagined large scale. One app, one backend and one storage component is a reasonable start for an internal product.

Instead of guessing at a big number, I asked what would break first at the size we actually have. Two things stand out. Handlers refreshing their list of requests is the most repeated action, so reading requests is the first thing that would feel slow. And history only grows, because R8 says entries are never removed, so it grows faster than the number of requests does.

Neither is a problem yet, and neither justifies a cache, a queue or extra services today. If reading later becomes slow, that is the point to make a decision about it, and it would get its own record here.

## 11. Decisions

**D1 - One backend component.** Rules, updates, history and permission checks need a home. Options: one backend, or separate services. I chose one backend so the rules stay together. It is easier to understand now, and can be split later if there is a real need.

**D2 - Use the organization's Identity Service.** The tracker needs to know who is an employee or handler. Options: our own accounts, or the existing sign-in system. I chose the existing one. This avoids duplicate accounts, but sign-in now depends on another system, and the tracker must not skip security when it is down.

**D3 - Confirm only after saving.** The tracker must not lose something it called saved. Options: confirm immediately, or wait for storage. I chose to wait. Safer, and both sides see the same information. If storage is down the user retries instead of getting a false confirmation.

**D4 - Direct communication, no notifications yet.** Users need an immediate answer, and notifications are still an open question. Options: direct calls, or add queues and notifications now. I chose direct calls only. If notifications are confirmed later, one more component and flow would be needed.

**D5 - History is only added to.** R8 says history cannot be edited or deleted. Options: let handlers correct earlier entries, or keep every entry. I chose to keep every entry, with no edit or delete for anyone. A mistaken update stays visible and the history grows over time, but the history remains reliable.

**D6 - The backend owns the Identity Service integration.** The tracker has to talk to an external system, and something has to own that boundary. Options: the app calls the Identity Service directly, or the backend owns the connection and the app only ever talks to the backend. I chose the backend. The app then holds no credentials for an external system, and permission is decided in one place rather than in every screen. The cost is that the backend does more work and the app cannot do anything useful while the backend is unreachable. I would make the same choice for any future external system, so this decision is about the boundary, not just about sign-in.

## 12. Assumptions carried from product-spec.md

The tracker can identify employees and authorized handlers; each request has one requester; one department and one handler are responsible at a time; handlers control the official status; the assumed statuses (New, In Progress, Done, with Rejected and Cancelled as end states) still need confirmation; the requester knows which department to send to; and the product tracks work rather than doing it.

My one architecture assumption: the Identity Service can give the tracker a stable user identity. How permissions are managed is still unknown.

## 13. Traceability

- **User-Facing App** - employees and handlers need to submit, view and update.
- **Request Backend** - required information, rules, references and permissions must be checked in one place.
- **Request Storage** - saved requests, status and history must not be lost.
- **History only added to** - the spec forbids editing or deleting history.
- **Identity Service** - the spec assumes users can already be identified.
- **One backend** - scale is unknown, so microservices are not justified.
- **Backend owns the external connection** - the app must not hold credentials for a system we do not control.
- **No notification component** - notifications are still an open question.

## 14. What "done" means here

**Major parts and why.** Three inside the tracker: the app because R1 to R4 need a surface, the backend because R1, R4, R5 and R8 need checks in one trusted place, and storage because R2, R3, R6 and R8 mean information must survive and must not be rewritten.

**Inside vs outside.** Inside: app, backend, storage. Outside: users, departments, process owner and the Identity Service, which is the real dependency.

**How information moves and where checks matter.** Section 6 traces one request. Checks matter where user input arrives and where the tracker talks to the Identity Service. Both happen in the backend, which is why the rules live there.

**Failures and which requirement caused each decision.** Section 9 lists seven failures with detection, user experience and safe behavior. Section 11 records six decisions, and section 13 links every part back to product-spec.md.
