# Universal Workbench Empty Composer Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the selected-workspace/no-session universal workbench composer use a centered Codex-like balanced width without changing Host mounted behavior or active-session layouts.

**Architecture:** The change stays inside the Soul-owned `packages/soul-app-workbench` universal workbench React tree. Host Web keeps mounting declared micro-app surfaces only; no Host container, route preference, Worker Configuration or protocol logic changes. Static render tests lock the empty workspace state before the layout class is changed.

**Tech Stack:** TypeScript, React, Bun test, Tailwind/shadcn semantic classes, `@zonease/aiworker-ui` shared composer, code-review-graph.

---

## File Structure

- Create `docs/task/BUG-161.md`: PMA task record for this visual regression.
- Modify `docs/task/index.md`: append the in-progress BUG-161 line.
- Create `docs/plan/PLAN-418.md`: PMA plan record linked to the approved Superpowers spec and this implementation plan.
- Modify `docs/plan/index.md`: append the in-progress PLAN-418 line.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`: static render regression coverage for the empty workspace composer container and balanced max width.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`: only the selected-workspace/no-session branch layout classes.

Do not modify `apps/web`, Host mounted container code, Worker Configuration, manifest/protocol routing, `SessionChatView`, `SessionDetail` or shared `ManagedSessionComposer` APIs.

## Execution Rules

- Keep UI values in existing Tailwind/shadcn semantic classes.
- Do not add custom CSS, hex color literals or arbitrary value classes.
- Keep the composer responsive with `w-full` plus a max-width cap.
- Leave active session follow-up composers and timeline width unchanged.
- After code edits, run code-review-graph because AGENTS requires it for code changes.

### Task 1: Create PMA Tracking Records

**Files:**
- Create: `docs/task/BUG-161.md`
- Modify: `docs/task/index.md`
- Create: `docs/plan/PLAN-418.md`
- Modify: `docs/plan/index.md`

- [ ] **Step 1: Create the PMA task file**

Create `docs/task/BUG-161.md` with exactly this content:

```markdown
# BUG-161 Universal workbench empty composer spans main width

- **status**: in_progress
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-26
- **claimedAt**: 2026-05-26
- **plan**: PLAN-418
- **relatesTo**: SOUL-001, MOUNT-001, UI-001

## Background

When a workspace is selected but no session is selected, the Soul-owned universal workbench renders the new-session composer too wide for the main area. The visual target is a Codex-like empty state: the title and composer form a centered group, and the composer has a balanced maximum width instead of reading as a full-main control.

## Evidence

- User-provided screenshot in the Superpowers brainstorming thread.
- Approved design: `docs/superpowers/specs/2026-05-26-universal-workbench-empty-composer-layout-design.md`.

## Acceptance Criteria

1. Selected-workspace/no-session universal workbench state shows the new-session composer horizontally centered.
2. The composer is capped around the balanced Codex-like width using existing semantic Tailwind/shadcn classes.
3. Narrow screens keep full-width behavior within the available padded main area and do not introduce horizontal overflow.
4. Active-session timeline and follow-up composer layout remain unchanged.
5. No Host Web import, route special case, mounted container change or Worker Configuration behavior is introduced.
6. Focused tests, UI governance, Host/Soul boundary audit and code-review-graph are recorded at closeout.

## Notes

The implementation belongs in `packages/soul-app-workbench`, because universal workbench is a Soul-owned mounted micro-app surface.
```

- [ ] **Step 2: Create the PMA plan file**

Create `docs/plan/PLAN-418.md` with exactly this content:

```markdown
# PLAN-418 Universal workbench empty composer layout

- **status**: approved
- **owner**: codex
- **createdAt**: 2026-05-26
- **relatedTask**: BUG-161
- **superpowersSpec**: docs/superpowers/specs/2026-05-26-universal-workbench-empty-composer-layout-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-26-universal-workbench-empty-composer-layout.md

## Context

The selected-workspace/no-session branch in `UniversalWorkbenchApp` currently renders the new-session composer with a smaller fixed cap and without an explicit empty-state slot. The desired product feel is a centered Codex-like input group with a balanced maximum width.

## Proposal

1. Add static-render coverage for the empty workspace composer state before changing the layout.
2. Add an explicit empty-state data slot to the selected-workspace/no-session branch.
3. Change the new-session composer width from the current compact cap to `w-full max-w-3xl`.
4. Keep active-session follow-up composer, timeline and Host mounted code unchanged.

## Verification

- `bun run --filter '@zonease/aiworker-soul-app-workbench' test src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`
```

- [ ] **Step 3: Append PMA index lines**

Append this line to the end of `docs/task/index.md`:

```markdown
- [-] [**BUG-161 Universal workbench empty composer spans main width**](BUG-161.md) `P2`
```

Append this line to the end of `docs/plan/index.md`:

```markdown
- [-] [**PLAN-418 Universal workbench empty composer layout**](PLAN-418.md) `2026-05-26`
```

- [ ] **Step 4: Verify PMA docs are staged cleanly**

Run:

```bash
git diff -- docs/task/BUG-161.md docs/task/index.md docs/plan/PLAN-418.md docs/plan/index.md
```

Expected: only the new BUG-161 file, new PLAN-418 file and one appended index line in each index.

- [ ] **Step 5: Commit PMA tracking**

Run:

```bash
git add docs/task/BUG-161.md docs/task/index.md docs/plan/PLAN-418.md docs/plan/index.md
git commit -m "docs: 登记通用 workbench composer 布局修复"
```

Expected: commit succeeds with only PMA tracking docs.

### Task 2: Add Failing Static Render Test

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`

- [ ] **Step 1: Update the selected-workspace/no-session test**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`, update the test named `renders the managed session composer for a selected workspace without raw new-session form markup`.

Replace the expectation block at the end of the test with:

```ts
    expect(html).toContain('data-slot="session-composer"')
    expect(html).toContain('What do you want to work on?')
    expect(classForSlot(html, 'empty-workspace-composer-state')).toContain('justify-center')
    expect(html).toContain('class="flex min-w-0 flex-col gap-2 w-full max-w-3xl"')
    expect(html).not.toContain('w-full max-w-xl')
    expect(html).not.toContain('class="flex w-full max-w-xl gap-2"')
    expect(html).not.toContain('type="button">Start</button>')
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test src/universal-workbench/UniversalWorkbenchApp.test.tsx
```

Expected: FAIL because `empty-workspace-composer-state` does not exist yet and the composer still uses `max-w-xl`.

### Task 3: Implement Empty Composer Layout

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`

- [ ] **Step 1: Add the empty-state slot and balanced composer width**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`, replace the selected-workspace/no-session branch from:

```tsx
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">{selectedWorkspace.name}</h2>
                    <p className="text-sm text-muted-foreground">Start a new session or select one from the sidebar.</p>
                  </div>
                  <ManagedSessionComposer
```

through the composer class line:

```tsx
                    className="w-full max-w-xl"
```

with:

```tsx
                <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-6" data-slot="empty-workspace-composer-state">
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">{selectedWorkspace.name}</h2>
                    <p className="text-sm text-muted-foreground">Start a new session or select one from the sidebar.</p>
                  </div>
                  <ManagedSessionComposer
```

and:

```tsx
                    className="w-full max-w-3xl"
```

Do not change any composer props other than `className`.

- [ ] **Step 2: Run the focused test and confirm it passes**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test src/universal-workbench/UniversalWorkbenchApp.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit the code and test change**

Run:

```bash
git add packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx
git commit -m "fix: 收敛通用 workbench 空态 composer 宽度"
```

Expected: commit succeeds with one source file and one test file.

### Task 4: Verification, PMA Closeout And Review

**Files:**
- Modify: `docs/task/BUG-161.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-418.md`
- Modify: `docs/plan/index.md`

- [ ] **Step 1: Run focused and governance verification**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run ui:check
bun scripts/check-soul-app-boundaries.ts --completion-audit
git diff --check
```

Expected: all commands pass.

- [ ] **Step 2: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: update completes and review reports no blocking issue for the layout-only change.

- [ ] **Step 3: Record PMA closeout**

In `docs/task/BUG-161.md`, change:

```markdown
- **status**: in_progress
```

to:

```markdown
- **status**: completed
```

Append this closeout section to the end of `docs/task/BUG-161.md`:

```markdown

## Closeout

Completed the scoped universal workbench empty composer layout polish.

- Added static-render coverage for the selected-workspace/no-session composer state.
- Added an explicit empty-state data slot inside the Soul-owned universal workbench.
- Changed the new-session composer to `w-full max-w-3xl` while keeping active-session follow-up composer behavior unchanged.
- Kept Host Web, mounted container routing and Worker Configuration untouched.

Verification:

- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`
```

In `docs/plan/PLAN-418.md`, change:

```markdown
- **status**: approved
```

to:

```markdown
- **status**: completed
```

In `docs/task/index.md`, change the BUG-161 marker from `[-]` to `[x]`.

In `docs/plan/index.md`, change the PLAN-418 marker from `[-]` to `[x]`.

- [ ] **Step 4: Commit closeout docs**

Run:

```bash
git add docs/task/BUG-161.md docs/task/index.md docs/plan/PLAN-418.md docs/plan/index.md
git commit -m "docs: 收口通用 workbench composer 布局修复"
```

Expected: commit succeeds with only PMA closeout docs.

## Self-Review

- Spec coverage: Task 2 covers the selected-workspace/no-session test requirement; Task 3 implements centered vertical empty state and `w-full max-w-3xl`; Task 4 covers focused test, UI governance, boundary audit and code-review-graph.
- Boundary check: no task touches `apps/web`, Host mounted container code, Worker Configuration, manifest/protocol routing, `SessionChatView`, `SessionDetail` or shared composer APIs.
- Type consistency: all referenced files and test names match the current repository; `classForSlot` already exists in `UniversalWorkbenchApp.test.tsx`.
- Placeholder scan: the plan contains no unresolved placeholders or deferred implementation steps.
