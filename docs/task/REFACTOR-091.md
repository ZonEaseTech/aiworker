# REFACTOR-091 Add worker-scoped native engine bridge spike

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21 13:02
- **claimedAt**: 2026-05-21 13:02
- **approvedAt**: 2026-05-21 13:02
- **completedAt**: 2026-05-21 13:02
- **plan**: PLAN-399
- **relatesTo**: HOST-001, ENGINE-001, packages/core

## Background

The active product direction is a native engine runtime bridge. Host should only
recognize the worker, locate a native runtime cwd, invoke the selected engine
and observe the process result. Host must not synthesize large context payloads,
inject AIWorker session contracts, require workspace/session rows, or interpret
worker-owned outputs.

The current `LocalExecutor` path is still a thick workspace/session adapter. It
constructs an AIWorker session prompt, materializes context files, discovers
output files and feeds below-worker product semantics back into Host runtime.
This task creates a focused core spike that proves the thinner bridge can exist
alongside the current adapter before any storage or API migration.

## Acceptance Criteria

1. Core exposes a worker-scoped native bridge primitive that accepts worker id,
   cwd, engine command, native args and raw input.
2. The bridge does not require workspace id, session id, turn id, context files
   or output descriptors.
3. The bridge preserves raw stdin and process cwd without injecting an AIWorker
   session contract.
4. The bridge streams native stdout/stderr/status events and reports exit code,
   duration and final output.
5. Focused tests prove the thin behavior, failure behavior and real Codex or
   Claude Code command shape without touching app-owned output semantics.

## Verification

- [x] TDD red run for the new native bridge tests
- [x] Focused core bridge tests
- [x] Existing core executor/runtime tests
- [x] Native Codex smoke in a temporary cwd
- [x] `bun run --filter '@zonease/aiworker-core' typecheck`
- [x] `git diff --check`
- [x] `bun run docs:check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Notes

- 2026-05-21 13:02: Claimed after user approval to continue the feasibility
  spike with Codex or Claude Code authenticated locally.
- 2026-05-21 13:02: Added the core native bridge primitive and proved it can
  run with only worker id, native cwd, raw stdin and native command arguments.
