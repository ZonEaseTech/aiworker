# PLAN-061 reloadRuntime in-process serialization

- **status**: completed
- **createdAt**: 2026-05-02
- **approvedAt**: 2026-05-02
- **completedAt**: 2026-05-02 02:01
- **relatedTask**: BUG-006

## Current State

At investigation time, BUG-006 was still reproducible by inspection:

1. `apps/api/src/modes/worker.ts` exposes one `reloadRuntime` closure shared by HTTP `PUT /api/worker/config`, HTTP `POST /api/worker/reload`, and gateway node `config.put`.
2. `reloadRuntime` currently performs `hydrateStoredConfig` -> `processes.setLimits` -> `buildWorkerRuntime` -> swap `state.runtime` / `state.configVersion` -> `onRuntimeReloaded` -> `previous.dispose()` without an explicit mutex or promise chain.
3. `packages/core/src/worker/management/config.ts::applyConfigUpdate` serializes validation/persist/mirror/reload within one caller, but it does not serialize independent callers. Placing the guard there would miss direct `POST /reload` and would duplicate responsibility outside the owner of `state.runtime`.
4. The architecture document already states that reload must be serialized, but it does not name the enforcement point. The task acceptance criteria requires moving this from implicit operator non-concurrency to an internal `reloadRuntime` guarantee.

## Outcome

`reloadRuntime` now owns a closure-local promise chain in `bootstrapWorkerApp`. Each reload waits for the previous reload's hydrate/build/swap, `onRuntimeReloaded`, and old runtime `dispose()` sequence to finish before starting. Failed reloads still reject for the current caller, but the chain recovers so later retries can run.

## Proposal

1. Keep the fix inside `bootstrapWorkerApp`:
   - split the current reload body into a small `doReloadRuntime` helper;
   - maintain a closure-local `lastReload` promise initialized to `Promise.resolve()`;
   - make public `reloadRuntime` chain `lastReload = lastReload.catch(() => undefined).then(() => doReloadRuntime(...))`, then return the chained promise.
2. Preserve the current swap ordering inside each serialized reload:
   - hydrate next config;
   - update shared `ProcessManager` limits;
   - build next runtime;
   - swap `state.runtime` and `state.configVersion`;
   - call `onRuntimeReloaded`;
   - dispose the previous runtime.
3. Add a focused regression test under `apps/api/src/modes/` that boots a real `bootstrapWorkerApp`, monkey-patches the current runtime `dispose`, issues two concurrent `reloadRuntime` calls, and asserts:
   - call 2 does not build/swap ahead of call 1;
   - version 2 dispose occurs before version 3 swap;
   - final `state.configVersion` is the later version.
4. Update `docs/architecture.md`, `docs/task/BUG-006.md`, `docs/task/index.md`, `docs/plan/index.md`, and `docs/changelog.md` after implementation.

## Risks

1. **Reload failure poisoning the chain**: a failed reload must not permanently block future reload attempts. The chain should recover before scheduling the next reload while still returning the current failure to the caller.
2. **Dispose ordering regression**: BUG-004 relies on `onRuntimeReloaded` running after swap and before `previous.dispose()`. The mutex must wrap that sequence without changing it.
3. **Test side effects**: `bootstrapWorkerApp` touches worker DB, vault, env-derived paths, and starts cron services. The regression test must isolate `AIWORKER_HOME` / `WORKER_DB_PATH` and dispose runtimes it creates.
4. **Existing dirty worktree**: current unrelated edits already touch docs and `apps/api/src/modes/worker.ts`; implementation must layer on top without reverting them.

## Scope

In scope:

- `apps/api/src/modes/worker.ts` reload promise chain. Completed.
- One focused API-mode regression test. Completed in `apps/api/src/modes/worker.reload.test.ts`.
- BUG-006 / PLAN-061 status sync. Completed.
- Architecture and changelog wording for the enforced invariant. Completed.

Out of scope:

- Refactoring runtime lifecycle abstractions.
- Moving reload ownership into `packages/core`.
- Changing config schema, optimistic locking, gateway protocol, or worker DB schema.
- Fixing the separate cron double-tick race documented in `docs/architecture.md`.

## Verification Plan

1. `bun test apps/api/src/modes/worker.reload.test.ts`
2. `bun test apps/api/src/worker/management/routes.test.ts`
3. `bun run --filter '@zonease/aiworker-api' typecheck`
4. `git diff --check`

## Alternatives

1. Add the mutex to `applyConfigUpdate`. Simpler for config writes, but it does not cover `POST /reload` and puts `state.runtime` lifecycle policy outside the owner closure.
2. Add a generic lock helper package. Rejected for BUG-006: the task explicitly calls for no new locking framework, and one closure-local promise chain is enough.
3. Rely on optimistic locking only. Rejected: the documented race still exists when two callers legitimately update versions within the hydrate/build window.

## Notes

- 2026-05-02: Investigation completed; waiting for explicit approval before implementation.
- 2026-05-02: Approved; implementation started.
- 2026-05-02 02:01: Implemented the closure-local reload promise chain, added the focused race regression test, updated architecture and changelog, and completed focused verification.
