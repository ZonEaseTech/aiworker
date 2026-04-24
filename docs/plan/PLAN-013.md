# PLAN-013 aim CLI + WS gateway (full replacement of dashboard REST)

- **status**: draft
- **createdAt**: 2026-04-24 15:45
- **relatedTask**: REFACTOR-003
- **blockedBy**: PLAN-012

## Summary

Replace the dashboard's HTTP REST surface (`apps/api/src/dashboard/**`) with a typed WebSocket gateway, modelled on OpenClaw's `operator/node` protocol. Introduce `aim` CLI as the operator-side entry, alongside the existing `aiw`. Web UI refetters to WS. Pre-production: break all REST endpoints, no compat shim.

## Sketch

- New app `apps/gateway/` — the WS server. Runs as `aim gateway start` (or `aiworker-gateway` binary once compiled). Binds `127.0.0.1:3000` by default, accepts remote connections with token pairing.
- New `aim` binary in `apps/cli/`:
  - `aim pair <worker-url>` — one-shot WS handshake; prints + stores token pair.
  - `aim workers list / info / start / stop`
  - `aim chat <worker-id> "message"` — ingest via WS `chat.send`.
  - `aim config get|set <worker-id>`
  - `aim logs <worker-id> --follow`
  - `aim gateway start|status|stop`
- Workers connect to the gateway as `role: node` (replaces "register worker" paste-token flow). Gateway maintains a registry in `fleet.db` (workerId + baseUrl + pairing token + last_seen).
- Typed protocol in `packages/gateway-proto` — JSON Schema emitted for both TS and runtime validation.
- **Delete** `apps/api/src/dashboard/**`, `apps/api/src/modes/dashboard.ts`, `apps/api/src/config/dashboard.ts` (merged into gateway config), all `/api/workers/*` REST routes.
- Web UI (`apps/web`): replace `src/lib/api.ts` fetch layer with a typed WS client. Existing pages stay; swap data source.

## Out of scope (handled elsewhere)

- Channel envelope normalisation → PLAN-014.
- Per-tool approvals → PLAN-014.
- `packages/core` extraction → PLAN-015.

## Key risks (draft)

- R1 — WS reconnect / backoff ergonomics; ensure operators never silently lose updates.
- R2 — Browser WS auth (cookie vs Authorization header via query param); pick one.
- R3 — The `MANAGER_CAN_LAUNCH` docker supervisor flow (FEAT-023) currently runs in `dashboard/supervisor/`. PLAN-013 must port it to a `aim gateway launch <worker-id>` method.
