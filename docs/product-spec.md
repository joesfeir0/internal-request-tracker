# Internal Request Tracker - Product Specification


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

These rest on the assumptions below and may change once the open questions are answered.

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

Working guesses made so the draft can move forward. Each is a candidate to be corrected.

- The product can identify employees and authorized request handlers. Login already exists in the organization.
- Employees will send requests through this product, not merely use it to view requests sent elsewhere.
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
- A request is owned by exactly one department at a time. It cannot be jointly owned.
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
- What availability and data retention targets apply?

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
