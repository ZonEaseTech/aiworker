# PLAN-319 Soul App authoring boundary cleanup before SDK npm publication

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 18:12
- **completedAt**: 2026-05-14 18:12
- **relatedTask**: BUG-119

## Current State

AIWorker has a working CLI preview release path, but independent SDK/runtime
npm publication is explicitly out of scope. The current source tree still has
pre-publication coupling that should be cleaned up now:

- `@zonease/aiworker-soul-app-sdk` and
  `@zonease/aiworker-soul-app-runtime` are private workspace packages.
- The SDK client can call Host broker routes, but it only supports bearer
  `authorization`; mounted Soul Apps receive a Host mount token instead.
- `aiworker app create` generates `workspace:*` SDK dependencies without
  explaining that this is a source-checkout preview shape.
- Runtime harness exports expose Host storage/runtime internals more broadly
  than app tests require.

## Proposal

### 1. Mounted Broker Auth

Add Host API and SDK tests first:

- API test starts the local daemon with bearer auth enabled.
- It installs/enables a mounted Soul App service.
- The mounted service calls Host broker storage/search using the SDK client and
  the Host-injected mount token.
- The test must fail before production code changes.

Implementation:

- Add `mountToken` support to `createSoulAppClient`.
- Teach Host API auth middleware to accept `x-aiworker-mount-token` only for
  `/api/local/apps/:appId/broker/*` routes and only when the token matches the
  mounted service for the same app id.
- Pass that token from HR/QA mounted services into SDK broker clients.

### 2. Honest Authoring Docs And Scaffold

- Fix `packages/soul-app-sdk/README.md` so runtime harness helpers live under
  `@zonease/aiworker-soul-app-runtime`.
- Update generated app README to state that `workspace:*` is a source-checkout
  preview dependency while standalone SDK/runtime npm packages are unpublished.
- Keep the generated `package.json` private and do not pretend external npm
  authoring is fully available.

### 3. Runtime Harness Type Narrowing

- Replace the public `worker: WorkerRow` harness field with a minimal
  app-facing worker snapshot type.
- Keep internal storage use inside the runtime harness implementation.
- Keep existing standalone and mounted runtime tests green.

## Scope

In scope:

- `packages/soul-app-sdk`
- `packages/soul-app-runtime`
- `apps/api`
- `apps/aiworker-hr`
- `apps/aiworker-qa`
- `apps/cli`
- `docs/task`, `docs/plan`, `docs/changelog.md`

Out of scope:

- npm publishing or version bumps.
- Full package dist build pipeline for SDK/runtime.
- Host auth provider replacement beyond mounted broker auth.
- Public marketplace or third-party package install flow.

## Verification Plan

- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`
- `bun run check`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-14 18:12: Plan opened after user chose not to publish SDK/runtime and
  asked Codex to complete the boundary cleanup in goal mode.
- 2026-05-14 18:12: Implementation completed. Mounted broker callbacks now use
  Host-issued app-scoped mount tokens, SDK clients can send those tokens,
  scaffold/SDK docs describe the unpublished source-checkout boundary, and the
  runtime harness exposes a minimal app-facing worker snapshot.

## Verification Results

- RED: `bun test packages/soul-app-sdk/src/index.test.ts` failed on missing
  `x-aiworker-mount-token`; `bun test packages/soul-app-runtime/src/index.test.ts`
  failed on exposed `WorkerRow`; `bun test apps/cli/src/aiworker.test.ts`
  failed on missing source-checkout preview copy; `bun test
  apps/api/src/modes/worker.local.test.ts` failed with mounted broker callback
  `401`.
- `bun test packages/soul-app-sdk/src/index.test.ts`: passed, `5 pass`, `0 fail`.
- `bun test packages/soul-app-runtime/src/index.test.ts`: passed, `3 pass`,
  `0 fail`.
- `bun test apps/cli/src/aiworker.test.ts`: passed, `16 pass`, `0 fail`.
- `bun test apps/api/src/modes/worker.local.test.ts`: passed, `25 pass`,
  `0 fail`.
- `bun test apps/aiworker-hr/src/index.test.ts`: passed, `4 pass`, `0 fail`.
- `bun test apps/aiworker-qa/src/index.test.ts`: passed, `4 pass`, `0 fail`.
- Affected package typechecks passed for SDK, runtime, API, CLI, HR and QA.
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`: passed.
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`: passed.
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`: passed.
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`: passed.
- `bun run check`: passed, including full workspace typecheck, lint,
  Soul App boundary script and docs contract check.
- `bun run --filter '@zonease/aiworker-api' build`: passed.
- `bun run --filter '@zonease/aiworker-cli' build:bundle`: passed.
- `bun run crg:update`: passed; reported `18 files updated`.
- `bun run crg:review`: passed; reported overall risk score `0.55` and static
  test-gap warnings for mounted service functions that are covered by the
  focused HR/QA and local daemon tests above.
- `bun run docs:check`: passed.
- `git diff --check`: passed.
