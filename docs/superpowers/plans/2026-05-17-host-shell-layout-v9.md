# Host Shell Layout V9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Worker Web to the approved full-width Host header layout with fixed Host panel toggles and a fully hideable sidebar.

**Architecture:** Extend the shared `WorkerStudioLayout` with a full-width header row and a sidebar-collapsed state. Keep Host chrome in `WorkerStudio`; keep Soul App business content inside the existing main renderers.

**Tech Stack:** React 19, TypeScript, lucide-react, existing Worker Web CSS tokens, Vitest/RTL.

---

### Task 1: Shared Layout Frame

**Files:**
- Modify: `packages/component/src/layout/shell.tsx`
- Modify: `apps/web/src/styles/shell.css`
- Modify: `apps/web/src/styles/responsive.css`

- [x] Add `header?: ReactNode` and `sidebarCollapsed?: boolean` props to `WorkerStudioLayout`.
- [x] Render the optional header as a full-width row before sidebar/main/detail.
- [x] Add CSS for a 40px header row and body grid under it.
- [x] Make `sidebarCollapsed` hide `.entry-side` completely and let main content fill the available columns.
- [x] Keep the existing session detail drawer behavior intact.

### Task 2: Worker Studio Host Header

**Files:**
- Modify: `apps/web/src/worker/worker-studio.tsx`

- [x] Add local `sidebarCollapsed` state.
- [x] Render a Host top bar with:
  - `PanelLeftClose` when the sidebar is visible;
  - `PanelLeftOpen` when the sidebar is hidden;
  - locator text from selected Soul App and Soul worker;
  - disabled/reserved `PanelBottom` and `PanelRight` icon buttons.
- [x] Replace the left-rail brand block with Host list item actions:
  - `New Soul worker`;
  - `Search`;
  - `Soul Apps`.
- [x] Keep Settings and version in the sidebar footer.

### Task 3: Tests And Focused Verification

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] Add/adjust tests for the full-width Host header and sidebar toggle.
- [x] Assert `PanelBottom` and `PanelRight` placeholders render but do not change business state.
- [x] Preserve existing HR workbench tests for profile list, profile tools, app shell actions, and session detail.
- [x] Run `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`.

### Task 4: Browser And Review

**Files:**
- Review: `apps/web/src/worker/worker-studio.tsx`
- Review: `packages/component/src/layout/shell.tsx`
- Review: `apps/web/src/styles/shell.css`

- [x] Run the focused Web build or typecheck if tests pass.
- [x] Inspect expanded and collapsed layouts in a browser.
- [x] Run `bun run crg:update` and `bun run crg:review` before completion.
