# Internal Request Tracker

The Internal Request Tracker is a proposed internal product that helps employees submit requests and follow their progress until completion. It also gives authorized request handlers a place to manage and update those requests.

## Current Status

This repository contains the product foundation and design documentation.

The application has not been implemented yet. There is currently:

- No frontend or backend code
- No database
- No deployment or production infrastructure
- No AI functionality

## Repository Structure

- [`docs/product-spec.md`](docs/product-spec.md) - product problem, requirements, assumptions, constraints, unknowns, and acceptance criteria
- [`docs/architecture.md`](docs/architecture.md) - system boundaries, components, data flows, trust boundaries, failures, and architectural decisions
- [`docs/architectureDiagram.png`](docs/architectureDiagram.png) - visual representation of the proposed architecture
- [`docs/data-model.md`](docs/data-model.md) - domain entities, relationships, lifecycle rules, storage reasoning, and access patterns
- [`docs/decisions/ADR-001.md`](docs/decisions/ADR-001.md) - decision to preserve both the current request status and its status history

## Product Scope

The proposed product allows employees to:

- Submit internal requests
- Receive a reference after a request is saved
- View their requests and current statuses
- Follow request history and progress
- Add comments where permitted

Authorized request handlers can view assigned requests, take responsibility, update statuses, and record progress.

The product tracks internal work; it does not perform the requested work itself.

## Design Approach

The repository follows this progression:

1. Business need
2. Product specification
3. System architecture
4. Data model
5. Architecture decision record

These documents are intended to tell one consistent story. Assumptions and unresolved business questions are identified instead of being treated as confirmed requirements.

## Running the Project

There is no runnable application yet. This repository currently contains documentation only.

## Open Questions

Important unresolved questions include:

- Which request types will be supported?
- What information is required when submitting a request?
- What are the final statuses and allowed transitions?
- Who may view each request?
- How are requests assigned or transferred?
- Are notifications required?
- What performance, availability, and retention targets apply?
