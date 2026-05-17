# PLAN-351 Worker Web Host shell V9 layout

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17
- **approvedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **relatedTask**: REFACTOR-080

## Current State

Worker Web currently renders route-specific sidebar content directly beside the
main content. Session routes can make the Host sidebar feel like a workspace or
session detail surface. Header-level Host panel controls do not exist.

## Proposal

Implement the approved V9 layout:

1. Change the shared Worker Studio layout to a full-width 40px Host header row
   above the sidebar/main/detail grid.
2. Add fixed Host header controls: `PanelLeftClose` / `PanelLeftOpen`,
   `PanelBottom`, and `PanelRight`.
3. Make sidebar collapse fully hide the sidebar instead of retaining an icon
   rail.
4. Replace the sidebar brand/logo block with Host list item actions.
5. Preserve existing Soul App main content and HR workbench behavior.

## Scope

- Worker Web Host shell layout.
- Shared Worker Studio layout primitive.
- Focused Worker Studio tests and CSS.

## Non-Goals

- Implementing the workspace web terminal.
- Implementing the future right sidebar content.
- Changing Soul App protocol semantics, HR profile behavior, artifact review,
  profile promotion, or workspace data models.
- Introducing new visual tokens or a new design language.

## Risks

- Session route tests depend on the existing workspace context sidebar. The
  implementation should preserve data and navigation behavior while moving the
  outer layout chrome.
- Mobile CSS currently stacks sidebar and main. The full-width header must keep
  mobile layout coherent without adding new interaction modes.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: browser smoke on `http://127.0.0.1:4195/` for expanded and hidden sidebar states.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`

## Notes

`bun run crg:review` reported residual structural test gaps for the newly
introduced Host helper components, but the focused Worker Studio suite covers
their rendered behavior through the public shell: full-width header, reserved
panel buttons, sidebar hide/show, fixed Host navigation, and preserved HR
workbench/session behavior.
