# PLAN-317 Worker Web legacy orphan worker blank-page repair

- **status**: implementing
- **createdAt**: 2026-05-14 16:15
- **approvedAt**: 2026-05-14 16:15
- **owner**: codex
- **relatedTask**: BUG-118

## Context

The 0.13.0 published CLI starts the local daemon correctly:

- `aiworker daemon start` reports a running daemon at `http://127.0.0.1:9217`.
- `/health`, `/`, bundled assets and local API endpoints return 200.
- Playwright shows the page title as `AIWorker · Soul Workspace` with no
  console errors, but the app remains on the `Loading Soul workspace...`
  fallback and screenshots are blank.

The failing local state has persisted legacy workers:

- `devops-worker` with `soulId: "devops"`;
- `pm-worker` with `soulId: "pm"`.

The current official app bootstrap projects only `aiworker-hr` and
`aiworker-qa` Souls and templates. `WorkerStudio` currently defaults to
`data.workers[0]`, then resolves `selectedSoul` and `selectedTemplate` from the
current catalog. For orphan legacy workers both are missing, and the component
returns `null`.

A clean temporary `AIWORKER_HOME` on another port renders the first-run Soul App
home, confirming this is stale metadata handling rather than a daemon or asset
packaging failure.

## Proposal

1. Add a Worker Web regression test where the first persisted worker references
   a legacy Soul id while valid HR/QA workers still exist.
2. Derive selectable workers from current runtime data:
   - the worker's `soulId` must match an available Soul;
   - the worker's `soulId` must have at least one capability template.
3. Resolve routed, selected and default workers only from that selectable list.
4. Build worker rail groups from selectable workers so orphan workers cannot be
   selected back into the blank state.
5. Keep the first-run path unchanged when no selectable workers exist.

## Scope

In scope:

- Worker Web selection logic in `apps/web/src/worker/worker-studio.tsx`;
- focused Worker Studio tests;
- PMA/changelog updates;
- 0.13.1 patch release prep and smoke verification if the fix passes.

Out of scope:

- deleting or migrating user metadata from `worker.db`;
- restoring old built-in `devops` / `pm` Soul semantics;
- adding Host interpretation of legacy domain data;
- broad Web layout or visual changes.

## Risks

- **Hidden legacy data.** Orphan legacy workers remain in API metadata but are
  hidden from the selectable Web rail. This is preferable to destructive
  cleanup during Web render.
- **Deep links to orphan workers.** Old `/workers/<legacy-id>` URLs will fall
  back to the first selectable worker or first-run home instead of showing the
  stale worker.
- **Template assumptions.** A worker whose Soul exists but has no templates is
  also not selectable because the current workbench requires a selected
  template to render safely.

## Verification

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run check`
- `bun run test`
- `bun run build`
- browser smoke against a legacy-home daemon
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-14 16:15: Root cause confirmed: orphan legacy workers can be returned
  before current app-projected workers, causing `WorkerStudio` to return `null`.
- 2026-05-14 16:21: Implemented the Worker Web selection repair and prepared
  `@zonease/aiworker-cli@0.13.1` as the patch version.

## Verification Results

- Initial failing test confirmed the blank-page regression with orphan legacy
  workers: `bun run --filter '@zonease/aiworker-web' test --
  src/worker/__tests__/worker-studio.test.tsx` failed with an empty rendered
  `<div />` before the fix.
- After the fix, focused Worker Studio regression tests passed:
  `bun run --filter '@zonease/aiworker-web' test --
  src/worker/__tests__/worker-studio.test.tsx`.
- `bun run --filter '@zonease/aiworker-web' build`
- Browser smoke against a temporary legacy-home daemon rendered the first-run
  Soul App surface with HR/QA app cards instead of a blank page.
- `bun run check`
- `bun run test`
- `bun run build`
- `bun apps/cli/dist/aiworker-bun.js --version` returned
  `aiworker/0.13.1 darwin-arm64 node-v24.3.0`.
- `bun pm pkg get version --cwd apps/cli/dist` returned `"0.13.1"`.
- `cd apps/cli/dist && npm pack --dry-run --json` packed
  `@zonease/aiworker-cli@0.13.1` with 114 files including Worker Web assets and
  official HR/QA app bundles.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

All commands above exited 0. `crg:review` reported static test-gap hints for the
changed Worker Studio selection path; the new Worker Studio regression tests and
legacy-home browser smoke cover the release regression.
