# PLAN-376 Session Kit shared composer and session surfaces

- **status**: in_progress
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: FEAT-102

## Current State

`packages/component` already contains shared primitives and patterns used by
Worker Web. Session UI remains partly local:

- `apps/web/src/features/local-workspace/components/session-composer.tsx` owns
  the large workspace composer.
- `apps/web/src/worker/session-chat.tsx` owns event normalization, timeline
  rendering, scroll pinning and the compact follow-up composer.
- `apps/web/src/worker/session-detail.tsx` owns artifact/review/lesson/event
  panel composition and a right-side turn composer.
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
  owns a richer HR profile-draft composer with file materials, compact proposal
  type select and icon-only submit.

The HR composer/action bar is the best current visual baseline, but its HR
labels, focused profile context and promotion semantics must stay app-owned.

## Proposal

Implement the approved Session Kit design:

1. Add shared Session Kit components, helpers, styles and tests to
   `packages/component`.
2. Migrate generic workspace session creation and session follow-up composer
   surfaces to the shared composer.
3. Migrate the HR profile tools panel composer to the same shared composer and
   remove duplicated HR composer/action-bar CSS.
4. Move session event normalization and timeline grouping into shared helpers,
   then consume them from Worker Web.
5. Move reusable session detail section layout into shared panel components
   while keeping artifact/review/lesson meaning in the consumer.
6. Update catalog/migration queue, PMA docs and changelog.

## Component Library Preflight

Checked shared components:

- `Button`, `IconButton`, `Select`, `Textarea`
- `ProgressCard`
- `MessageFlow`, `MessageRow`, `StatusEventPill`, `ToolResultCard`
- `ArtifactPreviewFrame`, `ReviewPanelShell`, `ProfileReaderShell`
- `StudioSectionHeader`, `StudioActivityRow`, `StudioEmptyState`,
  `StudioPill`, `StudioStatusPill`

Reusable gaps to close in this plan:

- `SessionComposer`
- `SessionComposerActionBar`
- `SessionAttachmentList`
- `createComposerAttachment` and attachment formatting helpers
- `normalizeSessionEvents`
- `createSessionTimelineViewModel`
- `SessionTimeline`
- `SessionDetailPanel`

Local UI exceptions:

- HR keeps profile list, recent-session list, profile section actions and
  profile patch review UI because those are HR domain semantics.
- WorkerStudio keeps route, stream and Host API state because shared components
  must not fetch or route.

## Scope

- `packages/component/src/patterns/session-composer.tsx`
- `packages/component/src/patterns/session-timeline.tsx`
- `packages/component/src/patterns/session-detail.tsx`
- `packages/component/src/patterns/session-view-model.ts`
- `packages/component/src/patterns/index.ts`
- `packages/component/src/index.ts`
- `packages/component/src/styles/patterns.css`
- `packages/component/src/catalog.ts`
- `packages/component/src/patterns/patterns.test.tsx`
- `apps/web/src/features/local-workspace/components/session-composer.tsx`
- `apps/web/src/worker/session-chat.tsx`
- `apps/web/src/worker/session-detail.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- `apps/web/src/styles/session-chat.css`
- `apps/web/src/styles/workspace.css`
- `apps/web/src/styles/artifact.css`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA task/plan/changelog files

## Non-Goals

- No Host/Soul protocol, manifest, API or storage schema changes.
- No shared component fetches Host data or invokes Soul App actions.
- No broad visual redesign beyond unifying the composer/action bar and shared
  session surfaces.
- No release automation in this plan.

## Risks

- The full extraction is large. Mitigation: implement in slices, starting with
  composer/action bar, then timeline helpers, then detail shells.
- Moving event normalization can change visible session output. Mitigation:
  write shared helper tests and keep WorkerStudio integration tests focused on
  running, file-written and artifact-indexed states.
- HR profile semantics could leak into the shared package. Mitigation: shared
  APIs accept generic labels/options/material descriptors; HR maps its own
  labels and session metadata outside the package.
- CSS movement can regress layout. Mitigation: keep package-owned class names,
  run `ui:check`, and use browser smoke on generic session and HR right panel.

## Implementation Plan

Detailed implementation steps are tracked in
`docs/superpowers/plans/2026-05-19-session-kit.md`.

## Verification

- [ ] `bun run --filter '@zonease/aiworker-component' test`
- [ ] `bun run --filter '@zonease/aiworker-component' typecheck`
- [ ] focused WorkerStudio tests
- [ ] `bun run --filter '@zonease/aiworker-web' typecheck`
- [ ] `bun run --filter '@zonease/aiworker-web' lint`
- [ ] `bun run --filter '@zonease/aiworker-web' build`
- [ ] `bun run ui:check`
- [ ] browser smoke for generic session route and HR right panel composer
- [ ] `git diff --check`
- [ ] `bun run crg:update`
- [ ] `bun run crg:review`
