# Internal Request Tracker - Product Specification

> The requirements below are the original Week 1 product plan. They include assumptions and features that have not been built yet. The Week 4 update at the end explains the AI intake scope (see week4-production-ai.md), and the Week 5 update lists what version 1 delivers and answers the open questions.


## Problem / Context

Employees find it hard to track internal requests. After sending a request, they may not know whether it was received, who is working on it, or what its current status is.

We need a product that lets an employee follow a request from the moment they send it until it is closed. It should also let the responsible staff keep each request up to date.

The original business request is one sentence. Most of what follows is therefore assumed, not given. Assumptions are marked as such so they can be corrected before anything is built.

## Known Facts

These come directly from the business request. Nothing else is confirmed.

- The users are employees of the organization.
- The requests are for work inside the organization.
- Employees currently find it hard to track these requests.

Everything beyond these three points is an assumption or an open question.

## Actors / Stakeholders

- **Employee (requester)** - known. Sends a request and wants to know what is happening with it.
- **Request handler** - assumed. Receives requests and updates their progress.
- **Responsible department** - assumed. The group a request is assigned to.
- **Department manager** - assumed. May want to see all requests for their department. Whether this role exists in version 1 is an open question.
- **Process owner** - assumed. The stakeholder who can answer the open questions in this draft.

## Functional Requirements

These requirements are based on the assumptions below. They may change when the open questions are answered.

1. An employee can send an internal request containing the required information.
2. The product confirms the request was received and gives it a reference the employee can use to find it again.
3. An employee can see a list of the requests they sent, with the current status of each.
4. An employee can open a request and see its details, current status, latest update, history, and responsible department if one is assigned.
5. An employee can add a comment to their own request, for example to supply missing information.
6. A request handler can see the requests they are responsible for.
7. A request handler can take responsibility for a request.
8. A request handler can change a request's status and add a progress update.
9. A request handler can add a comment that the employee can read.
10. Every status change is recorded with who made it and when.
11. The product rejects a request that is missing required information, and explains what needs to be fixed.
12. The product prevents users from seeing or changing requests they do not have permission for.

## Non-Functional Requirements

- **Usability:** sending, finding, and understanding a request should be easy without training. Labels and error messages should use simple language.
- **Reliability:** if the product says a request or update was saved, it must not lose it. Employee and handler must see the same current status.
- **Security and privacy:** users see or change requests only where they have permission.
- **Auditability:** the history of a request must be readable and must not be silently rewritten.
- **Performance:** common actions should not feel slow. The exact target is unknown.
- **Scale:** unknown. No user or request volume has been given.

## Assumptions

These are working guesses that let the draft move forward. Any of them may need to change.

- The product can identify employees and authorized request handlers. Login already exists in the organization.
- Employees will send requests through this product, rather than only view requests they sent somewhere else.
- Each request has exactly one employee as its requester.
- One department is responsible for a request at a time.
- One handler is responsible for a request at any given moment.
- Handlers, not requesters, control the official status.
- The status set is assumed to be: New -> In Progress -> Done, with Rejected and Cancelled as end states. These names are a guess and need confirmation.
- The requester knows which department to send a request to.
- Handlers check the system during working hours.
- The first version tracks work. It does not perform the requested work automatically.

## Constraints

- Requests must always be tied to an identified employee. Anonymous or shared submissions are not allowed.
- The history of a request may be added to but not edited or deleted.
- A request is owned by exactly one department at a time. Two departments cannot own the same request at once.
- Statuses are fixed by the product. Users cannot invent their own status names.
- The product must fit the organization's existing departments. It cannot require a reorganization.
- It must follow the organization's privacy and access rules. Those rules are not yet known.
- Technical choices wait until the open questions are confirmed.

## Unknowns

- What types of internal request will the product support?
- What information is required when sending a request?
- What are the real status names, and which transitions are allowed?
- Who can see a request: only the requester, the department, managers, anyone?
- How is a request assigned to a department or handler - chosen by the requester, routed automatically, or picked up?
- Can a request move between departments? If so, who may move it and what does the requester see?
- Should the product notify people outside the product, for example by email?
- Can an employee edit or cancel a request after sending it? Until what point?
- Can a rejected request be reopened, or must a new one be created?
- Do requests need a priority, due date, or expected completion time?
- Can a request carry file attachments?
- What happens to open requests when an employee or handler leaves?
- How many users and requests must the product support?
- How much uptime is required, and how long should data be kept?

## Non-Goals

- Handling requests from customers or the public.
- Changing how each department does its internal work.
- Completing or deciding requests automatically.
- Multi-level approval chains.
- Reports or analytics beyond what is needed to track a single request.
- AI features without a clear need.
- Replacing email or chat for general communication.
- Time tracking or measuring employee performance.

## Acceptance Criteria

### Sending a valid request
Given an employee has entered all required information, when they send the request, then the product saves it, shows a confirmation and reference, and adds it to their request list with a starting status.

### Missing required information
Given an employee has not entered all required information, when they try to send the request, then the product does not create it and shows what needs to be fixed.

### Request reaches the department without a nudge
Given a request has been submitted, when the responsible department views its list of requests, then the new request is already there. No email or message is needed to tell them it exists.

### Viewing a request
Given an employee has sent a request, when they open it, then they can see its details, current status, latest update, history, and responsible department if one is assigned.

### Updating a status
Given an authorized handler is responsible for a request, when they change its status and add an update, then the product saves the change and the requester can see it without asking anyone.

### Reading the history
Given a request has changed status at least once, when anyone permitted opens it, then they see each change with the name of the person who made it and the time it happened.

### Stopping an unauthorized change
Given a user does not have permission to change a request's status, when they attempt to change it, then the product rejects the change and keeps the previous status.

### Request not found or not permitted
Given a user tries to open a request that does not exist or that they may not see, when the product checks it, then no private information is shown and a clear message is displayed.

## Examples of Correct Behavior

These use the assumed status names above. If the real names differ, the behavior stays the same.

**Normal flow**
An employee sends "Need access to the shared design drive" to IT. It appears as New with a reference. A handler in IT takes responsibility and sets it to In Progress. They comment asking which folder. The employee replies in a comment. The handler grants access and sets it to Done. The employee opens the request and sees the whole history.

**Cancelled**
An employee requests a replacement charger, then finds one at their desk. The request is still New, so they cancel it. It leaves the department's active list.

**Rejected and redirected**
An employee asks Finance for a salary certificate. Finance sets the request to Rejected with a comment explaining it belongs to HR. The employee reads the reason and sends a new request to HR. Whether the product should instead transfer the request between departments is an open question.

**Permission**
An employee tries to open a colleague's request. They are neither the requester nor a handler for that department, so the product does not show it and displays a clear message.

## Week 4 amendment - AI-assisted request intake

**Why:** employees may not know where an issue belongs or what details a handler needs. The AI has one specific job: use the employee's own words to prepare a suggestion for review. This allows AI for this feature, even though the original plan excluded it.

The requester can describe an issue, request a suggestion, review the suggested department, summary, missing details and next step, then revise the text and try again. Suggestions alone are not saved or submitted. The original Week 4 feature stopped at a preview. The later workflow below adds a separate submit action and department conversations.

IT, HR and FINANCE are the routing values controlled by the backend for now. UNDETERMINED means the department is unclear. A suggestion never gives a user department access or assigns official ownership. The backend allows intake only for the demo requester role. Existing assigned-handler status permissions remain unchanged. The actor selector is not production authentication.

Acceptance criteria: valid input returns a checked preview with four fields. Vague or unclear input leads to a request for more detail. The AI should not ask again for details already supplied. Invalid input is rejected before the provider is called. If the provider fails, the text stays on screen and the user can retry. Editing the input or switching actors clears old suggestions. Saved requests and history stay unchanged whether a suggestion succeeds or fails. The software checks that fields are valid; evaluations and human review check whether the advice is useful.

The intake UI shows supported departments before an AI call and allows an optional draft department selection. The employee keeps control of a manual choice and must choose whether to accept a different AI recommendation. Selection stays local until the employee presses Submit; it is excluded from AI suggestion calls and clears when switching actors. Submit sends the selected department to the backend for validation and request creation. Changing the selection alone does not submit or assign work. Saved request selection belongs to a separate tracking section.

The six decisions about what context to send and who has final authority, the exact API contract and test results are in [Week 4 delivery](week4-production-ai.md). Broader Week 1 requirements remain future scope unless delivered in the Week 3 or Week 4 notes.

The presentation uses separate preparation and tracking views. Preparation follows describe -> generate -> review/correct -> submit, with an optional copy action. Copying only puts text on the local clipboard. Submitting is the separate action that saves it. The optional manual routing controls stay collapsed until needed; the checked suggestion shows the department for review. Actor controls are in the sidebar under Testing workspace. AI generation is optional: manual department selection also allows submission.

## Later implementation note

The later department workflow adds a separate submit action, department inboxes, the ability for handlers to claim requests, and saved replies. See [Department workflow](department-workflow.md); the AI remains advisory.

## Week 5 amendment - final scope and answers to open questions

**Why:** the product is now released as a live demo. This section records what version 1 actually delivers, and gives a working answer to each Week 1 unknown so the scope is explicit. These are proposed product decisions for the demo, not confirmed organization policy. The original requirements above are unchanged.

### Functional requirements: delivered or not

| Requirement | Status in v0.5 |
| --- | --- |
| FR-1 Send a request | Done. Employees submit with a description, summary and department; AI help is optional. |
| FR-2 Confirmation and reference | Done. Short sequential ticket numbers (REQ-1006 onward) shown after saving. |
| FR-3 List own requests with status | Done. **My requests**, with Open / Done filters. |
| FR-4 Details, status, latest update, history, department | Done. The latest update is the newest reply or status note; there is no separate field. |
| FR-5 Employee comments | Done, while the request is open. |
| FR-6 Handler sees their requests | Done as a department inbox (assigned and unassigned). |
| FR-7 Take responsibility | Done. Claim, protected against two handlers claiming at once. |
| FR-8 Change status and add a progress update | Done. Status change with an optional note, saved in the same transaction. |
| FR-9 Handler comments visible to the employee | Done. |
| FR-10 Who and when for every status change | Done. Append-only history with account and time. |
| FR-11 Reject missing information | Done. Backend validation with clear messages. |
| FR-12 Prevent unauthorized access or change | Done for the demo accounts: one server-side policy (404 / 403). Real sign-in is not included ([ADR-003](decisions/ADR-003.md)). |

The assumption "login already exists in the organization" did not hold for this project. Demo accounts stand in for it, which is acceptable only with fictional data.

### Answers to the unknowns

| Unknown | Working answer for v1 | In the product? |
| --- | --- | --- |
| Request types | IT, HR and Finance service requests, as described in the service directory | Yes |
| Required information | Description, summary and a supported department. AI questions help but do not block a manual submission. | Yes |
| Status names and transitions | `NEW -> IN_PROGRESS -> DONE`, no skipping and no going back | Yes |
| Rejected and Cancelled | Deferred. A fuller product could let the requester cancel a NEW request and the assignee reject with a reason. | No |
| Who can see a request | The requester and handlers of the receiving department; the assigned handler keeps access | Yes |
| Managers | No manager role in v1 | No |
| How assignment works | The employee chooses the department (AI may suggest); a handler in that department claims it | Yes |
| Transfers between departments | Deferred; would need an explicit reason and an ownership event | No |
| Notifications outside the product | Not in v1. Lists refresh every 30 seconds in the app. | No |
| Edit after sending | Not allowed; add information as a comment | Yes (no edit) |
| Cancel after sending | Deferred | No |
| Reopen | No. DONE closes the conversation; send a new request. | Yes |
| Priority, due date | Deferred; no deadlines are promised | No |
| Attachments | Deferred; would need private storage and file checks | No |
| Employee or handler leaves | Needs real accounts and administration; out of scope for the demo | No |
| Scale | Sized for a demo on free tiers; no measured capacity claim | - |
| Uptime and retention | Best effort on free hosting, disclosed; fictional data only | - |
| Can handlers submit their own requests? | Not in the demo (roles are separate). Real use would give every employee submit rights plus separate handling permissions, and forbid handling your own request. | No |

These answers keep the "harder, not bigger" rule from Day 15: deferred features are listed here instead of being half-built.
