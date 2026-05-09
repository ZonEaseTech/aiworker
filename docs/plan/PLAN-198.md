# PLAN-198 Local worker daemon lifecycle commands

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 18:13
- **approvedAt**: 2026-05-09 18:13
- **completedAt**: 2026-05-09 18:23
- **relatedTask**: REFACTOR-032

## Current State

AIWorker already has the runtime pieces needed for a local daemon:

- `aiworker serve` runs the worker HTTP/Admin server in the foreground.
- `aiworker up` resolves scope, runs init, validates worker config, checks executor readiness,
  and then calls `serve`.
- `aiworker run` now submits to the local daemon by default.
- gateway has detached PID/log management, but worker does not.

The missing product surface is the OD-style operator lifecycle:

```text
start daemon -> check daemon -> open/use web -> run work orders -> inspect/logs -> stop daemon
```

## Proposal

1. Add worker daemon command module
   - Resolve active scope with `resolveAiworkerScope()`.
   - Store lifecycle files under active `scope.home`:
     - `aiworker-worker.pid`
     - `aiworker-worker.log`
     - `aiworker-worker-daemon.json`
   - Spawn the current CLI script in detached mode and run `aiworker up --no-open`.
   - Pass through `--port`, `--host`, `--soul`, `--pack`, `--gateway`, `--gateway-token`,
     `--no-reconnect`, and `--no-serve-web`.

2. Add commands
   - Root shortcuts:
     - `aiworker daemon start`
     - `aiworker daemon status`
     - `aiworker daemon stop`
     - `aiworker daemon logs`
     - `aiworker daemon check`
     - `aiworker daemon inspect`
   - Canonical equivalents under `aiworker worker daemon ...`.

3. Add `up --pack`
   - `daemon start` delegates first-run creation to `up`, so `up` must pass pack selection
     through to `init`.

4. Add tests
   - CLI registration/help/preprocess coverage.
   - Worker daemon unit tests for metadata path, stale pid cleanup, duplicate start rejection,
     log tail, and check behavior.
   - Keep real detached integration optional unless focused unit coverage is insufficient.

## Risks

- **False success on detached start**: a detached child can fail after parent exits. Mitigate with
  `daemon check` and clear log path output; do not claim readiness in `start`.
- **State path ambiguity**: project scope must use `.aiworker/local`, while explicit/user scope uses
  the resolved home. Use fs-layout as the source of truth.
- **Process cleanup**: tests must not leave detached workers behind.
- **Scope creep**: this slice does not build systemd install or restart supervision.

## Verification

- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/daemon.test.ts src/commands/worker/up.test.ts src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `git diff --check`
- code-review-graph change review

## Progress

- 2026-05-09 18:13：完成现状调查；确认复用 `up` / `serve`，新增 detached worker
  daemon lifecycle，不引入新 runtime。
- 2026-05-09 18:23：完成 root/canonical daemon lifecycle commands、`up --pack`
  透传、metadata/pid/log/health check、help/bootstrap 更新，以及真实 detached daemon
  start/check/logs/inspect/stop 测试；CRG risk 0.40、0 affected flows。
