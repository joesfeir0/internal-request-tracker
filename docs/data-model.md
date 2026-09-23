# Internal Request Tracker - Data Model

> This is the original Week 1 data model. It describes the design ideas, rather than every table that was later built. Week 3 added ServiceRequest and StatusEvent with Prisma/SQLite. The Week 4 update at the end explains the difference between temporary AI suggestions and saved records.

Based on product-spec.md and architecture.md. A data model describes what the system must remember and which rules it must keep. This lets the product keep working across requests, restarts and time. It is not a database schema.

No tables, no field types, no code. I explain the choice between relational and document storage, but the database is not set up yet.

## 1. From behavior to durable state

I started from the requirement the whole product exists for:

> An employee can open a request and see its current status, latest update, history and responsible department.

The architecture already explains each part's job: the app shows it, the backend decides what the user may see, and storage keeps it. Data modeling asks four more questions.

- **What has identity?** Employee, Department, Request, Status Event, Comment.
- **What changes over time?** The status of a request, who is responsible for it, and the history that explains both.
- **Which rules must always hold?** An employee must not see someone else's request, and history must not be changed.
- **How will we find it?** My own requests, a department's list of requests, and one request with its full history.

I did not start by making tables. If I had, I would probably have copied the screen instead of modeling the product.

## 2. Domain

### Entities

An entity is a thing the system needs to identify and follow over time.

**Employee** - a person who uses the tracker, as a requester or as a handler. The Identity Service knows who they are, so the tracker only keeps a link to that identity. It does not keep its own copy of their details.

**Department** - the group a request is sent to. It has its own identity because requests are sent to it and handlers belong to it. product-spec.md says the tracker must fit the departments the organization already has, so departments are linked to, not invented.

**Request** - the main entity. It has its own identity, its own lifecycle and its own history, so it is clearly an entity. It also carries the reference from R2, the one the employee is given and can use to find the request again. That reference is part of the request, not a detail of the screen.

**Status Event** - one saved status change, with who made it and when. Section 3 explains why this is its own entity.

**Comment** - a message added to a request by the employee or the handler. It has an author and a time, so it is more than a piece of text.

### Relationships and cardinality

A relationship is how two things in the product are connected. Cardinality is how many of one can connect to how many of the other. These should explain the product, not just copy what a database would need.

- One Employee sends many Requests. One Request has exactly one requester.
- One Department has many Employees. One Employee belongs to one Department. This is the least certain assumption in this file: product-spec.md never states it, and architecture.md says permission management is still undecided. I included it because handlers are described as belonging to departments, so the model needs to show that connection. We still need to answer the spec's visibility question before deciding whether a person can belong to several departments and where membership information comes from.
- One Department is responsible for many Requests. One Request belongs to exactly one Department at a time.
- One Employee can be the handler for many Requests. One Request has at most one handler at a time, and none before a handler takes it.
- One Request has many Status Events. Each Status Event belongs to exactly one Request.
- One Request has many Comments. Each Comment belongs to one Request and has one author.

The words "at a time" matter here. product-spec.md says one department and one handler are responsible at any moment, but it also leaves department transfer as an open question. If transfers are allowed later, then the department becomes something that changes over time, and it would need its own history, just like status does. I wrote the model so that answer can be added later without changing the rest.

### Ownership

Ownership means which record belongs to which person or group. It sounds obvious, but it is the thing every permission rule is checked against.

The architecture said the backend owns permissions. For the backend to check them, the model has to make ownership visible. So every Request keeps both its requester and its department. These fields let the backend check "only your own requests" and any department access rule the organization confirms later.

## 3. Entity or attribute: the status decision

An attribute is a value that describes something else, like a colour or a number on a form. An entity is a thing in its own right, with identity, relationships and a history. Deciding which one something is was the real modeling decision here.

Status could be one value on the Request that we change each time. That answers "what is the status now" and nothing else. As soon as someone asks "when did it become In Progress" or "who rejected it", the answer is gone, because the old value was written over.

product-spec.md says every status change must be saved with who made it and when, and that history can be added to but never edited or deleted. So keeping only the current status would lose the exact story the product is meant to tell.

My decision is to keep both. The Request holds its current status, and every change also creates a Status Event with the new status, the person and the time. This is recorded in ADR-001.

Comments work the same way on a smaller scale. One `comments` text field would be a block of text with no author and no order. Both the employee and the handler can comment, and the employee needs to know who said what, so a Comment has its own identity, author and time.

## 4. Lifecycle and rules

State is where something is right now. Lifecycle is the journey: which moves from one state to another are allowed over time. Keeping these ideas separate helps the product explain how a request changed.

### States

product-spec.md currently assumes these statuses, and says the names still need confirmation:

- New
- In Progress
- Done
- Rejected
- Cancelled

The examples in product-spec.md show a simple journey of New, then In Progress, then Done. They also show a request being cancelled while it is still New, and a request being rejected.

But those are examples, not a full set of rules. Which changes are allowed, and whether a Rejected request can be opened again, are still open questions. So this model does not treat the above as the final lifecycle. What it does say is that the backend is the place where the real allowed changes will be checked, once someone confirms them.

### Invariants

An invariant is a rule that must stay true for the system to be valid.

- **Ownership:** every Request belongs to a known Employee and a known Department.
- **History:** every Status Event belongs to a known Request and has a person and a time.
- **Lifecycle:** a Request cannot jump through status changes that are not allowed. Which changes those are is still open, so the rule is that a list of allowed changes exists and the backend enforces it.
- **Access:** an Employee must not see another employee's Request. That part is confirmed by product-spec.md. Who else may see a request, such as a whole department or a manager, is still an open question.
- **One handler:** a Request has at most one handler at any moment.
- **History stays:** once a Status Event is saved, it is never edited or deleted.

### Where each rule lives

Not every rule is a database constraint. Different checks protect different things. I listed each rule before deciding how to enforce it.

**Database constraints** protect structure: a Request must point to a real Employee and a real Department, a Status Event must point to a real Request, and the reference shown to the employee must be unique.

**Backend logic** protects behavior: which status changes are allowed, that the status and its Status Event are saved together, and that a second handler cannot take a request someone already has.

**Permission checks** protect visibility: who may read a request, who may comment, and who may change status. They depend on who the user is, which architecture.md sources from the Identity Service, and on that user's relationship to the request. architecture.md decides these in the backend on every action, and says plainly that how permissions are managed is still unknown. So they cannot be a rule about stored data alone.

The rule that history is never edited uses two of these. The backend offers no way to edit or delete, and nobody, including handlers, is allowed to do it.

## 5. Storage

### Relational or document

Relational storage keeps things in separate related records and joins them when reading. Document storage keeps a whole thing together in one nested piece. Either can work well or poorly. I compared them using the design questions instead of choosing one by preference.

**How connected is the data?** Very. Requests connect to employees, departments, events and comments, and permissions depend on following those connections.

**What must change together?** A status change and its Status Event must be saved as one, or not at all. The architecture already decided this, and it is the strongest reason behind this choice.

**How will the product read it?** Mostly by requester, by department, or one request with its events in time order.

**How stable is the shape?** Stable. A request looks the same for every department.

**Modeling direction:** relational storage looks like a good fit for this product. The product depends on these relationships. Records must agree with one another, and queries need to read related data together.

This is a decision about the shape of the model, not about which database product to use. architecture.md says the storage technology is not chosen yet, and that is still true.

**Consequence:** more joins than a document model, and the history of an old request is spread over many event rows. I accept that, because the other option loses the guarantee I care about most.

A document model was a real option, with the events kept inside the request. It would make "one request with its history" a single read. I did not choose it because permission checks reach across requests, departments and employees, and because history keeps growing forever. Putting a list that never stops growing inside one document gets worse over time, not better.

### Durable or derived

Durable data is information the system saves. Derived data is information it can work out from other saved values. Making this difference clear shows exactly what the system keeps.

The current status can be worked out from the newest Status Event, so I do not strictly need to store it. I store it on the Request anyway.

This is a deliberate copy. Without it, showing a department's list would mean finding the newest event for every request in that list, and that is the most repeated action in the product. The cost is that the same fact now lives in two places and they could disagree. That is exactly why the rule from the architecture matters: the status and its event are saved together or neither is saved.

## 6. Access

An access pattern is a common way the application needs to find or read data. We choose indexes after identifying these patterns, because an index should help a specific query. These are the ways this product really reads data, taken from the requirements and not from imagined future reports.

- **My requests** - the employee's own list, newest first.
- **Department request list** - requests for one department, filtered by status, for users who are allowed to view that list.
- **One request with its history** - the request, its events in time order, and its comments.
- **Find by reference** - the employee has the reference from R2 and wants to open that request.

An index is a structure the database keeps so that a particular lookup is fast. It is not free: it costs storage, and it makes writing slower. From those four patterns, and only those, the indexes I can justify are: requests by requester, requests by department and status, status events by request and time, and a unique index on the reference.

I am not adding any others. If I cannot name the access pattern an index is paying for, the index should be questioned.

## 7. Checking the files against each other

If the spec, architecture and data model disagree, the code could end up following the wrong rules. So I checked the three files against each other.

- product-spec.md needs history, and this model saves events instead of only the current state. They agree.
- product-spec.md does not allow editing history, and nothing in this model allows an edit or delete. They agree.
- architecture.md says the backend owns permissions, and this model gives every Request a requester and a department so ownership can actually be checked. They agree.
- architecture.md says the status and its history are saved together, and this model depends on that to justify storing the current status separately. They agree.
- product-spec.md leaves department transfer, notifications and reopening open, and this model does not quietly answer any of them.

## 8. What "done" means here

Another engineer should be able to explain four things from this file.

**What the system remembers.** Employees, departments, requests, the status events that explain how each request changed, and comments with their authors.

**How it connects.** One requester and one department per request, many events and comments per request, one handler at a time.

**Which rules matter.** Ownership, history that cannot be changed, a lifecycle with no impossible jumps, and access only where the user has permission. Section 4 says where each one is enforced.

**How real queries will find it.** The four access patterns in section 6, and the four indexes they justify.

## Week 4 amendment - candidate versus durable request

**Why:** an AI suggestion is advice that still needs review. It must be kept separate from an official ServiceRequest.

The current Prisma/SQLite schema contains ServiceRequest (ID, requester ID, nullable assigned handler ID, department, description, summary, creation time and status), StatusEvent (event identity/order, request ID, status, actor and time), and RequestComment (ID, request ID, author ID, message and creation time). A newly submitted request has no handler until claimed. Employee and Department are not database entities yet: the backend resolves fixed demo identities and memberships. Requesters see their own requests; department handlers see their inbox and can read and reply to its requests. Assigned handlers also retain read access, and only the assigned handler can update status. A live organization directory and production authentication remain future work.

IntakeCandidate contains suggestedDepartment, summary, missingInformation[] and suggestedNextStep. The backend checks it and builds a clean result, which the browser keeps temporarily. It has no database identity, assigned owner, status flow or saved history. AI preview alone requires no migration or candidate table. The later department workflow has its own migration for durable request fields, nullable assignment and RequestComment. A reviewed candidate's summary can become the saved request summary on explicit submission; the full candidate is not stored.

The product controls the suggestion values IT, HR, FINANCE and UNDETERMINED. They are not Department records and selecting one does not grant access. AI preview alone does not need a department column; the current ServiceRequest has one for persisted routing and inbox visibility. Suggestion calls do not write to ServiceRequest, StatusEvent or RequestComment, whether they succeed or fail. The separate POST /requests endpoint permits requesters to submit, validates description, summary and a routable department (IT, HR or FINANCE), and creates the request with its initial NEW event together.

The editable draft department stays in the browser until Submit, separately from the checked AI suggestion. A manual correction does not rewrite the original AI recommendation or enter the AI suggestion API body. Submit sends the chosen department to the request-creation endpoint for validation and routing. Neither selection nor submission creates a department membership or grants the actor additional access.

See [Week 4 delivery](week4-production-ai.md) for candidate limits, trust boundaries, evals and proof of unchanged state.

## Later implementation note

The implemented indexes differ from the Week 1 proposal: ServiceRequest has its ID primary key and a department/status index; StatusEvent has its sequence primary key, unique event ID and requestId/sequence index; RequestComment has its ID primary key and requestId/createdAt index. There is no requesterId index yet. History is ordered by sequence, not timestamp, so equal timestamps do not make its order ambiguous. Actor IDs are strings resolved through the demo actor directory, not foreign keys to Employee records.

The later workflow saves department, description and summary fields, allows the assigned handler to be null, and adds RequestComment. The Department entity from the original design is still represented only by fixed routing codes and demo actor memberships. See [Department workflow](department-workflow.md).
