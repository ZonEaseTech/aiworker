# PLAN-042 Gateway /w worker API bridge MVP

- **status**: completed
- **createdAt**: 2026-04-29 18:13
- **approvedAt**: 2026-04-29 18:13
- **relatedTask**: FEAT-040

## Context

- `packages/gateway/src/server.ts` currently serves `/health`, `/admin/*`,
  `/ws`, and `/enroll-ws`; all other HTTP paths return 404.
- Operator-to-node RPC forwarding already exists in
  `packages/gateway/src/router/forward.ts` and `ForwardTable`.
- `config.get` and `config.put` are proto `operator-to-node` methods and the
  worker gateway dispatcher has handlers for them.
- `workers.info` is a proto `operator-to-node` method, but the current node
  dispatcher still returns `method_not_implemented`. The bridge should still
  route to that method so the HTTP surface is ready when the node handler
  lands.
- `WORKER_ID_PATTERN` is exported by `@zonease/aiworker-shared` and should be
  reused for `/w/:workerId` validation.

## Proposal

1. Add a small gateway bridge module that parses only `/w/:workerId` paths,
   validates `workerId`, and allowlists the three MVP method/path pairs.
2. Route bridge requests through existing gateway proto forwarding to the
   online node. Do not forward browser `Authorization`, `Cookie`,
   `Connection`, or `Upgrade` headers; only send proto params.
3. Translate proto success responses into JSON response bodies and common
   proto errors into worker-REST-like JSON errors/statuses where practical.
4. Wire the bridge into `server.ts` before the final 404 while leaving
   `/health`, `/admin`, `/ws`, and `/enroll-ws` behavior unchanged.
5. Add focused gateway tests for worker id validation, allowlist behavior,
   header isolation, and GET/PUT forwarding with fake node responses.

## Risks

- `workers.info` cannot return real worker info until the node-side
  `workers.info` handler is implemented; bridge tests must fake the node
  response to isolate this subtask.
- HTTP bridge waits on WS/RPC responses; timeout and node-offline cases must
  return JSON errors rather than hanging.
- Adding `/w/*` must not accidentally create a generic reverse proxy or accept
  user-controlled base URLs.

## Scope

- Expected files: gateway server/router code, focused gateway tests, and PMA
  tracking docs.
- Explicitly out of scope: frontend route shell, public baseUrl design,
  worker UI implementation, and gateway-proto schema changes unless required.

## Alternatives

- Direct HTTP proxy to stored `baseUrl`: rejected for this MVP because
  FEAT-040 intentionally avoids first-class public baseUrl design and should
  use gateway-native WS/RPC routing.
- Implement worker `workers.info` now: deferred because this subtask owns the
  gateway bridge foundation, not node management handler completion.

## Annotations

- 2026-04-29 18:13: User provided implementation scope and acceptance
  criteria for subtask `fla4c6zx`; treated as approval to implement this
  narrow plan.
- 2026-04-29 18:24: Implementation completed. Self-review caught and fixed
  two issues before reporting: preserving synchronous `/ws` upgrade returns
  while adding async bridge handling, and requiring explicit external-auth
  acknowledgement before serving `/w/*` on non-loopback binds. `/pma-cr`
  local diff review found no remaining P0/P1 issues.
- 2026-04-29 19:28: S3R PMA-CR finding fixed by moving HTTP bridge audit to
  `gateway.method.invoked`, adding operator/path/result/latency/status/error
  metadata for success and error outcomes, and extending focused bridge tests
  to prove sensitive headers and config body values stay out of audit detail.
