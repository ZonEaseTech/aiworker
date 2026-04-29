# FEAT-040 Gateway /w worker API bridge MVP

- **status**: completed
- **priority**: P1
- **owner**: fla4c6zx
- **createdAt**: 2026-04-29 18:13

## Description

Implement the first narrow gateway HTTP bridge for workerId-derived fleet
management paths. The bridge must derive the target worker only from
`/w/:workerId`, validate the id, avoid request-provided target URLs or
worker credentials, and route only the MVP allowlist through gateway WS/RPC:

- `GET /w/:workerId/api/worker/info` -> `workers.info`
- `GET /w/:workerId/api/worker/config` -> `config.get`
- `PUT /w/:workerId/api/worker/config` -> `config.put` with `If-Match`

Unknown `/w/:workerId/api/worker/*` paths must remain unsupported, and
reserved gateway paths such as `/admin`, `/ws`, `/enroll-ws`, and `/health`
must keep their existing behavior.

## ActiveForm

Implementing the gateway `/w/:workerId` worker API bridge MVP.

## Dependencies

- **blocked by**: (none)
- **blocks**: FEAT-040 gateway-native fleet management UI follow-up

## Notes

- 2026-04-29 18:13: Claimed for subtask `fla4c6zx`.
- Current gateway already has operator-to-node forwarding for `config.get`
  and `config.put`; `workers.info` exists in proto but is still a node-side
  stub, so this subtask verifies the bridge with fake node responses and
  leaves full worker info implementation to its owning task.
- 2026-04-29 18:24: Completed gateway `/w/:workerId` bridge MVP. Added
  allowlisted HTTP-to-WS/RPC routing, worker id validation, bridge-local
  `If-Match` handling, public-bind external-auth guard for `/w/*`, and focused
  route tests.
- 2026-04-29 19:28: S3R review fix added `gateway.method.invoked` audit rows
  for the allowlisted HTTP bridge success/error paths without storing browser
  auth headers, cookies, worker bearer tokens, or raw config bodies.
