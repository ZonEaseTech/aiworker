# PLAN-398 Host output metadata boundary

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21 12:21
- **approvedAt**: 2026-05-21 15:35
- **completedAt**: 2026-05-21 16:36
- **relatedTask**: REFACTOR-090

## Current State

The active architecture contract says Host owns start, shell, locate, mount and
bridge. Soul Apps own domain state, app-owned outputs, review meaning and
confirmation actions. The contract explicitly says Host must not store generic
review rows, lesson ledgers, admission proposals, profile promotion state or
domain facts as product primitives.

Current implementation still keeps a generic Host artifact/review/lesson path:

- `apps/api/src/modes/worker.ts` imports review and lesson repository helpers
  and exposes `/api/local/reviews`, `/api/local/reviews/:id`,
  `/api/local/lessons` and `/api/local/lessons/:id` routes.
- `packages/storage-sqlite/src/worker/schema.ts` defines `reviews` and
  `lessons` tables with generic verdict, findings, risks, statement and status
  columns.
- `packages/storage-sqlite/src/worker/index.ts` exposes generic
  `createReview`, `listReviews`, `createLesson`, `updateLesson` and
  `listLessons` helpers.
- `packages/core/src/worker/runtime.ts` turns executor `result.review` and
  `result.lessons` into Host DB rows and emits generic `review` and `lesson`
  session events.
- `apps/web/src/features/local-workspace/api/workspace-data.ts` fetches all
  Host artifacts, reviews and lessons for the default Worker Web snapshot.
- `apps/web/src/worker/worker-studio.tsx` can create a Host generic review and
  mutate Host generic lesson status from Worker Web.
- `apps/web/src/worker/session-detail.tsx` renders a generic review request
  button and accept/reject lesson controls in the Host session detail surface.
- HR People Workbench currently depends on the generic Host snapshot:
  `apps/aiworker-hr/product/web/people-workbench/api.ts` reads
  `/api/local/artifacts`, `/api/local/reviews` and `/api/local/lessons`, then
  projects those rows into HR profile state.
- QA does not directly read the Host generic artifact/review/lesson APIs. Its
  current mounted API is already app-owned around release gate drafts.
- `artifacts` is different from `reviews` and `lessons`: the current table can
  still fit Host metadata when treated as a session output file reference. The
  generic review and lesson tables encode product decisions, findings, risks,
  statements and acceptance status, so they violate the active Host data
  boundary.

## Proposal

Use a breaking cleanup. The approved scope is stricter than the investigation
proposal: remove the old Host generic review/lesson storage surface, move HR
profile updates to app-owned README writes, allow old workspaces to break, and
remove proposal/review/lesson language from the active user-facing product
surface where it is not a vertical domain term.

1. Keep Host `artifacts` as session output references for now.
   - Reframe API/docs/test expectations around output references and platform
     file pointers.
   - Do not use artifact kind/title/status as Host-owned product state in
     default Worker Web.

2. Stop Host Web from presenting generic review/lesson operations.
   - Remove the Worker Web "request confirmation" action that calls
     `POST /api/local/reviews`.
   - Remove Host lesson accept/reject controls that call
     `PATCH /api/local/lessons/:id`.
   - Prefer mounted Soul App micro-app routes for session/workspace product
     surfaces when a micro-app route is declared.
   - Keep Host session UI focused on session status, engine output references,
     files and mounted app entrypoints.

3. Stop eager default snapshot reads of generic reviews and lessons.
   - Remove `/api/local/reviews` and `/api/local/lessons` from Worker Web's
     default `loadLocalWorkspaceData()` path.
   - If a temporary legacy view still needs old rows, load it through an
     explicitly named compatibility helper instead of default state.

4. Move HR People Workbench off generic Host review/lesson/profile-promotion
   routes.
   - Read workspaces, sessions, artifacts and app-owned README files through
     Host file/session metadata routes only.
   - Write accepted People Profile state by updating workspace `README.md`
     from the HR app surface.
   - Rename the visible HR capability from `profile-update-proposal` to
     `profile-update-draft`.

5. Narrow Host API write surface.
   - Remove or reject `POST /api/local/reviews`, `POST /api/local/lessons` and
     `PATCH /api/local/lessons/:id` from the default public local API.
   - Keep read-only legacy list/show endpoints only if implementation evidence
     shows current HR compatibility still needs them during this slice.
   - Remove generic review/lesson write routes from OpenAPI metadata.

6. Stop runtime/executor synthetic review and lesson creation.
   - Keep executor artifact discovery and Host output reference registration.
   - Remove automatic `result.review` / `result.lessons` persistence into Host
     DB rows.
   - Replace generic `review` / `lesson` session events generated by Host with
     session status/output events, or leave app-owned review information as
     app-owned descriptors surfaced through mounted APIs.
   - Keep historical read compatibility for existing `reviews` / `lessons`
     tables in this slice; full table removal can be a follow-up migration once
     no official app or profile promotion path needs it.

7. Remove Host profile-promotion compatibility.
   - Delete `/api/local/workspaces/:workspaceId/profile-revisions` from the
     active local API and OpenAPI contract.
   - Keep only app-owned README writes for HR accepted profile updates.

## Risks

- HR profile promotion currently creates a review row as part of the Host core
  runtime path. Removing or narrowing generic reviews without replacing that
  path may break profile promotion history.
- Session tests currently assert `artifact -> review -> lesson` event sequences.
  The new boundary needs an intentional event contract instead of silently
  deleting coverage.
- Official Soul Apps may still consume Host-wide review/lesson snapshots for
  mounted product UI. Any compatibility must be deliberate and temporary.
- Storage schema cleanup may require migrations if tables or indexes are
  removed, renamed or repurposed.
- Moving HR off raw Host rows can expose hidden assumptions in people profile
  status ordering, latest-review derivation and profile promotion artifact
  selection.
- Removing synthetic executor reviews means failed-artifact recovery must still
  be visible through session status/output references, not silently lost.

## Scope

Likely touched areas:

- `apps/api/src/modes/worker.ts`
- `apps/api/src/modes/worker.local.test.ts`
- `packages/storage-sqlite/src/worker/schema.ts`
- `packages/storage-sqlite/src/worker/index.ts`
- `packages/storage-sqlite/src/worker/index.test.ts`
- `packages/core/src/worker/runtime.ts`
- `packages/core/src/worker/runtime.test.ts`
- `apps/web/src/features/local-workspace/api/`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/session-detail.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Official Soul App tests only if their Host data assumptions change.
- `docs/architecture.md`, `AGENTS.md` or Soul App authoring docs only if the
  implementation exposes a new explicit boundary term.

Non-goals:

- Do not remove the `artifacts` table in this slice.
- Do not remove the app-owned review protocol field names in this slice; they
  remain schema compatibility for Soul App manifests and adapters while their
  visible copy now says acceptance checks.
- Do not remove the shared `ui.workbench`, `host-descriptor` or
  `soul-workbench` compatibility schema here; that is the next cleanup slice.
- Do not redesign HR or QA product UI beyond the minimum needed to route data
  through app-owned APIs.

## Alternatives

1. Recommended: stop new writes and default UI first, keep read-only legacy
   compatibility while HR moves to app-owned DTOs. This removes the product
   smell from the default path without breaking current HR promotion.
2. More aggressive: remove generic review/lesson tables and shared types in the
   same slice. This is architecturally cleaner, but it risks breaking HR
   profile promotion and old workspaces at once.
3. Weaker: hide generic review/lesson from Web but keep runtime/API writes.
   This is not enough because the product concept remains in Host core and
   storage.

## Verification Plan

- Host API route tests for removed review/lesson/profile-revision paths.
- Storage tests for the remaining metadata tables, indexes and drop migration.
- Core runtime tests for session output capture and event sequence.
- Worker Web tests for removed generic review/lesson controls and snapshot
  loading changes.
- Official Soul App tests for HR README-owned profile updates and visible draft
  language.
- `bun run ui:check`
- `bun run crg:update`
- `bun run crg:review`

## Implementation Notes

- Removed Host `reviews` and `lessons` schema objects, repository helpers,
  exports and runtime/executor synthetic review/lesson result handling.
- Added worker DB migration `0005_fluffy_jane_foster.sql` to drop `lessons`
  and `reviews`.
- Removed Host local API routes and OpenAPI entries for `/reviews`,
  `/lessons` and workspace `profile-revisions`.
- Removed Worker Web default snapshot reads and generic review/lesson session
  panels/actions.
- Migrated HR People Workbench to read and write app-owned profile state through
  workspace `README.md`; app-visible profile updates are now `profile-update-draft`.
- Updated active Soul App authoring docs, CLI docs, HR product docs, i18n copy
  and capability metadata away from generic proposal/review/promotion language.

## Verification Results

- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- `bun run ui:check`

Focused commands expected after implementation:

- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts src/worker/executor.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-hr' test product/web/people-workbench/api.test.ts product/web/people-workbench/model.test.ts`
- `bun run --filter '@zonease/aiworker-qa' test host-adapter/index.test.ts`

## Component Library Preflight

This slice may remove Host Web controls but should not add new app-local UI. If
visible Web changes are needed, check existing `packages/ui` primitives already
used by Worker Web: `Button`, `Item`, `ItemGroup`, `ItemActions`,
`ReviewPanelShell` composition and the Session Kit surfaces. Any new local UI
requires an explicit ownership reason and `bun run ui:check`.

## Annotations

- 2026-05-21 12:21: Draft opened for investigation. Proposal is intentionally
  pending until API/storage/core/Web/Soul App impact is traced.
- 2026-05-21 12:31: Impact scan completed with API/storage/core, Worker Web
  and official Soul App read-only subagents. Recommended path is stop new
  Host generic review/lesson writes and default UI first, keep artifacts as
  output references, and migrate HR people data behind app-owned mounted APIs.
- 2026-05-21 15:35: Approved with explicit breaking scope: delete legacy
  review/lesson tables, migrate HR profile to app-owned APIs, allow old
  workspaces to break, and adjust user-visible product language.
