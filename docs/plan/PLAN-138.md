# PLAN-138 Move fleet-hosted Worker Admin auth from Caddy Basic Auth to gateway bearer bridge auth

- **status**: completed
- **createdAt**: 2026-05-06 13:49
- **approvedAt**: 2026-05-06 13:50
- **completedAt**: 2026-05-06 13:58
- **relatedTask**: BUG-081

## Context

`BUG-079` restored the public `/w*` route and initially protected it with the
same Caddy Basic Auth used by Fleet Admin. The user pointed out that Worker
Admin already has a worker token, and Caddy Basic Auth prevents that token from
reaching gateway because both use the HTTP `Authorization` header.

## Proposal

1. Keep `/admin*` and `/ws` behind Caddy Basic Auth.
2. Remove Caddy Basic Auth from `/w*`.
3. Add gateway-side bearer validation to `/w/:workerId/api/worker/*`.
4. Serve `/w/:workerId/` static Worker Admin shell without Caddy auth so the
   UI can prompt for the worker token.
5. Reject bridge API requests with missing, malformed, unknown, or wrong
   bearer token before forwarding anything to the worker.

## Security Notes

- `/w/:workerId/api/worker/*` exposes worker management operations, so it must
  be fail-closed at gateway if no valid worker token is presented.
- Caddy cannot enforce both Basic Auth and Worker Bearer Auth on the same
  browser fetch, because both use `Authorization`.
- Gateway must not log presented worker tokens or node responses containing
  secrets in bridge audit rows.

## Verification

- Gateway bridge auth regression tests.
- Worker Admin API tests proving fleet-hosted requests still attach Bearer.
- Remote public smoke:
  - shell returns `200`;
  - API without bearer returns gateway `401`;
  - API with stored worker token returns `200`.

## Progress

- 2026-05-06 13:50: User clarified Worker Admin should use worker token, not
  Caddy/Fleet Basic Auth.
- 2026-05-06 13:55: Implemented gateway bridge bearer validation and restored
  Worker Admin bearer behavior.
- 2026-05-06 13:56: Deployed fixed gateway bundle to `aiwork`.
- 2026-05-06 13:56: Removed Caddy Basic Auth from `/w*`, validated and
  reloaded Caddy.
- 2026-05-06 13:57: Public and direct smokes passed.
