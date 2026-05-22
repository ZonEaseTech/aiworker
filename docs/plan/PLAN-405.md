# PLAN-405 Host/Soul micro-app workbench boundary closure

- **status**: completed
- **createdAt**: 2026-05-23 00:00
- **approvedAt**: 2026-05-23 00:00
- **completedAt**: 2026-05-23 00:25
- **relatedTask**: REFACTOR-096

## Context

The active architecture contract says Host owns start, shell, locate, mount and
bridge. Universal workbench, HR workbench, QA workbench and Custom workbench are
Soul-owned mounted micro-app surfaces. Host Web currently violates that boundary
by importing `@zonease/aiworker-soul-app-workbench` and rendering
`UniversalWorkbenchApp` when `route.id === "universal-workbench"`.

Investigation found these affected surfaces:

- `apps/web/src/worker/worker-studio.tsx` imports and renders the universal
  workbench directly.
- `apps/web/package.json` depends on the Soul App workbench package.
- `packages/soul-app-sdk/src/index.ts` injects `universal-workbench` into every
  manifest passed to `defineSoulApp(...)`.
- HR, QA and Custom manifests explicitly declare universal workbench, but their
  mounted services do not consistently serve `/micro-app/workbench/universal`.
- Shared reference fixtures do not reflect the same HR/QA route declarations as
  the app manifests.
- `scripts/check-soul-app-boundaries.ts` does not yet reject Host Web imports
  of the Soul App workbench package.

## Proposal

1. Add failing tests first for the Web mount path, worker-scoped workbench
   selection, SDK no-injection behavior, official app mounted route serving and
   boundary script import guard.
2. Remove the direct Web dependency on `@zonease/aiworker-soul-app-workbench`
   and mount all `renderer: "micro-app"` routes through
   `MountedSoulAppRouteSurface`.
3. Compute workbench route options from the Worker Configuration target worker's
   app manifest. Persist the selected route in a worker-id keyed Host shell
   preference map and fall back to the first declared micro-app route when a
   worker selection becomes invalid.
4. Remove implicit SDK universal route injection. Keep reference and scaffold
   manifests explicit.
5. Align official app declarations and mounted handlers:
   - HR: universal plus HR domain workbench.
   - QA: universal-only.
   - Custom: universal-only.
6. Extend the boundary script to reject `apps/web` imports of
   `@zonease/aiworker-soul-app-workbench`.
7. Keep Host action/search/configuration product APIs absent and covered by API
   tests and OpenAPI assertions.

## Risks

- Removing the embedded universal workbench means session composer behavior must
  live inside Soul-owned mounted UI; Host must not recreate it.
- QA currently declares both universal and `qa-home`; making QA universal-only
  affects route lists and tests that expect `qa-home`.
- Shared fixtures and app manifests must stay aligned where Host bootstrap tests
  consume fixtures.
- `ui:check` can surface unrelated historical migration debt; changed UI must
  still remain shadcn-first and use existing primitives.

## Scope

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `apps/web/package.json`
- `packages/soul-app-sdk/src/index.ts`
- `packages/soul-app-sdk/src/index.test.ts`
- `packages/soul-app-runtime/src/universal-workbench-html.ts`
- `packages/soul-app-runtime/src/index.test.ts`
- `apps/aiworker-hr`, `apps/aiworker-qa`, `apps/aiworker-custom`
- `packages/shared/src/soul-app/fixtures.ts`
- focused shared/core/API tests touched by manifest route expectations
- `scripts/check-soul-app-boundaries.ts` and tests
- PMA indexes and changelog

## Alternatives

- Keep QA's domain route and hide it specially in Host. Rejected because Host
  would need route-id or app-specific meaning and QA would not satisfy the
  single-route switch rule.
- Keep SDK auto-injection and only remove Web special-casing. Rejected because
  manifest would not be the source of truth.

## Annotations

- 2026-05-23 00:00: User approved implementation after the investigation and
  recommended strict manifest-driven approach.
- 2026-05-23 00:25: Implementation completed. Verification passed for boundary
  audit, docs check, focused Web/API/SDK/runtime/HR/QA tests, UI governance,
  extra Custom/CLI/shared/core coverage, focused typecheck, and
  code-review-graph update/review.
