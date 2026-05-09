# PLAN-204 Worker Web greenfield studio rebuild

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 00:16
- **relatedTask**: REFACTOR-038

## Current State

The previous greenfield rebuild stopped short of the Web shell. The worker page
uses new `/api/local/*` data, but the product still feels old because the
default web app retains:

- fleet and worker dual bundles;
- TanStack file routing and generated route trees;
- shared admin UI primitives;
- shared theme provider;
- old dev chooser HTML that defaults to `/fleet/`;
- package dependencies and scripts for the parked fleet UI.

## Proposal

Do a destructive Web-only reset:

1. Delete the fleet Web source and dual-entry files from `apps/web`.
2. Replace Vite with a single worker app build that outputs `dist/worker`.
3. Render Worker Web directly from `src/worker/main.tsx`, without TanStack
   Router, generated route trees, or shared theme providers.
4. Replace the admin-panel `WorkspaceApp` with a purpose-built `WorkerStudio`
   and local CSS.
5. Update tests, package scripts, docs, changelog, and PMA indexes.
6. Run focused Web gates, root gates, browser review, and CRG.

## Implementation Status

| Batch | Status | Scope | Evidence |
| --- | --- | --- | --- |
| W1 shell deletion | completed | `apps/web/src/fleet`, `apps/web/fleet`, routeTree, shared admin UI | Deleted fleet bundle/source, worker routeTree/routes, shared admin primitives/theme store, old web smoke, and dual-entry HTML. |
| W2 studio rebuild | completed | `apps/web/src/worker/*`, `apps/web/index.html`, `apps/web/vite.config.ts` | Added `WorkerStudio`, `studio.css`, single root `index.html`, single Vite worker build, and worker-only package deps/scripts. |
| W3 verification | completed | tests, build, browser, CRG, docs | Web focused gates, root gates, browser desktop/mobile review, and CRG completed. |

## Verification

```sh
bun run --filter '@zonease/aiworker-web' test
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' lint
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-web' size:baseline
bun run check
bun run test
bun run build
git diff --check
bun run crg:update
bun run crg:review
```

All commands above passed on 2026-05-10. Browser proof opened
`http://127.0.0.1:5173/worker/` against the local daemon, captured desktop and
mobile viewports, and confirmed 0 console errors / 0 warnings.

CRG result: `bun run crg:update` and `bun run crg:review` reported 81 changed
files, 0 affected flows, 33 test gaps, and overall risk score 0.45. The test
gaps are helper/component-level gaps around the newly built studio and are
covered for this slice by focused Web tests plus browser review.
