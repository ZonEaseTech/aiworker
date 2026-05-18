# REFACTOR-083 Extract shared collapsible grouped list pattern

- **status**: completed
- **priority**: P1
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **plan**: PLAN-364
- **relatesTo**: REFACTOR-080, FEAT-097

## Background

The Worker Web left rail groups Soul workers under their owning Soul App, and
the HR People Workbench groups people profiles under lifecycle sections. Both
surfaces implement the same collapsible grouped-list pattern independently:
group toggle, expanded drawer, count/meta, chevron state, and child item
nesting.

The current duplication made the worker rail indentation discussion expose a
broader design-system gap. Fixing only one local CSS block would leave the HR
profile list with the same hierarchy problem and would let the two patterns
continue to drift.

## Acceptance Criteria

- A shared component pattern owns the collapsible group shell, chevron state,
  count/meta affordance, drawer container, and child indentation.
- The Worker Web Soul worker rail uses the shared grouped-list pattern.
- The HR People Workbench profile list uses the same grouped-list pattern.
- Child item rendering remains locally owned by each surface.
- Host/Soul protocol, manifest, profile promotion, and domain data behavior do
  not change.
- Focused Worker Web tests cover both the worker rail and HR profile list
  grouped-list markup or behavior.
- Focused Web verification and code-review-graph review run before completion.

## Notes

- This is a shared UI refactor across Host shell and HR Soul App domain UI.
- The shared component must not encode HR lifecycle or Host worker semantics.
- The component should only express generic grouped-list structure and visual
  hierarchy.

## Completion

Implemented a shared `StudioCollapsibleGroup` component pattern in
`@zonease/aiworker-component` and migrated both grouped-list consumers:

- Worker Web Soul worker rail now renders Soul App groups through the shared
  grouped-list shell.
- HR People Workbench profile lifecycle sections now render through the same
  grouped-list shell.
- Worker item and profile card rendering remain locally owned by their
  respective surfaces.
- Shared CSS now owns the toggle row, chevron state, meta/count affordance, and
  indented drawer guide.

Verification completed:

- `bun run --filter '@zonease/aiworker-web' test src/shared/__tests__/studio-collapsible-group.test.tsx src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Browser smoke at `http://127.0.0.1:5173/workers/w_mn17k4brsadp` against the
  existing local daemon
- `bun run crg:update`
- `bun run crg:review`
