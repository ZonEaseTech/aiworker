# PLAN-222 Host home lifecycle and project-scope removal

- **status**: implementing
- **owner**: local
- **createdAt**: 2026-05-10 18:01
- **relatedTask**: REFACTOR-050

## Investigation

`apps/cli/src/aiworker.ts` imports `ensureProjectAiworker()` and `aiworker init`
creates `<cwd>/.aiworker`. `packages/fs-layout/src/index.ts` still detects any
marked project `.aiworker/` while resolving `AIWORKER_HOME`. This contradicts
the user-approved rule that the product no longer has "start from any
directory" semantics.

## Proposal

1. Make host home the only default runtime source of truth.
2. Stop project-scope auto-detection.
3. Keep explicit `AIWORKER_HOME` for test/deploy isolation.
4. Update CLI command names from project/run to workspace/session.
5. Add or adjust tests that prove no cwd `.aiworker` materialization happens.

## Scope

In scope: `packages/fs-layout`, `apps/cli`, and focused tests.

Out of scope: historical docs under old plans/tasks and gateway deployment docs
unless they block current verification.

## Verification

- `bun run --filter '@zonease/aiworker-fs-layout' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## Status

Implementing.
