# FEAT-102 Session Kit shared composer and session surfaces

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **plan**: PLAN-376
- **relatesTo**: FEAT-099, FEAT-100, BUG-138, FEAT-101

## Background

Worker Web has started using `@zonease/aiworker-component` primitives and
patterns, but the session experience is still split across local Host Web and
HR Workbench implementations. The generic workspace composer, session follow-up
composer, session detail turn composer, and HR profile-draft right panel each
maintain their own action-bar or composer structure.

The approved design in
`docs/superpowers/specs/2026-05-19-session-kit-design.md` defines a shared
Session Kit boundary: shared UI plus view-model helpers live in
`packages/component`, while Host Web and Soul Apps own data loading, session
streaming, route state and domain semantics.

## Acceptance Criteria

- `packages/component` exposes a Session Kit with shared composer, action-bar,
  attachment helper, timeline view-model and detail-panel surfaces.
- Generic workspace session creation uses the shared `SessionComposer`.
- Session follow-up uses the shared compact composer.
- HR People Workbench right panel uses the shared composer/action bar and no
  longer owns duplicated action-bar, attachment-list and compact select CSS for
  behavior covered by Session Kit.
- Session event normalization and timeline grouping are shared helpers that do
  not import Host Web API clients or HR/Soul internals.
- Session detail layout reuses shared section/panel shells where practical.
- Component catalog and migration queue reflect the new Session Kit state.
- Focused component and Worker Web tests cover generic and HR consumption.
- Browser smoke, UI governance check and code-review-graph review pass before
  completion.

## Notes

- This task must preserve the Host/Soul boundary. Shared components must not
  fetch Host data, promote HR profiles, interpret review verdicts or infer Soul
  domain state.
- The HR right panel remains profile-first. Recent sessions, selected profile
  context, profile-update prompt semantics and promotion policy stay in HR code.

## Completion

Session Kit now lives in `packages/component` as shared UI plus view-model
helpers:

- `SessionComposer`, `SessionComposerActionBar` and `SessionAttachmentList`
  cover the shared composer/action bar and attachment rows.
- `createComposerAttachment`, attachment formatting helpers,
  `normalizeSessionEvents` and `createSessionTimelineViewModel` cover neutral
  session view-model work.
- `SessionTimeline` owns normalized turn/event rendering, including tool result
  pairing.
- `SessionDetailPanel` owns the generic detail-section shell.

Worker Web now consumes the shared kit from the workspace session creation
composer, session follow-up composer, session detail panel and HR profile-draft
right panel. HR keeps profile selection, recent sessions, labels, materials,
profile draft metadata and promotion policy in app-owned code.

Verification completed:

- `bun run --filter '@zonease/aiworker-component' test`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run ui:check`
- `git diff --check`
- Browser smoke on HR right panel and session route at `http://127.0.0.1:55206`
- `bun run crg:update`
- `bun run crg:review` exited 0; it reported residual structural test gaps for
  changed UI functions, covered by the focused WorkerStudio integration test and
  component tests above.
