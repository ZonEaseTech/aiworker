# PLAN-222 Host home lifecycle and project-scope removal

- **status**: completed
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

Completed on 2026-05-10 18:38 CST.

- Host home is the only default runtime source of truth.
- Project-scope auto-detection and project initializer exports were removed
  from active fs-layout code.
- Explicit `AIWORKER_HOME` remains available for test/deploy isolation.
- CLI command names now use workspace/session/turn terminology.
- Worker Web is served by the local daemon at `/` after Web build.

Verification passed:

- `bun run --filter '@zonease/aiworker-fs-layout' typecheck`
- `bun run --filter '@zonease/aiworker-fs-layout' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
