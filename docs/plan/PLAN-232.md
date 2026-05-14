# PLAN-232 Worker Web Soul rail and worker identity

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 23:58
- **approvedAt**: 2026-05-11 00:08
- **completedAt**: 2026-05-11 00:35
- **relatedTask**: REFACTOR-055

## Current State

- Worker Web home route currently renders a left sidebar with a readiness card,
  a Soul catalog panel, a separate capability panel, and footer settings pills.
- Soul selection is a two-column `.soul-picker-list`, so it reads like form
  selection rather than OD-style horizontal capability navigation.
- Capability templates are already filtered by selected Soul and rendered with
  `.template-picker-list`; this part can be reused.
- `selectedWorker` is derived from the selected Soul, and workspace creation
  already posts to `/api/local/workers/:workerId/workspaces`.
- The UI does not surface the current worker identity, status, or default
  engine. Users can see the Soul, but not the worker runtime they are operating.
- Workspace/session route rail shows Soul/domain/workspace/session metadata,
  but not the worker id/name/status.

## Proposal

1. **Home left rail IA**
   - Replace the current `ds-select` + `.soul-picker-list` block with an
     OD-style horizontal Soul rail.
   - Keep `available` Souls executable and `coming_soon` Souls disabled.
   - Each item should show Soul name, domain, and compact worker status when a
     worker exists.

2. **Selected worker identity**
   - Add a compact worker identity block under the Soul rail:
     worker name, `workerId`, status, default engine, and Soul binding.
   - Reuse the same identity block in workspace/session route context rail so
     the operator can always tell which worker owns the current workspace.
   - Keep this read-only in this slice. No worker create/delete/pause flow.

3. **Template list under selected Soul**
   - Keep the existing template list component and review rubric rendering.
   - Move it visually under the selected Soul/worker identity so the path reads:
     choose Soul worker -> choose capability template -> create or continue
     workspace session.

4. **Copy and responsive styling**
   - Update `apps/web/src/worker/i18n.ts` for worker identity and Soul rail copy
     in all supported locales.
   - Add CSS for horizontal rail overflow, selected state, disabled state, and
     compact worker identity without introducing new product concepts.
   - Preserve the existing desktop/session grid and ensure mobile does not get
     horizontal page overflow.

5. **Tests and verification**
   - Extend Worker Web tests to assert:
     - Soul rail is horizontal/semantic and shows HR/PM/QA/DevOps.
     - Selected worker id/name/status is visible on home.
     - Switching Soul updates templates and worker identity.
     - Workspace/session route shows current worker identity and hides the
       creation panel.
     - Workspace creation still uses the selected worker id.
   - Run focused Web gates and browser validation.
   - Because code files will change, run code-review-graph after implementation.

## Scope

In scope:

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/studio.css`
- `apps/web/src/worker/i18n.ts`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA task/plan/changelog updates

Possible but only if required:

- `apps/web/src/worker/api.ts` if a small helper improves worker identity typing.

Out of scope:

- New backend worker create/delete/pause APIs.
- Fleet/gateway worker management.
- Changing storage schema or the local daemon worker registry contract.
- Reintroducing project-scope startup or old Worker Admin routes.

## Risks

- Current deterministic one-worker-per-Soul model may later become many workers
  per Soul. This slice should label the current worker clearly without
  hardcoding UI copy that says there can never be multiple workers.
- The left rail is already dense. The implementation should remove redundant
  selected-Soul controls instead of adding another card.
- Coming-soon Souls must remain discoverable but not executable.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser validation against the local Worker Web:
  1. open home route;
  2. confirm horizontal Soul rail;
  3. switch HR -> PM and confirm templates and worker identity update;
  4. open an existing workspace/session and confirm worker identity remains visible;
  5. check a narrow viewport for overflow.
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Approval Gate

Approved by operator with `proceed` on 2026-05-11.

## Implementation

- Replaced the old selected-Soul button plus two-column Soul grid with a
  horizontally scrolling Soul rail in the home sidebar.
- Each Soul rail item shows the localized Soul name/domain plus the associated
  local worker status when present.
- Added `WorkerIdentityBlock` and rendered it on:
  - home route under the Soul rail;
  - workspace/session route under current workspace context.
- Kept the existing capability template list and review rubric rendering, now
  visually anchored under the selected Soul worker context.
- Added localized copy for worker identity fields across English, Simplified
  Chinese, Japanese, and German.
- Expanded Worker Web RTL coverage for worker identity, Soul switching, scoped
  template updates, and session-route worker context.

## Verification Results

- Passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `git diff --check`
- Browser validation passed against local daemon `:9217` and Vite `:5173`:
  - home route showed horizontal Soul rail and current worker `hr-worker`;
  - switching HR -> PM showed `pm-worker` and PM templates;
  - session route showed `hr-worker` in workspace navigation and did not show
    the creation panel;
  - Playwright 390x844 check returned `scrollWidth=390` and
    `clientWidth=390`.
- code-review-graph:
  - `bun run crg:update`: incremental update completed for 8 files.
  - `bun run crg:review`: 7 changed functions/classes, 0 affected flows, 3
    test gaps, risk score `0.45`.
  - CRG MCP `detect_changes`: 0 affected flows; test gaps named
    `WorkerStudio`, `worker`, and `WorkerIdentityBlock`, covered by the
    expanded Worker Web RTL flow plus browser validation.
  - CRG MCP `get_impact_radius` was broad/noisy for this UI slice, but no
    affected execution flows were reported.
