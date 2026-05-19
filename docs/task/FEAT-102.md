# FEAT-102 Session Kit shared composer and session surfaces

- **status**: in_progress
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
