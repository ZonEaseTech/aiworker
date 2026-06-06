# Host Dev Loop Design

## Status

Approved for implementation planning on 2026-06-06.

This spec covers the Phase 2 Host developer loop. The goal is to make Host CLI,
Host API, and Host Web work together through real data so development progress is
visible in a browser, similar to the current Worker development loop.

## Problem

Host API and Host Web exist, but they are not wired into one development flow.
The current root `dev:host` script starts the Worker daemon, which is misleading
for Phase 2 Host work. Host Web also renders default assignment data instead of
reading from Host API, so creating an assignment through Host API does not change
what the developer sees in the browser.

The development loop must prove the real distribution path:

```text
Host Web or Host CLI -> Host API -> Host storage -> real Worker provision check-in -> Host Web status update
```

## Goals

- `bun run dev:host` starts the Host API and Host Web development servers.
- Host API runs on `http://127.0.0.1:9117`.
- Host Web runs on `http://127.0.0.1:5050/host`.
- Host Web reads assignment data from Host API, not from static mock data.
- Host Web can create a real assignment.
- Host CLI can create and list assignments through Host API.
- Assignment creation returns a one-time provision command.
- A real Worker provision/check-in moves the assignment from `provisioning` to
  `checked_in`.
- Host Web can refresh and show `checked_in` after the real check-in.

## Non-Goals

- No seed data.
- No dev-only check-in simulator.
- No Logto login UI in this loop.
- No Worker Access reverse tunnel implementation in this loop.
- No fake `ready` state.
- No working "open Worker" employee URL before real Worker Access exists.
- No new UI component system or ad-hoc visual language.

## Developer Command

Root `dev:host` becomes the canonical Host development command.

```bash
bun run dev:host
```

It should delegate to a focused script, for example `scripts/dev-host.sh`, which
starts two processes:

```text
Host API: http://127.0.0.1:9117
Host Web: http://127.0.0.1:5050/host
Host DB:  ~/.aiworker-dev/host.db
Dev admin: admin@zonease.org
```

The current root `dev:host` behavior must no longer start the Worker daemon. If a
Worker daemon foreground command still needs a root shortcut, it should use a
different name that does not claim Host ownership.

The dev script should:

- fail if port `9117` is already occupied;
- fail if port `5050` is already occupied;
- stop the remaining child process when either child exits;
- print the Web URL, API URL, DB path, and dev admin email;
- keep the default host as `127.0.0.1`.

Environment overrides are allowed, but the defaults must be stable:

```text
AIWORKER_HOST_API_PORT=9117
AIWORKER_HOST_WEB_PORT=5050
AIWORKER_HOST_DEV_ADMIN_EMAIL=admin@zonease.org
AIWORKER_HOST_DB=$HOME/.aiworker-dev/host.db
```

## Host API Contract

The existing Host server remains the API owner.

### `GET /api/host/assignments`

Returns real assignments from Host storage.

Constraints:

- requires Host admin auth in dev through the static dev admin user;
- never returns plaintext provision tokens;
- never returns provision token hashes;
- returns assignment view data only.

### `POST /api/host/assignments`

Creates an assignment.

Request body:

```json
{
  "assignedEmail": "bob@zonease.org",
  "serverRef": "aissh://server/ap-sg-01",
  "soulReleaseRef": "aiworker-freeform@dev"
}
```

Response body includes:

- assignment view;
- plaintext `provisionToken`;
- one-time `provisionCommand`.

Example provision command:

```bash
bun apps/worker-cli/src/aiworker.ts provision --host http://127.0.0.1:9117 --token awp_...
```

The token is returned only in the creation response. It is not persisted in a
listable plaintext form.

### `POST /api/provision/check-in`

Called by the real Worker provision flow. On success:

- consumes the provision token;
- moves the assignment to `checked_in`;
- records `workerId` and `workerVersion`;
- returns the existing assignment/access receipt response.

It does not mark the assignment `access_ready` or `ready`.

## Host CLI Contract

Host CLI participates in the same loop through HTTP API calls, not direct DB
writes.

```bash
bun apps/host-cli/src/aiworker-host.ts assignment create \
  --email bob@zonease.org \
  --server aissh://server/ap-sg-01 \
  --soul aiworker-freeform@dev \
  --host http://127.0.0.1:9117
```

Expected behavior:

- calls `POST /api/host/assignments`;
- prints JSON containing the assignment view and provision command;
- does not log or persist secret values beyond the creation response.

```bash
bun apps/host-cli/src/aiworker-host.ts assignment list \
  --host http://127.0.0.1:9117
```

Expected behavior:

- calls `GET /api/host/assignments`;
- prints assignment views;
- does not print provision tokens or token hashes.

## Host Web Contract

Host Web becomes a real API-backed development surface.

The page should load from:

```text
http://127.0.0.1:5050/host
```

Host Web should know the API base URL from a development environment variable,
for example:

```text
AIWORKER_HOST_API_URL=http://127.0.0.1:9117
```

Vite proxy is acceptable if it keeps the browser-facing API calls simple, but the
contract must remain explicit in tests.

### Screen Structure

Header:

- title: `AI Workers`;
- Host API connection state: connecting, connected, or failed;
- primary action: create assignment.

Create assignment form:

- employee email;
- aissh server ref;
- Soul release ref;
- submit button.

On successful creation:

- refresh the assignment list;
- show the one-time provision command;
- state clearly that the token is shown only once.

Assignment list:

- empty state: no assignments yet;
- employee email;
- aissh server ref;
- Soul release ref;
- Worker id or waiting for Worker check-in;
- status label.

Status copy:

```text
provisioning -> 等待 Worker check-in
checked_in   -> Worker 已报到
access_ready -> 访问通道已就绪
ready        -> 可打开 Worker
revoked      -> 已撤销
archived     -> 已归档
other        -> 开通中
```

Before `ready`, Host Web must not show an enabled "open Worker" action. The UI may
show `access_ready` and `ready` as later pipeline stages, but this implementation
only proves the real loop through `checked_in`.

### UI System Constraint

Host Web must use the existing project UI system:

- shadcn-managed primitives already exposed through `packages/ui`;
- existing button, badge, card, form/input, and layout styling conventions;
- no new component system;
- no unrelated visual redesign;
- no ad-hoc CSS framework or custom theme.

The UI should look like the rest of AIWorker, not like a new product shell.

## Data Flow

```text
Developer
  -> bun run dev:host
  -> Host API (:9117) + Host Web (:5050)

Admin in Host Web or Host CLI
  -> POST /api/host/assignments
  -> Host sqlite assignment row in provisioning
  -> one-time provision command

Developer / deployment flow
  -> real Worker CLI provision command
  -> POST /api/provision/check-in
  -> Host storage consumes token and marks checked_in

Admin in Host Web
  -> refresh
  -> GET /api/host/assignments
  -> sees Worker 已报到
```

## Error Handling

Development startup:

- occupied API port fails with an API-port-specific message;
- occupied Web port fails with a Web-port-specific message;
- child process exit tears down the other child;
- startup output must make the URLs obvious.

Host API:

- missing admin auth returns 403;
- invalid email/server/soul request returns 400;
- invalid, expired, revoked, or consumed provision token returns 401;
- list responses never include token secrets.

Host Web:

- API unreachable shows connection failure and retry;
- create failure shows the API error code;
- successful creation shows the one-time provision command;
- browser refresh does not recover the plaintext token.

## Testing

Contract tests:

- root `dev:host` points at the Host development script;
- default ports are `9117` and `5050`;
- the script no longer starts the Worker daemon under the Host name.

Host API and CLI tests:

- `assignment create` calls Host API and prints a provision command;
- `assignment list` calls Host API and does not leak tokens;
- create/list keep using the same assignment view shape as Web.

Host Web tests:

- first render loads assignments from API;
- empty state is rendered when API returns no assignments;
- create form posts to API and refreshes the list;
- successful create shows one-time provision command;
- API failure renders an actionable error state;
- `checked_in` renders `Worker 已报到`;
- pre-ready assignments do not show an enabled open Worker action.

Browser proof:

- start Host API and Host Web;
- create assignment through Host Web;
- perform a real check-in through the Worker provision path or the existing
  check-in client contract;
- refresh Host Web;
- assert the assignment shows `Worker 已报到`;
- do not assert `ready` or Worker opening in this loop.

## Acceptance Criteria

- Running `bun run dev:host` prints:
  - `http://127.0.0.1:5050/host`;
  - `http://127.0.0.1:9117`;
  - Host DB path;
  - dev admin email.
- Host Web no longer depends on static default assignments for the normal dev
  path.
- Creating an assignment in Host Web creates a real Host storage record.
- Creating an assignment in Host CLI creates the same kind of record through Host
  API.
- CLI list and Web list show the same assignment data.
- The returned provision command can be used by the real Worker provision flow.
- After check-in, Host Web can show `Worker 已报到`.
- No tokens or token hashes appear in assignment list responses or UI list rows.
- No seed data or simulated check-in is introduced.
- The UI uses the existing `packages/ui`/shadcn-based system.
