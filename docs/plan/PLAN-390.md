# PLAN-390 HR three-column interactive micro-app

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-20
- **approvedAt**: 2026-05-20
- **relatedTask**: FEAT-107
- **spec**: docs/superpowers/specs/2026-05-20-hr-three-column-interactive-micro-app-design.md
- **implementationPlan**: docs/superpowers/plans/2026-05-20-hr-three-column-interactive-micro-app.md

## Current State

The HR Soul App product web now owns `product/web/people-workbench`, profile
README parsing and revision-review helpers. Its mounted route is app-owned and
boundary-correct, but it does not yet restore the full mature three-column
workbench with a persistent Profile List and right-column Recent Sessions plus
Composer flow.

## Proposal

Add an app-owned interactive HR client entry, local Host API helpers, fixed
profile lifecycle sections, three visible desktop columns, and a right-column
profile composer that can upload candidate material files and submit
`profile-update-proposal` sessions. Keep review and approval in the center
Reading Room / Profile Patch Review path.

## Scope

- HR app client asset build and mounted/standalone HTML bootstrapping.
- HR app public local API helpers for workspaces, sessions, files, reviews and
  lessons.
- HR profile lifecycle grouping and labels.
- HR three-column workbench components and interactive app shell.
- Profile composer with multi-file material attachment and session creation.
- Mounted route smoke assertions and PMA closeout.

## Non-Goals

- No Host-owned HR renderer restoration.
- No Host-side HR profile synthesis or domain interpretation.
- No migration back to `packages/component` or lucide icons.
- No change to HR native skill artifact promotion semantics.

## Verification Plan

- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' smoke`
- `bun apps/web/scripts/smoke-mounted-surfaces.ts`
- `bun run ui:check`
- Browser screenshot review for desktop light, desktop dark and narrow mounted
  HR route
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Completion Notes

The HR Soul App now owns an interactive mounted client for the profile-first
workbench. The default desktop layout restores three visible columns: Profile
List, Reading Room, and Recent Sessions plus Composer. Profile lifecycle
groups are visible by default, the composer creates profile proposal sessions
with uploaded candidate materials, and the Reading Room owns profile README
revision review and approval.

The Host remains boundary-clean for HR semantics: the Host-mounted route only
serves the HR app asset and host data, while the previous Host Web
HR-specific template preference has been removed.

`bun run ui:check` was run before closeout and still reports the existing
`packages/component/src/catalog.ts` legacy migration debt. Focused HR checks,
Host Web checks, mounted-surface smoke, screenshot verification, diff check and
code-review-graph passed for this FEAT-107 scope.
