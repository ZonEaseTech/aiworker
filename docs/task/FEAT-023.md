# FEAT-023 Manager-driven worker creation

- **status**: completed
- **priority**: P1
- **owner**: ben
- **createdAt**: 2026-04-23 09:10
- **startedAt**: 2026-04-23 09:15
- **completedAt**: 2026-04-23 09:55

## Description

Surface a dedicated "Create worker" entry point in the dashboard that calls the
existing `POST /api/workers/launch-local` path, so operators can provision a
worker container end-to-end from the UI without hand-rolling `docker run` and
scraping bootstrap tokens from logs. Single-host topology only
(dashboard + spawned worker share the same docker engine and
`aiworker_default` network).

Two hard prerequisites bundled in the same unit of work:

1. **Dashboard authN** — `/api/*` currently has no auth middleware. Before
   mounting `docker.sock` we must gate the API layer with a bearer/basic
   middleware that consumes `INTERNAL_SHARED_SECRET` (see CLAUDE.md security
   section).
2. **Worker quota** — Add `MANAGER_MAX_WORKERS` env + runtime check applied to
   both `/register` and `/launch-local` so a compromised or misbehaving caller
   can't exhaust host resources.

Acceptance:

- `/api/*` returns 401 without a valid `Authorization` header.
- Frontend SPA loads under basic-auth and keeps working (no manual token paste
  in UI).
- `Create worker` button is present on the Workers page, enabled only when the
  backend advertises `canLaunch: true` via a new capabilities endpoint.
- Creating a worker shows progress, displays the new worker row with a
  one-time plaintext bearer token for offline backup, and lands the operator
  on the per-worker config page on completion.
- Over-quota requests to `/register` and `/launch-local` return
  `409 { code: 'quota-exceeded' }`.
- Production compose gains an opt-in overlay (or env flags) to enable
  `MANAGER_CAN_LAUNCH` with the socket + network bindings and the 4 resource
  envs required by PLAN-004.
- `docs/deployment.md` has a runbook section: "Enabling manager-driven worker
  creation" covering risk, prerequisites, and smoke test.

## ActiveForm

Wiring Create-worker UI into launch-local with dashboard authN and quota cap

## Dependencies

- **blocked by**: (none)
- **blocks**: (none)

## Notes

See `docs/plan/PLAN-010.md` for the full proposal.
