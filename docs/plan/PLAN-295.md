# PLAN-295 Legacy Soul metadata discard and mounted surface hardening

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
   `sessions.capability_template_id = 'candidate-screen'`; these rows should
   be discarded, not preserved through app-projected ids.
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

### 1. Legacy metadata discard

Add a small app-only discard helper that deletes legacy built-in workers:

- `hr`
- `qa`

The discard removes the worker rows and relies on existing SQLite cascade
constraints to remove dependent local metadata:

- workspaces;
- sessions;
- turns/events/invocations;
- indexed files/artifacts/reviews/lessons.

The discard runs after official app bootstrap so official HR/QA are available
for fresh worker creation, and it returns counts for diagnostic output.

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

- storage/core/API/CLI discard helper and tests;
- generic lint script and root lint wiring;
- browser smoke script for mounted surfaces;
- PMA/changelog updates.

Out of scope:

- adding PM, DevOps, finance, legal or ops official Soul Apps;
- renaming existing worker ids or workspace paths;
- deleting historical built-in fixture tests from `packages/shared`;
- changing external marketplace/install semantics.

## Risks

- **Old data loss.** This is intentional before 1.0.0; the discard must only
  match explicit legacy built-in Soul ids.
- **Startup mutation.** The discard must run after official bootstrap and before
  runtime creation so deleted legacy workers are not initialized.
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
- 2026-05-13 14:02: Completed. Storage handling covered legacy HR/QA metadata,
  API and CLI run it after official bootstrap, root lint now runs generic Soul
  App boundary checks, and browser smoke verifies mounted descriptor/frame
  surfaces against a live local daemon.
- 2026-05-13 14:07: Corrected per user direction. Legacy HR/QA workers are now
  discarded with cascaded local metadata instead of repaired or migrated.

## Verification Results

- `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
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

All commands above exited 0. The first browser smoke run exposed a real
concurrency issue: multiple mounted surfaces could race and start the same app
service more than once. The implementation now deduplicates pending mounted
service startup per app and the API test covers that behavior. The 14:07
correction switched legacy HR/QA handling from repair to discard; focused tests,
root gates, browser smoke, diff check and code-review-graph all passed after
that correction. `crg:review` exited 0 and still reported static test-gap
warnings for touched bootstrap/helper functions, while the focused API/CLI/core
tests above cover the corrected runtime behavior. Web build still emits the
existing chunk-size warning but exits 0.
