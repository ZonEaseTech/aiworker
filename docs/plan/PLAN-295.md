# PLAN-295 Legacy Soul metadata migration and mounted surface hardening

- **status**: completed
- **createdAt**: 2026-05-13 13:03
- **approvedAt**: 2026-05-13 13:03
- **relatedTask**: FEAT-070

## Context

FEAT-069 removed Host-owned business Souls from the runtime catalog. New worker
creation now rejects legacy `hr` and accepts app-projected ids such as
`aiworker-hr`, while official HR/QA enter the registry through install/enable
bootstrap.

Three follow-up gaps remain:

1. Older local `worker.db` rows may still contain `workers.soul_id = 'hr'` or
   `sessions.capability_template_id = 'candidate-screen'`.
2. Import boundary checks exist in `app validate` and current ESLint config for
   HR/QA, but the lint contract is not yet generic for future `apps/*` Soul
   Apps.
3. Mounted surface coverage is mostly API/unit level. Worker Web has React
   tests for descriptor/frame rendering, but there is no committed real browser
   smoke that proves the Host-served UI resolves mounted surfaces from a live
   local daemon.

The user explicitly deferred the separate task of adding PM, DevOps, finance,
legal or ops as official Soul Apps.

## Proposal

### 1. Legacy metadata repair

Add a small app-only repair helper that maps legacy built-in ids to official app
ids:

- `hr` -> `aiworker-hr`
- `qa` -> `aiworker-qa`

The repair updates:

- worker `soulId`;
- session `capabilityTemplateId`;
- session metadata fields such as `capabilityTemplateId`, `soulAppId` and
  `soulName` when present or inferable.

It must preserve worker ids, workspace ids and filesystem paths. The repair runs
after official app bootstrap so the target apps exist in the registry, and it
returns counts for diagnostic output.

### 2. Generic app import boundary lint

Keep the existing `app validate` scanner, but add a repo lint script that scans
manifest-backed Soul App directories under `apps/*`:

- app code must not import Host private packages or Host app internals;
- app code must not import sibling Soul App internals;
- Host/source code must not import `apps/*/src` internals.

Wire the script into the root `lint` command after ESLint. Keep ESLint rules as
the fast editor-level guard for current HR/QA paths.

### 3. Mounted surface browser smoke

Add a focused Web smoke script that starts a temporary local daemon with
official HR/QA bootstrapped, opens Worker Web in a real browser, verifies:

- the Soul Apps rail shows HR mounted route/panel/widget contributions;
- descriptor content from `/surfaces/...` renders in the UI;
- sandboxed frame content loads and is visible;
- no legacy `hr` built-in worker is required for the mounted surface UI.

Use a temporary `AIWORKER_HOME` and clean up the daemon/browser process.

## Scope

In scope:

- storage/core/API/CLI migration helper and tests;
- generic lint script and root lint wiring;
- browser smoke script for mounted surfaces;
- PMA/changelog updates.

Out of scope:

- adding PM, DevOps, finance, legal or ops official Soul Apps;
- renaming existing worker ids or workspace paths;
- deleting historical built-in fixture tests from `packages/shared`;
- changing external marketplace/install semantics.

## Risks

- **Old data with custom template ids.** Only known built-in HR/QA template ids
  can be migrated safely. Unknown ids should be reported as skipped, not guessed.
- **Startup mutation.** The repair must run only for explicit legacy ids and
  preserve object identity.
- **Browser dependency drift.** The smoke should fail with an actionable message
  when Playwright/Chromium is unavailable, while normal unit gates still prove
  behavior.

## Verification

- `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/official.test.ts src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run web:smoke:mounted-surfaces`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-13 13:03: Created and claimed. Investigation found existing API/CLI
  creation rejects legacy ids, but storage/runtime rows can still hold old ids;
  ESLint is HR/QA-specific; mounted surface coverage needs a browser smoke.
- 2026-05-13 14:02: Completed. Storage repair maps known legacy HR/QA worker and
  session metadata to app-projected ids, API and CLI run the repair after
  official bootstrap, root lint now runs generic Soul App boundary checks, and
  browser smoke verifies mounted descriptor/frame surfaces against a live local
  daemon.

## Verification Results

- `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run web:smoke:mounted-surfaces`

All commands above exited 0. The first browser smoke run exposed a real
concurrency issue: multiple mounted surfaces could race and start the same app
service more than once. The implementation now deduplicates pending mounted
service startup per app and the API test covers that behavior.
