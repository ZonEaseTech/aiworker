# PLAN-354 HR profile patch review workbench

- **status**: implementing
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **relatedTask**: FEAT-096

## Current State

The current HR People Workbench already has:

- an accepted README parser under `profile-readme.ts`;
- a `buildProfileRevisionReview` helper that validates whether an artifact
  contains a promotable `aiworker-profile-readme` draft;
- a center Reading Room that renders the accepted README profile;
- a narrow `HrProfileToolsPanel` that currently renders proposed markdown,
  revision status, source inventory, guardrails, sessions, action catalog and
  the composer.

This creates the behavior the user reported: markdown previews are hard to read
in the right panel, long README sections make the Reading Room feel uneven, and
action overload makes the next step unclear.

## Proposal

Refactor the HR workbench around a Profile Patch Review model:

1. Extend the revision-review model so it compares current README and proposed
   README section-by-section.
2. Render pending patch awareness inside the Reading Room with a slim strip and
   section badges.
3. Add a center-column Profile Patch Review view for the human decision:
   current README versus proposed README, changed-section navigation, guardrail
   status, reject/back and approve actions.
4. Reduce the right panel to a concise Next Step surface with no full markdown
   preview.
5. Keep section-level apply out of scope for the first implementation; approval
   remains whole-patch.

## Scope

- HR People Workbench React components, model helpers, copy and CSS.
- Focused Worker Studio tests and HR model tests.
- Superpowers design/implementation docs, PMA task/plan and changelog evidence.

## Non-Goals

- No Host shell layout changes.
- No manifest/protocol contract changes.
- No profile promotion API changes.
- No section-level partial apply.
- No raw artifact markdown reader in the right panel.

## Risks

- The Profile Patch Review must remain Product-owned and must not let Host infer
  HR domain meaning. It stays inside the HR workbench and uses existing shared
  promotion validation.
- Diff visuals can become another overloaded surface. The implementation will
  keep the Reading Room lightweight and move detailed comparison into an
  explicit review mode.
- Existing Worker Studio tests are broad. New assertions should target visible
  HR behavior without snapshot churn.

## Verification

- `bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser smoke against the local HR workspace URL for:
  - normal Reading Room with patch strip and section badges;
  - Profile Patch Review current/proposed comparison;
  - blocked patch state;
  - reduced Next Step right panel.
- `bun run crg:update`
- `bun run crg:review`

