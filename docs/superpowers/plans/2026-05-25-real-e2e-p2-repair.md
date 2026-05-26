# Real E2E P2 Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix the four P2 regressions recorded by the 2026-05-24 real E2E regression: HR hydration mismatch, narrow universal workbench usability, Worker Configuration narrow editor clipping, and stale running chips on terminal succeeded turns.

**Architecture:** Keep repairs at their owning boundaries. HR hydration stays in the HR app-owned mounted route, universal workbench layout and transcript status stay in the Soul-owned mounted workbench package, and Worker Configuration layout stays in Host-owned worker-scoped chrome. Host remains start / shell / locate / mount / bridge and does not interpret Soul App domain state.

**Tech Stack:** Bun workspaces, TypeScript, React 19, Bun test, Vitest/Testing Library, shadcn primitives from `@zonease/aiworker-ui`, Hugeicons, `@micro-zoe/micro-app`, AIWorker Host/Soul local daemon and mounted micro-app surfaces.

---

## Scope Source

- Approved design: `docs/superpowers/specs/2026-05-25-real-e2e-p2-repair-design.md`
- PMA task: `docs/task/BUG-156.md`
- PMA plan: `docs/plan/PLAN-413.md`
- Evidence ledger: `tmp/real-e2e-regression-2026-05-24/findings.md`
- Normative architecture: `docs/architecture.md#constraint-registry`
- Host skill: `.agents/skills/aiworker-host-dev/SKILL.md`
- Soul App skill: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

## Closeout Evidence

- Focused HR, universal workbench, and Web tests passed.
- `bun run ui:check`, Host/Soul boundary audit, and `git diff --check` passed.
- Official HR/QA mounted client bundles were rebuilt before browser verification.
- Playwright regression passed at desktop and 390px with evidence in `tmp/real-e2e-p2-repair-2026-05-25/`.
- `code-review-graph` was run for both the current uncommitted docs diff and the full code batch from `a33de4ac`.

## Scope Check

The spec covers four P2 findings, but they are related by the same real E2E regression and can be delivered as one repair batch. Each task below is independently testable and should pass its focused package gate before moving to the next task.

## Component Library Preflight

Visible UI changes must continue using existing shared primitives:

- `@zonease/aiworker-ui/components/dialog`
- `@zonease/aiworker-ui/components/sidebar`
- `@zonease/aiworker-ui/components/item`
- `@zonease/aiworker-ui/components/badge`
- `@zonease/aiworker-ui/components/button`
- `@zonease/aiworker-ui/components/switch`
- `@zonease/aiworker-ui/components/scroll-area`
- `@zonease/aiworker-ui/components/textarea`
- `@zonease/aiworker-ui/components/session-composer`
- `@zonease/aiworker-ui/components/card`
- `@zonease/aiworker-ui/components/empty`
- `@zonease/aiworker-ui/components/collapsible`

Do not add `lucide-react`, raw hex colors, arbitrary color values, new app-local primitives, focus traps, scroll locks, Host-owned domain panels, or Host-side universal workbench route special cases.

## File Structure

- Modify `docs/task/index.md`
  - Claim and complete `BUG-156`.
- Modify `docs/task/BUG-156.md`
  - Track status, owner, verification, and completion notes.
- Modify `docs/plan/index.md`
  - Move `PLAN-413` through pending, implementing, and completed.
- Modify `docs/plan/PLAN-413.md`
  - Track implementation status, verification results, and completion notes.
- Modify `apps/aiworker-hr/product/web/component-proof.test.tsx`
  - Adds a regression test for a single stable HR profile board description string.
- Modify `apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx`
  - Formats the profile board description as one deterministic text child before render.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
  - Adds narrow layout structure coverage and terminal succeeded turn stale-running coverage.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
  - Stacks sidebar, main, and detail surfaces on narrow screens.
- Modify `packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx`
  - Keeps the detail rail full-width and non-squeezing on narrow screens.
- Modify `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts`
  - Removes stale running status/activity events for terminal turns.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Adds Worker Configuration narrow layout class coverage.
- Modify `apps/web/src/worker/worker-configuration-dialog.tsx`
  - Stacks asset list and editor panel on narrow screens.
- Modify `docs/changelog.md`
  - Records the completed P2 repair batch after verification.

## Task 1: Claim PMA Tracking

**Files:**
- Modify: `docs/task/index.md`
- Modify: `docs/task/BUG-156.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/plan/PLAN-413.md`

- [x] **Step 1: Verify the PMA records exist and are still pending**

Run:

```bash
rg -n "BUG-156|PLAN-413" docs/task/index.md docs/task/BUG-156.md docs/plan/index.md docs/plan/PLAN-413.md
```

Expected: output includes `BUG-156` in task files and `PLAN-413` in plan files, with task index marker `[ ]` and plan index marker `[ ]`.

- [x] **Step 2: Claim `BUG-156` in the task detail**

Edit the header of `docs/task/BUG-156.md` to:

```md
# BUG-156 Real E2E P2 regression repair batch

- **status**: in_progress
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-25
- **claimedAt**: 2026-05-25
- **plan**: PLAN-413
- **relatesTo**: UI-001, MOUNT-001, PROTO-001, CONFIG-001, SOUL-001
```

- [x] **Step 3: Mark task and plan indexes as active**

In `docs/task/index.md`, change the `BUG-156` line to:

```md
- [-] [**BUG-156 Real E2E P2 regression repair batch**](BUG-156.md) `P2`
```

In `docs/plan/index.md`, change the `PLAN-413` line to:

```md
- [-] [**PLAN-413 Real E2E P2 regression repair batch**](PLAN-413.md) `2026-05-25`
```

- [x] **Step 4: Mark `PLAN-413` as implementing**

Edit the header of `docs/plan/PLAN-413.md` to:

```md
# PLAN-413 Real E2E P2 regression repair batch

- **status**: implementing
- **createdAt**: 2026-05-25
- **approvedAt**: 2026-05-25
- **relatedTask**: BUG-156
- **superpowersPlan**: docs/superpowers/plans/2026-05-25-real-e2e-p2-repair.md
```

- [x] **Step 5: Verify tracking state**

Run:

```bash
sed -n '520,550p' docs/task/index.md
tail -10 docs/plan/index.md
sed -n '1,12p' docs/task/BUG-156.md
sed -n '1,12p' docs/plan/PLAN-413.md
```

Expected: `BUG-156` and `PLAN-413` are marked `[-]`, with `owner: codex`, `status: in_progress`, and `status: implementing`.

## Task 2: Fix HR Hydration Mismatch

**Files:**
- Modify: `apps/aiworker-hr/product/web/component-proof.test.tsx`
- Modify: `apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx`

- [x] **Step 1: Add the failing regression test**

In `apps/aiworker-hr/product/web/component-proof.test.tsx`, update the import block to include the formatter:

```ts
import { formatProfileBoardDescription } from './people-workbench/columns/profile-list-column'
```

Append this test inside `describe('HR product web shared component proof', () => { ... })`:

```ts
  it('formats the profile board description as a single hydration-stable text child', () => {
    const html = renderToStaticMarkup(<HrHomeRouteSurface />)

    expect(formatProfileBoardDescription({
      ...getProfileBoardDescriptionLabels(),
    }, 2)).toBe('People Profiles · 2 visible profiles')
    expect(html).toContain('People Profiles · 2 visible profiles')
    expect(readFileSync(new URL('./people-workbench/columns/profile-list-column.tsx', import.meta.url), 'utf8'))
      .toContain('const profileBoardDescription = formatProfileBoardDescription(labels, profiles.length)')
  })
```

Also append this helper after the `describe` block:

```ts
function getProfileBoardDescriptionLabels() {
  return {
    profileBoardDetail: (count: number) => `${count} visible profiles`,
    profileBoardTitle: 'People Profiles',
  }
}
```

- [x] **Step 2: Run the focused HR test and verify it fails**

Run:

```bash
bun test apps/aiworker-hr/product/web/component-proof.test.tsx
```

Expected: FAIL because `formatProfileBoardDescription` is not exported yet or the source does not contain the stable formatter call.

- [x] **Step 3: Implement the formatter and single text child**

In `apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx`, insert this exported helper after the props interface:

```ts
export function formatProfileBoardDescription(
  labels: Pick<HrWorkbenchCopy, 'profileBoardDetail' | 'profileBoardTitle'>,
  visibleProfileCount: number,
): string {
  return `${labels.profileBoardTitle} · ${labels.profileBoardDetail(visibleProfileCount)}`
}
```

Inside `ProfileListColumn`, add this constant after `showProfileFilter`:

```ts
  const profileBoardDescription = formatProfileBoardDescription(labels, profiles.length)
```

Replace the current multi-child `CardDescription` body with:

```tsx
            <CardDescription>{profileBoardDescription}</CardDescription>
```

- [x] **Step 4: Run the focused HR test and verify it passes**

Run:

```bash
bun test apps/aiworker-hr/product/web/component-proof.test.tsx
```

Expected: PASS.

- [x] **Step 5: Run the HR package test gate**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
```

Expected: PASS.

- [x] **Step 6: Commit the HR hydration fix**

Run:

```bash
git add apps/aiworker-hr/product/web/component-proof.test.tsx apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx
git commit -m "fix: 修复 HR mounted hydration 文案漂移"
```

Expected: commit succeeds.

## Task 3: Fix Universal Workbench Narrow Layout

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx`

- [x] **Step 1: Add the failing narrow layout test**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`, append this test inside `describe('UniversalWorkbenchApp', () => { ... })`:

```ts
  it('renders a narrow-safe workbench structure that stacks locator, main and detail surfaces', () => {
    const workspace = workspaceFixture()
    const session: LocalSession = {
      capabilityTemplateId: 'aiworker-hr.person-profile',
      context: '',
      createdAt: '2026-05-24T14:00:00.000Z',
      endedAt: null,
      id: 'session-completed',
      metadataJson: {},
      startedAt: '2026-05-24T14:00:00.000Z',
      status: 'active',
      title: 'Completed Claude session',
      updatedAt: '2026-05-24T14:10:00.000Z',
      workerId: 'worker-1',
      workspaceId: workspace.id,
    }

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Claude Code is ready for session turns.', label: 'Claude Code', ready: true }}
        events={[]}
        selectedSessionId={session.id}
        sessions={[session]}
        templates={[{ id: 'aiworker-hr.person-profile', name: 'Person Profile' }]}
        turnInput=""
        turnSubmitting={false}
        turns={[]}
        workspace={workspace}
        workspaces={[workspace]}
        onBackToWorkspace={vi.fn()}
        onCreateSession={vi.fn(async () => {})}
        onCreateWorkspace={vi.fn()}
        onRefresh={vi.fn()}
        onSelectSession={vi.fn()}
        onSubmitTurn={vi.fn()}
        onTurnInputChange={vi.fn()}
      />,
    )

    expect(html).toContain('data-slot="universal-workbench"')
    expect(html).toContain('max-md:flex-col')
    expect(html).toContain('data-slot="workbench-sidebar"')
    expect(html).toContain('max-md:w-full')
    expect(html).toContain('data-slot="workbench-main"')
    expect(html).toContain('data-slot="artifact-rail"')
    expect(html).toContain('max-md:flex-none')
  })
```

- [x] **Step 2: Run the focused workbench test and verify it fails**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx
```

Expected: FAIL because the root workbench structure does not yet include `max-md:flex-col` and the sidebar does not expose the narrow stacking classes.

- [x] **Step 3: Make the workbench root stack on narrow screens**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`, replace the root element class with:

```tsx
    <div className="flex h-full min-h-0 min-w-0 max-md:flex-col" data-slot="universal-workbench">
```

Replace the expanded sidebar class with:

```tsx
        <aside className="w-56 min-w-0 flex-shrink-0 overflow-y-auto border-r p-3 max-md:max-h-52 max-md:w-full max-md:flex-none max-md:border-r-0 max-md:border-b" data-slot="workbench-sidebar">
```

Replace the main class with:

```tsx
      <main className="flex min-h-0 min-w-0 flex-1 flex-col max-md:w-full" data-slot="workbench-main">
```

- [x] **Step 4: Keep the detail rail from squeezing main content on narrow screens**

In `packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx`, replace the expanded rail class with:

```tsx
      className="relative flex min-h-0 w-80 min-w-0 flex-none flex-col gap-3 overflow-y-auto p-3 transition-all max-md:max-h-64 max-md:w-full max-md:flex-none"
```

- [x] **Step 5: Run the focused workbench test and verify it passes**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit the narrow workbench layout fix**

Run:

```bash
git add packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx
git commit -m "fix: 修复 universal workbench 窄屏布局"
```

Expected: commit succeeds.

## Task 4: Suppress Stale Running Events For Terminal Turns

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts`

- [x] **Step 1: Add the failing terminal succeeded turn test**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`, append this test inside `describe('UniversalWorkbenchApp', () => { ... })`:

```ts
  it('removes stale running activity chips from terminal succeeded turns', () => {
    const events = normalizeSessionEvents([
      sessionEvent({
        id: 501,
        payloadJson: {
          agentEvent: {
            id: 'tool-1',
            input: { command: 'echo done' },
            kind: 'tool_use',
            name: 'Bash',
          },
        },
        seq: 1,
        type: 'tool',
        turnId: 'turn-succeeded',
      }),
      sessionEvent({
        id: 502,
        payloadJson: { agentEvent: { kind: 'status', label: 'running', status: 'running' } },
        seq: 2,
        type: 'status',
        turnId: 'turn-succeeded',
      }),
      sessionEvent({
        id: 503,
        payloadJson: { status: 'succeeded', turnId: 'turn-succeeded' },
        seq: 3,
        type: 'status',
        turnId: 'turn-succeeded',
      }),
    ], { parser: 'codex-cli' })

    const viewModel = createSessionTimelineViewModel({
      events,
      turns: [terminalTurn({ id: 'turn-succeeded', status: 'succeeded' })],
    })

    expect(viewModel.turns[0]?.events).toEqual([
      expect.objectContaining({ kind: 'signal', signalKind: 'status', status: 'succeeded' }),
    ])
  })
```

- [x] **Step 2: Run the focused workbench test and verify it fails**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx
```

Expected: FAIL because the view model still includes a running activity event from the terminal succeeded turn.

- [x] **Step 3: Filter stale running activity and activity groups for terminal turns**

In `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts`, replace `suppressStaleTerminalStatus` with:

```ts
function suppressStaleTerminalStatus(
  events: SessionTimelineEvent[],
  turn: SessionTimelineTurnInput,
): SessionTimelineEvent[] {
  if (turn.status === 'running')
    return events
  return events.filter((event) => {
    if (event.kind === 'signal' && event.signalKind === 'status')
      return event.status === 'failed' || event.status === 'succeeded'
    if (event.kind === 'activity')
      return event.status === 'failed' || event.status === 'succeeded'
    if (event.kind === 'activity_group')
      return event.status === 'failed' || event.status === 'succeeded'
    return true
  })
}
```

- [x] **Step 4: Run the focused workbench test and verify it passes**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx
```

Expected: PASS.

- [x] **Step 5: Run the workbench package gate**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
```

Expected: PASS.

- [x] **Step 6: Commit the terminal turn timeline fix**

Run:

```bash
git add packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts
git commit -m "fix: 清理 terminal turn 的历史 running 状态"
```

Expected: commit succeeds.

## Task 5: Fix Worker Configuration Narrow Editor Layout

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify: `apps/web/src/worker/worker-configuration-dialog.tsx`

- [x] **Step 1: Add the failing Worker Configuration layout test**

In `apps/web/src/worker/__tests__/worker-studio.test.tsx`, inside the existing `opens Worker configuration from the worker row without opening Host settings` test after the dialog assertion, add:

```ts
    const workerConfigBody = screen.getByTestId('worker-configuration-body')
    expect(workerConfigBody.className).toContain('max-md:flex-col')
    expect(screen.getByTestId('worker-overlay-sidebar').className).toContain('max-md:w-full')
    expect(screen.getByTestId('worker-overlay-editor-panel').className).toContain('max-md:w-full')
```

- [x] **Step 2: Run the focused Web test and verify it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL because the new test ids and narrow classes are not present.

- [x] **Step 3: Add narrow-safe structure to the dialog body**

In `apps/web/src/worker/worker-configuration-dialog.tsx`, replace:

```tsx
        <div className="flex flex-1 min-h-0">
          <div className="flex w-80 shrink-0 flex-col min-h-0 bg-sidebar text-sidebar-foreground">
```

with:

```tsx
        <div data-testid="worker-configuration-body" className="flex min-h-0 flex-1 max-md:flex-col">
          <div data-testid="worker-overlay-sidebar" className="flex min-h-0 w-80 shrink-0 flex-col bg-sidebar text-sidebar-foreground max-md:max-h-64 max-md:w-full max-md:flex-none">
```

Replace:

```tsx
          <div className="flex-1 min-w-0">
```

with:

```tsx
          <div data-testid="worker-overlay-editor-panel" className="min-w-0 flex-1 max-md:w-full">
```

- [x] **Step 4: Run the focused Web test and verify it passes**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS.

- [x] **Step 5: Run the Web package gate**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test
```

Expected: PASS.

- [x] **Step 6: Commit the Worker Configuration layout fix**

Run:

```bash
git add apps/web/src/worker/__tests__/worker-studio.test.tsx apps/web/src/worker/worker-configuration-dialog.tsx
git commit -m "fix: 修复 Worker Configuration 窄屏编辑器布局"
```

Expected: commit succeeds.

## Task 6: Run UI, Boundary, Browser, And Closeout Gates

**Files:**
- Modify: `docs/task/BUG-156.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-413.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Run focused package gates**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-web' test
```

Expected: all commands PASS.

- [x] **Step 2: Run UI governance and Host/Soul boundary checks**

Run:

```bash
bun run ui:check
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

Expected: both commands PASS. If `ui:check` reports unrelated historical debt, do not edit unrelated files; capture the exact output in `PLAN-413` and ask for scope approval before expanding.

- [x] **Step 3: Start the local dev stack in tmux**

Run:

```bash
tmux new-session -d -s aiworker-p2-repair 'cd /Users/ben/projects/aiworker && bun run dev'
sleep 8
tmux capture-pane -pt aiworker-p2-repair:0.0 -S -120
```

Expected: daemon/API and Worker Web are available, normally on `9217` and `5173`. If ports differ, capture the actual URLs from the tmux pane.

- [x] **Step 4: Browser regression**

Open Worker Web in the in-app browser or Playwright at the active Web URL and capture evidence under a new directory:

```bash
mkdir -p tmp/real-e2e-p2-repair-2026-05-25/browser tmp/real-e2e-p2-repair-2026-05-25/screenshots
```

Required checks:

- Desktop HR mounted route console has no hydration mismatch.
- 390px HR mounted route main area is usable.
- 390px QA mounted universal workbench main area is usable.
- 390px selected completed session chat/timeline/composer are usable.
- Completed Claude Code turn does not show `Session running` or a `running` chip for terminal succeeded history.
- 390px Worker Configuration selected overlay editor is visible at full usable width.

Expected: no recurrence of the four P2 findings. Save screenshots, console summaries, and layout summaries in `tmp/real-e2e-p2-repair-2026-05-25/`.

- [x] **Step 5: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: both commands complete. Address any review finding that is inside this batch's scope; record out-of-scope findings without expanding.

- [x] **Step 6: Update changelog**

Prepend this entry to `docs/changelog.md`:

```md
## 2026-05-25 [fixed] Real E2E P2 repair batch

Closed the four P2 findings from `tmp/real-e2e-regression-2026-05-24/`: HR
mounted hydration text drift, narrow universal workbench squeezing, Worker
Configuration narrow overlay-editor clipping, and stale running chips on
terminal succeeded turns. The fixes stay within the owning boundaries:
HR app-owned UI, Soul-owned universal workbench, and Host-owned
worker-scoped configuration chrome.

Verification: focused HR, soul-app-workbench and Web tests; UI governance;
Host/Soul boundary audit; desktop and 390px browser regression; code-review-graph.
```

- [x] **Step 7: Mark PMA records complete**

In `docs/task/BUG-156.md`, replace the header with:

```md
# BUG-156 Real E2E P2 regression repair batch

- **status**: completed
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-25
- **claimedAt**: 2026-05-25
- **completedAt**: 2026-05-25
- **plan**: PLAN-413
- **relatesTo**: UI-001, MOUNT-001, PROTO-001, CONFIG-001, SOUL-001
```

Append:

```md
## Completion

The four P2 findings from the real E2E regression are fixed within their owning
boundaries. HR mounted first load no longer hydrates over split profile-board
text, universal workbench stacks instead of squeezing on narrow viewports,
terminal succeeded turns no longer show stale running chips, and Worker
Configuration shows the selected overlay editor at a usable narrow width.
```

In `docs/plan/PLAN-413.md`, replace the header with:

```md
# PLAN-413 Real E2E P2 regression repair batch

- **status**: completed
- **createdAt**: 2026-05-25
- **approvedAt**: 2026-05-25
- **completedAt**: 2026-05-25
- **relatedTask**: BUG-156
- **superpowersPlan**: docs/superpowers/plans/2026-05-25-real-e2e-p2-repair.md
```

Append a `## Verification Result` section with the exact commands and browser evidence paths from this run.

Change the index lines to:

```md
- [x] [**BUG-156 Real E2E P2 regression repair batch**](BUG-156.md) `P2`
- [x] [**PLAN-413 Real E2E P2 regression repair batch**](PLAN-413.md) `2026-05-25`
```

- [x] **Step 8: Commit closeout docs**

Run:

```bash
git add docs/task/BUG-156.md docs/task/index.md docs/plan/PLAN-413.md docs/plan/index.md docs/changelog.md
git commit -m "docs: 记录真实 E2E P2 修复收口"
```

Expected: commit succeeds.

## Final Verification Matrix

Run these before claiming completion:

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-web' test
bun run ui:check
bun scripts/check-soul-app-boundaries.ts --completion-audit
bun run crg:update
bun run crg:review
git diff --check
```

Expected: all commands pass, or any blocked command has exact output and a clear reason recorded in `docs/plan/PLAN-413.md`.
