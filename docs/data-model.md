# Internal Request Tracker - Data Model

Based on product-spec.md and architecture.md. A data model is behavior made durable: it describes what the system must remember and what rules it must keep, so that the behavior still works after requests, restarts and time. It is not a database schema.

No tables, no field types, no code. I explain why I chose relational or document thinking, but the database is not set up yet.

## 1. From behavior to durable state

I started from the requirement the whole product exists for:

> An employee can open a request and see its current status, latest update, history and responsible department.

The architecture already said who does what: the app shows it, the backend decides what the user may see, and storage keeps it. Data modeling asks four more questions.

- **What has identity?** Employee, Department, Request, Status Event, Comment.
- **What changes over time?** The status of a request, who is responsible for it, and the history that explains both.
- **What must never be false?** An employee must not see someone else's request, and history must not be changed.
- **How will we find it?** My own requests, a department's list of requests, and one request with its full history.

I did not start by making tables. If I had, I would probably have copied the screen instead of modeling the product.

## 2. Domain

### Entities

An entity is a thing the system needs to identify and follow over time.

**Employee** - a person who uses the tracker, as a requester or as a handler. The Identity Service knows who they are, so the tracker only keeps a link to that identity. It does not keep its own copy of their details.

**Department** - the group a request is sent to. It is its own thing because requests are routed to it and handlers belong to it. product-spec.md says the tracker must fit the departments the organization already has, so departments are linked to, not invented.

**Request** - the main entity. It has its own identity, its own lifecycle and its own history, so it is clearly an entity. It also carries the reference from R2, the one the employee is given and can use to find the request again. That reference is part of the request, not a detail of the screen.

**Status Event** - one saved status change, with who made it and when. Section 3 explains why this is its own entity.

**Comment** - a message added to a request by the employee or the handler. It has an author and a time, so it is more than a piece of text.

### Relationships and cardinality

A relationship is how two things in the product are connected. Cardinality is how many of one can connect to how many of the other. These should explain the product, not just copy what a database would need.

- One Employee sends many Requests. One Request has exactly one requester.
- One Department has many Employees. One Employee belongs to one Department. This is the least supported line in the file and I am marking it as such: product-spec.md never states it, and architecture.md says how permissions are managed is still unknown. I include it because a handler is described as belonging to a department, so the model has to be able to express that connection rather than leave a rule pointing at nothing. Whether a person can belong to more than one, and where the membership comes from, both wait on the visibility question the spec leaves open.
- One Department is responsible for many Requests. One Request belongs to exactly one Department at a time.
- One Employee can be the handler for many Requests. One Request has at most one handler at a time, and none before a handler takes it.
- One Request has many Status Events. Each Status Event belongs to exactly one Request.
- One Request has many Comments. Each Comment belongs to one Request and has one author.

The words "at a time" matter here. product-spec.md says one department and one handler are responsible at any moment, but it also leaves department transfer as an open question. If transfers are allowed later, then the department becomes something that changes over time, and it would need its own history, just like status does. I wrote the model so that answer can be added later without changing the rest.

### Ownership

Ownership means which record belongs to which person or group. It sounds obvious, but it is the thing every permission rule is checked against.

The architecture said the backend owns permissions. For the backend to check them, the model has to make ownership visible. So every Request keeps both its requester and its department. Without those two, "only your own requests" would have nothing to check against, and any department rule the organization later confirms would have nothing to check against either.

## 3. Entity or attribute: the status decision

An attribute is a value that describes something else, like a colour or a number on a form. An entity is a thing in its own right, with identity, relationships and a history. Deciding which one something is was the real modeling decision here.

Status could be one value on the Request that we change each time. That answers "what is the status now" and nothing else. As soon as someone asks "when did it become In Progress" or "who rejected it", the answer is gone, because the old value was written over.

product-spec.md says every status change must be saved with who made it and when, and that history can be added to but never edited or deleted. So keeping only the current status would lose the exact story the product is meant to tell.

My decision is to keep both. The Request holds its current status, and every change also creates a Status Event with the new status, the person and the time. This is recorded in ADR-001.

Comments work the same way on a smaller scale. One `comments` text field would be a block of text with no author and no order. Both the employee and the handler can comment, and the employee needs to know who said what, so a Comment has its own identity, author and time.

## 4. Lifecycle and rules

State is where something is right now. Lifecycle is the journey: which moves from one state to another are allowed over time. The two are not the same thing, and mixing them up is how a product ends up unable to explain how something changed.

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

Not every rule is a database constraint. Different mechanisms protect different things, so I named each rule before choosing how to enforce it.

**Database constraints** protect structure: a Request must point to a real Employee and a real Department, a Status Event must point to a real Request, and the reference shown to the employee must be unique.

**Backend logic** protects behavior: which status changes are allowed, that the status and its Status Event are saved together, and that a second handler cannot take a request someone already has.

**Permission checks** protect visibility: who may read a request, who may comment, and who may change status. They depend on who the user is, which architecture.md sources from the Identity Service, and on that user's relationship to the request. architecture.md decides these in the backend on every action, and says plainly that how permissions are managed is still unknown. So they cannot be a rule about stored data alone.

The rule that history is never edited uses two of these. The backend offers no way to edit or delete, and nobody, including handlers, is allowed to do it.

## 5. Storage

### Relational or document

Relational storage keeps things in separate related records and joins them when reading. Document storage keeps a whole thing together in one nested piece. Both can be used well and both can be used badly, so I used the decision frame instead of a preference.

**How connected is the data?** Very. Requests connect to employees, departments, events and comments, and permissions depend on following those connections.

**What must change together?** A status change and its Status Event must be saved as one, or not at all. The architecture already decided this, and it is the strongest signal here.

**How will the product read it?** Mostly by requester, by department, or one request with its events in time order.

**How stable is the shape?** Stable. A request looks the same for every department.

**Modeling direction:** relational storage looks like a good fit for this product. The relationships are central, things must stay consistent across records, and the queries join related data.

This is a decision about the shape of the model, not about which database product to use. architecture.md says the storage technology is not chosen yet, and that is still true.

**Consequence:** more joins than a document model, and the history of an old request is spread over many event rows. I accept that, because the other option loses the guarantee I care about most.

A document model was a real option, with the events kept inside the request. It would make "one request with its history" a single read. I did not choose it because permission checks reach across requests, departments and employees, and because history keeps growing forever. Putting a list that never stops growing inside one document gets worse over time, not better.

### Durable or derived

Something is durable when the system stores it on purpose. It is derived when the system can work it out from something else it already stores. Deciding which is which keeps the model honest about what is really being kept.

The current status can be worked out from the newest Status Event, so I do not strictly need to store it. I store it on the Request anyway.

This is a deliberate copy. Without it, showing a department's list would mean finding the newest event for every request in that list, and that is the most repeated action in the product. The cost is that the same fact now lives in two places and they could disagree. That is exactly why the rule from the architecture matters: the status and its event are saved together or neither is saved.

## 6. Access

An access pattern is a common way the application needs to find or read data. Patterns come before indexes, because an index only makes sense once you can name the query it is paying for. These are the ways this product really reads data, taken from the requirements and not from imagined future reports.

- **My requests** - the employee's own list, newest first.
- **Department request list** - requests for one department, filtered by status, for users who are allowed to view that list.
- **One request with its history** - the request, its events in time order, and its comments.
- **Find by reference** - the employee has the reference from R2 and wants to open that request.

An index is a structure the database keeps so that a particular lookup is fast. It is not free: it costs storage, and it makes writing slower. From those four patterns, and only those, the indexes I can justify are: requests by requester, requests by department and status, status events by request and time, and a unique index on the reference.

I am not adding any others. If I cannot name the access pattern an index is paying for, the index should be questioned.

## 7. Checking the files against each other

A contradiction between the spec, the architecture and this model is not a documentation problem. It is a bug waiting to happen. So I checked the three files against each other.

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
