# Internal Request Tracker

Eurisko AI Academy project: a small NestJS backend for the Week 2 / Day 6 milestone.

It supports the provisional lifecycle `NEW -> IN_PROGRESS -> DONE`. Every successful change updates the current status and appends a history event with who changed it and when. Invalid changes leave both unchanged. Final business lifecycle rules remain open.

There is no frontend, real database, or authentication yet.

## Start the backend

Requires Node.js 22+ and npm. These commands use **Git Bash** (`MINGW64`).

From the repository root:

```bash
cd backend
npm ci
npm start
```

Skip `cd backend` if already there. Installation is only needed initially or when dependencies change. Leave this terminal running and open a second Git Bash terminal for testing.

## View the mock data

Three independent requests are seeded: `REQ-1001`, `REQ-1002`, and `REQ-1003`. Each starts at `NEW` with one history event.

Open [all requests](http://127.0.0.1:3000/requests), or read them in the terminal:

```bash
curl -sS http://127.0.0.1:3000/requests
```

The data lives in memory. **Restarting resets all three requests.** To reset, press Ctrl+C in the server terminal and run `npm start` again.

| Endpoint | Purpose |
| --- | --- |
| `GET /requests` | View all requests and histories |
| `GET /requests/:id` | View one request |
| `PATCH /requests/:id/status` | Change one request's status |

## Test status changes

Start with a fresh server. In the second Git Bash terminal, paste this helper:

```bash
change_status() {
  curl -i -X PATCH "http://127.0.0.1:3000/requests/${2:-REQ-1001}/status" \
    -H 'Content-Type: application/json' \
    -d "{\"status\":\"$1\",\"changedBy\":\"handler-001\"}"
  echo
}
```

Then run these **one at a time, in order**:

```bash
change_status DONE          # 409: stays NEW, 1 event
change_status IN_PROGRESS   # 200: IN_PROGRESS, 2 events
change_status DONE          # 200: DONE, 3 events
change_status IN_PROGRESS   # 409: stays DONE, 3 events
change_status IN_PROGRESS missing  # 404: unknown ID
```

Inspect the data after any step:

```bash
curl -sS http://127.0.0.1:3000/requests/REQ-1001
```

The latest history status must match the current status; rejected changes must preserve history.

To change another mock request independently:

```bash
change_status IN_PROGRESS REQ-1002
```

Only REQ-1002 changes. REQ-1003 remains NEW.

Status names are case-sensitive. Invalid input or blank `changedBy` returns 400. The actor is a supplied label, not an authenticated identity. Rejected and Cancelled statuses are outside this milestone.

## Run automated tests

From `backend/`:

```bash
npm test
```

The last verified run passed **13 tests**, covering valid/invalid transitions, input validation, unknown IDs, history consistency, and independent mock records. Tests start and close their own server; they do not change your running demo data.

## Common issues

- **Cannot GET /**: no homepage exists. Open [`/requests`](http://127.0.0.1:3000/requests).
- **Connection refused**: start the backend and wait for its startup message.
- **EADDRINUSE**: stop your previous server, or use `PORT=3001 npm start` and port 3001 in your URLs.
- **Bash syntax error or a stuck `>` prompt**: press Ctrl+C and paste the complete Git Bash command again. Do not use PowerShell syntax here.
- **409 on a repeated change**: read the current status; restart to repeat the walkthrough.
- **Code changes not appearing**: restart the backend. Edit `backend/src/*.ts`; `backend/dist/` is generated.

## Project files

- [Backend source](backend/src/): startup, controller routes, service logic, and status rules.
- [HTTP tests](backend/test/requests.test.cjs): reproducible verification.
- [Product specification](docs/product-spec.md), [architecture](docs/architecture.md), and [data model](docs/data-model.md): Week 1 foundation.
- [ADR-001](docs/decisions/ADR-001.md): why current status and history are stored together.
- [Week 2 workflow](docs/week2-agentic-workflow.md): scope, file explanations, and verification evidence.
