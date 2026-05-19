# PLAN-371 HR profile composer panel refinement

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: BUG-138

## Current State

`HrProfileToolsPanel` currently renders Recent Sessions and the profile composer
inside the same aside, but the Recent Sessions block still uses the generic
`.hr-tool-section` card styling while the composer starts after a separate
divider. The result reads as two unrelated panels.

The composer already imports `IconButton` and `Textarea` from
`@zonease/aiworker-component`, but proposal type is rendered by a native
`<select>`. The add-file affordance uses `IconButton`, but the count badge and
button sizing are not tuned for the compact action bar.

## Proposal

1. Keep the implementation inside the HR People Workbench because the wording,
   profile draft defaults and candidate material semantics are HR-owned.
2. Use the existing shared component primitives:
   - `Textarea` for candidate material input.
   - `IconButton` for file, remove-file and submit actions.
   - `Select` for proposal type.
3. Convert the right panel into one continuous vertical surface:
   - Recent Sessions becomes a compact header/list segment without its own card
     background.
   - A single divider connects Recent Sessions to the composer header.
   - The composer fills remaining height.
4. Refine the bottom action bar:
   - file button is a compact icon button with an attached count badge;
   - proposal type select occupies the center track;
   - send remains an icon-only primary button on the right.

## Risks

- Radix Select renders through a portal, so tests should query it as a
  combobox-like button instead of assuming a native select value.
- The right panel is height-sensitive; CSS must preserve textarea flex behavior
  and prevent file rows or dropdown copy from shifting the action bar.

## Verification

- [x] `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- [x] `bun run --filter '@zonease/aiworker-web' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' build`
- [x] `bun run ui:check`
- [x] Browser smoke of HR People Workbench right panel.
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Annotations

- 2026-05-19 16:30 CST：开始修复 HR profile composer panel 视觉一致性和
  shared component primitive 使用问题。
- 2026-05-19 16:43 CST：实现并验证完成。CRG review 退出 0，保留
  `HrProfileToolsPanel` advisory static test gap；该路径由
  `worker-studio.test.tsx` 的 profile composer、multi-file material 和
  shared Select assertions 覆盖。
