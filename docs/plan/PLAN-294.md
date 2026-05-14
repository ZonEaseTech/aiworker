# PLAN-294 Host app-only catalog and official Soul App bootstrap

- **status**: completed
- **createdAt**: 2026-05-13 12:24
- **approvedAt**: 2026-05-13 12:24
- **relatedTask**: FEAT-069

## Context

FEAT-060..068 established the Soul App protocol, Host registry, app-level HR/QA
workspaces, standalone runtime, Host-mounted service boundary, renderer-aware
surfaces and release-grade validation gates. The remaining architecture
violation is that Host runtime catalog still merges built-in business Souls from
`packages/shared/src/vertical-soul.ts` with installed Soul Apps.

That creates two sources of truth:

- legacy Host-owned IDs such as `hr` and `qa`;
- app-projected IDs such as `aiworker-hr` and `aiworker-qa`.

The user approved option A: remove all Host built-in business Souls from
runtime catalog now, keep only currently available official HR/QA apps in the
shortcut bootstrap path, and accept that PM/DevOps/finance/legal/ops disappear
until they are implemented as official Soul Apps.

## Proposal

### 1. App-only Host catalog

Change core catalog projection so `listHostSoulCatalog()`,
`findHostSoul()`, `findHostCapabilityTemplate()` and
`listHostCapabilityTemplatesForSoul()` only use installed Soul App registry
state. Disabled apps may remain visible as `coming_soon` app projections, but
only enabled apps contribute capability templates.

Remove runtime imports of `BUILTIN_VERTICAL_SOULS`,
`BUILTIN_CAPABILITY_TEMPLATES`, `findVerticalSoul` and
`findCapabilityTemplate` from Host catalog paths.

### 2. Official app bootstrap

Add a first-party official bootstrap helper with a hardcoded allowlist for:

- `apps/aiworker-hr/soul-app.manifest.json`;
- `apps/aiworker-qa/soul-app.manifest.json`.

The helper must use existing install/enable lifecycle functions:

- missing official apps are installed and enabled;
- installed or error apps are revalidated and enabled when valid;
- enabled apps are refreshed;
- disabled apps remain disabled and are not silently re-enabled.

### 3. API and CLI wiring

Run official bootstrap during local daemon startup so fresh Host startup has
HR/QA available by lifecycle state, not by Host built-ins. Add
`aiworker app bootstrap official` for explicit repair and diagnostics.

Update CLI and API tests so legacy `hr` creation fails while `aiworker-hr`
succeeds after bootstrap.

### 4. Web and documentation alignment

Update Web mocks and UI assumptions to consume app-projected Souls. Record the
temporary product coverage regression: PM/DevOps/finance/legal/ops are absent
until added as official Soul Apps.

## Scope

In scope:

- core registry semantics and tests;
- official HR/QA bootstrap helper and tests;
- API startup bootstrap and tests;
- CLI explicit bootstrap command and tests;
- Web test/data assumption updates;
- PMA/changelog updates.

Out of scope:

- creating PM, DevOps, finance, legal or ops Soul Apps;
- marketplace or remote app install;
- migration of existing persisted workers with legacy `hr`/`qa` Soul IDs;
- compatibility aliases for legacy built-in Soul IDs.

## Risks

- **Existing local metadata may reference legacy IDs.** This slice intentionally
  does not migrate persisted workers. They may appear unavailable until a
  dedicated migration is designed.
- **Hidden startup mutation.** Mitigation: only bootstrap an explicit official
  allowlist and preserve disabled lifecycle intent.
- **Connector warnings during enable.** Existing static health semantics remain:
  missing enabled connectors can warn without restoring built-in definitions.
- **Coverage regression.** PM/DevOps/finance/legal/ops disappear until each is
  implemented as an app. This is the approved option A tradeoff.

## Verification

- `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun apps/cli/src/aiworker.ts app bootstrap official`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-13 12:24: Created and claimed after design approval. No
  implementation code has been changed for this plan yet.
- 2026-05-13 12:43: Completed. Added app-only Host catalog projection,
  official HR/QA bootstrap, API startup wiring, CLI repair command, app-id HR
  workbench binding, and app-projected Web test/data coverage.

## Verification Results

- `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-shared' test src/vertical-soul.test.ts src/soul-workbench.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' test`
- `AIWORKER_HOME="$(mktemp -d)" WORKER_DB_PATH="$AIWORKER_HOME/aiworker.db" bun apps/cli/src/aiworker.ts app bootstrap official`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

All commands exited 0. `bun run build` still reports the existing Web
chunk-size warning, but the build succeeds. code-review-graph reports risk 0.60
with heuristic test-gap hints around mounted service and surface helpers; this
slice added direct coverage for app-only catalog behavior, official bootstrap,
disabled preservation, and API/CLI/Web app-projected IDs.
