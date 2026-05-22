# PLAN-399 Worker-scoped native engine bridge spike

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21 13:02
- **approvedAt**: 2026-05-21 13:02
- **completedAt**: 2026-05-21 13:02
- **relatedTask**: REFACTOR-091

## Current State

The existing engine execution path is green but thick:

- `packages/core/src/worker/executor.ts` requires workspace/session/turn ids.
- It appends an AIWorker session contract to the prompt and writes `prompt.md`
  under a session invocation directory.
- `packages/core/src/worker/runtime.ts` materializes session context before a
  turn and captures worker-owned output semantics back into Host rows.
- `packages/storage-sqlite/src/worker/schema.ts` requires engine invocations to
  reference session and turn rows.

This spike should not migrate storage or API yet. It should prove the core
native bridge primitive can exist without below-worker Host concepts.

## Proposal

1. Add a focused `packages/core/src/worker/engine-bridge.ts` module with a
   small worker-scoped input/output contract.
2. Implement the minimum native process runner needed for the spike:
   - validate cwd exists;
   - spawn the provided command and args in that cwd;
   - pass raw input through stdin;
   - emit status/stdout/stderr/exit events;
   - return exit code, stdout, stderr, duration and invocation id.
3. Add focused tests in `packages/core/src/worker/engine-bridge.test.ts` using
   temporary shell scripts so the behavior is deterministic.
4. Export the primitive from `packages/core/src/index.ts` only after tests prove
   the shape.
5. Run a temporary native Codex or Claude Code smoke outside the repository
   source tree to validate the authenticated local runtime path.

## Scope

- `packages/core/src/worker/engine-bridge.ts`
- `packages/core/src/worker/engine-bridge.test.ts`
- `packages/core/src/index.ts`
- `docs/task/REFACTOR-091.md`
- `docs/plan/PLAN-399.md`
- `docs/changelog.md`

## Non-Goals

- Do not replace `LocalExecutor` yet.
- Do not migrate storage schema or API routes in this spike.
- Do not add context file materialization, prompt synthesis, output discovery or
  worker-owned product interpretation.
- Do not change Web or CLI product surfaces.

## Verification Plan

- Run the new test first and confirm it fails before implementation.
- Run focused new bridge tests after implementation.
- Run existing core worker executor/runtime tests to ensure the old path remains
  green.
- Run one authenticated native engine smoke in a temporary cwd.
- Run `git diff --check` and code-review-graph for production code changes.

## Result

Added `invokeNativeEngine` as a worker-scoped native process bridge in core. The
new primitive accepts worker id, cwd, native command, native args and raw stdin;
it emits status/stdout/stderr/exit events and returns invocation id, resolved
cwd, exit code, stdout, stderr, duration and timestamps. It does not depend on
workspace, session, turn, context files or output descriptors.

The bridge is exported from `@zonease/aiworker-core` but is not wired into the
existing `LocalWorkerRuntime`, storage schema or API routes in this spike. That
keeps the old green path intact while giving the next slice a tested native
runtime primitive to migrate toward.

## Verification

- TDD red run:
  `bun run --filter '@zonease/aiworker-core' test src/worker/engine-bridge.test.ts`
  failed first because `./engine-bridge` did not exist.
- Focused bridge tests:
  `bun run --filter '@zonease/aiworker-core' test src/worker/engine-bridge.test.ts`
  passed with 3 tests and 21 assertions.
- Focused core regression:
  `bun run --filter '@zonease/aiworker-core' test src/worker/engine-bridge.test.ts src/worker/executor.test.ts src/worker/runtime.test.ts`
  passed with 27 tests and 163 assertions.
- Typecheck:
  `bun run --filter '@zonease/aiworker-core' typecheck` passed.
- Native Codex smoke:
  `invokeNativeEngine({ command: "codex", args: ["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only"], ... })`
  succeeded in a temporary cwd and stdout contained
  `AIWORKER_NATIVE_BRIDGE_SMOKE`.
- Whitespace:
  `git diff --check` passed.
- Docs contract:
  `bun run docs:check` passed.
- Code review graph:
  `bun run crg:update` updated 4 files, then `bun run crg:review` reported 0
  changed functions/classes, 0 affected flows, 0 test gaps and risk score 0.00.
