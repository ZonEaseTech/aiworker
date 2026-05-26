# Universal Workbench Sidebar Truncation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the universal workbench sidebar fixed-width on desktop and truncate long workspace/session labels without changing Host shell or shared `Item` primitive behavior.

**Architecture:** The fix stays inside the Soul-owned universal workbench package. `UniversalWorkbenchApp` owns the sidebar width constraints, while `WorkspaceSessionTree` owns tree-item shrink/truncation and complete label hints. No Host Web shell, Worker Configuration, mounted container, protocol, or `packages/ui` primitive changes are part of this plan.

**Tech Stack:** React 19, Bun test, Tailwind CSS v4 utility classes, `@zonease/aiworker-ui` shadcn primitives, code-review-graph.

---

## File Structure

- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
  - Add a long workspace/session label regression test.
  - Add a helper that returns all class strings for a given rendered `data-slot`.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
  - Tighten desktop sidebar width with `basis-56` and `max-w-56`.
  - Preserve mobile `max-md:w-full` behavior by clearing desktop max/basis constraints at mobile width.
- Modify `packages/soul-app-workbench/src/universal-workbench/WorkspaceSessionTree.tsx`
  - Add fixed-container-safe `w-full min-w-0 overflow-hidden` classes through tree items.
  - Add `title` attributes for complete workspace/session labels and session detail.
  - Keep existing selection and create-session callbacks unchanged.

## Task 1: Add Failing Long-Label Regression Test

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`

- [ ] **Step 1: Add the regression test**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`, add this test inside `describe('UniversalWorkbenchApp', () => { ... })`, immediately after `server-renders selected sessions with narrow-safe workbench structure`:

```tsx
  it('keeps long workspace and session names inside the fixed sidebar', () => {
    const longWorkspaceName = 'Workspace-' + 'Alpha'.repeat(24)
    const longSessionLabel = 'aiworker-qa.' + 'evidence-review-'.repeat(16)
    const workspace = {
      ...workspaceFixture(),
      name: longWorkspaceName,
    }
    const session: LocalSession = {
      capabilityTemplateId: longSessionLabel,
      context: '',
      createdAt: '2026-05-26T00:00:00.000Z',
      endedAt: null,
      id: 'session-long-label',
      metadataJson: {},
      startedAt: '2026-05-26T00:00:00.000Z',
      status: 'active',
      title: 'Review the release evidence',
      updatedAt: '2026-05-26T00:00:00.000Z',
      workerId: 'worker-1',
      workspaceId: workspace.id,
    }

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Engine bridge ready', label: 'Engine bridge', ready: true }}
        events={[]}
        selectedSessionId={null}
        sessions={[session]}
        templates={[{ id: longSessionLabel, name: 'Evidence Review' }]}
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

    const sidebarClass = classForSlot(html, 'workbench-sidebar')
    expect(sidebarClass).toContain('w-56')
    expect(sidebarClass).toContain('basis-56')
    expect(sidebarClass).toContain('max-w-56')
    expect(sidebarClass).toContain('max-md:w-full')
    expect(sidebarClass).toContain('max-md:max-w-none')
    expect(sidebarClass).toContain('max-md:basis-auto')
    expect(html).toContain(`title="${longWorkspaceName}"`)
    expect(html).toContain(`title="${longSessionLabel}"`)

    const itemTitleClasses = classesForSlot(html, 'item-title')
    expect(itemTitleClasses.length).toBeGreaterThanOrEqual(2)
    expect(itemTitleClasses.every(classes => classes.includes('w-full'))).toBe(true)
    expect(itemTitleClasses.every(classes => classes.includes('min-w-0'))).toBe(true)
    expect(itemTitleClasses.every(classes => classes.includes('truncate'))).toBe(true)
  })
```

- [ ] **Step 2: Add the multi-match helper**

Near the existing `classForSlot` helper at the bottom of the same file, replace the helper block with:

```tsx
function classForSlot(html: string, slot: string): string {
  const match = classesForSlot(html, slot)[0]
  expect(match).toBeDefined()
  return match ?? ''
}

function classesForSlot(html: string, slot: string): string[] {
  return Array.from(html.matchAll(new RegExp(`<[^>]*class="([^"]*)"[^>]*data-slot="${slot}"`, 'g')))
    .map(match => match[1] ?? '')
}
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx --test-name-pattern "keeps long workspace"
```

Expected: the test fails because `workbench-sidebar` does not include `basis-56`, `max-w-56`, `max-md:max-w-none`, or `max-md:basis-auto`, and the tree labels do not yet have the full shrink/truncate class chain.

## Task 2: Implement Sidebar Width And Tree Truncation

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/WorkspaceSessionTree.tsx`

- [ ] **Step 1: Tighten the sidebar width constraints**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`, replace the `workbench-sidebar` `<aside>` class with:

```tsx
<aside className="w-56 max-w-56 min-w-0 basis-56 flex-shrink-0 overflow-y-auto border-r p-3 max-md:max-h-52 max-md:w-full max-md:max-w-none max-md:basis-auto max-md:flex-none max-md:border-r-0 max-md:border-b" data-slot="workbench-sidebar">
```

- [ ] **Step 2: Update workspace tree item classes and title hints**

In `packages/soul-app-workbench/src/universal-workbench/WorkspaceSessionTree.tsx`, replace the workspace `Item` block with:

```tsx
          <Item
            asChild
            variant="muted"
            size="xs"
            className="w-full min-w-0 cursor-pointer overflow-hidden text-left"
            data-selected={selectedNodeId === ws.id ? 'true' : undefined}
            title={ws.label}
            onClick={() => onSelectNode({ id: ws.id, kind: 'workspace', label: ws.label, workspaceId: ws.id })}
          >
            <button type="button">
              <ItemContent className="w-full min-w-0 overflow-hidden">
                <ItemTitle className="w-full min-w-0 max-w-full truncate text-xs font-semibold uppercase tracking-wide">{ws.label}</ItemTitle>
              </ItemContent>
            </button>
          </Item>
```

- [ ] **Step 3: Update session item classes and title hints**

In the same file, replace the session `Item` block inside `ws.sessions.map(...)` with:

```tsx
            <Item
              key={session.id}
              asChild
              variant="default"
              size="xs"
              className="w-full min-w-0 cursor-pointer overflow-hidden pl-4 text-left"
              data-selected={selectedNodeId === session.id ? 'true' : undefined}
              title={session.label}
              onClick={() => onSelectNode(session)}
            >
              <button type="button">
                <ItemContent className="w-full min-w-0 gap-0.5 overflow-hidden">
                  <ItemTitle className="w-full min-w-0 max-w-full truncate text-sm">{session.label}</ItemTitle>
                  {session.detail
                    ? <ItemDescription className="w-full min-w-0 max-w-full truncate text-xs" title={session.detail}>{session.detail}</ItemDescription>
                    : null}
                </ItemContent>
              </button>
            </Item>
```

- [ ] **Step 4: Update the New Session row shrink behavior**

In the same file, replace the `New Session` `Item` block with:

```tsx
          <Item
            asChild
            variant="muted"
            size="xs"
            className="w-full min-w-0 cursor-pointer overflow-hidden pl-4 text-left"
            onClick={onCreateSession}
          >
            <button type="button">
              <ItemContent className="w-full min-w-0 overflow-hidden">
                <ItemDescription className="flex w-full min-w-0 max-w-full items-center gap-1 text-xs">
                  <HugeiconsIcon className="shrink-0" icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
                  <span className="min-w-0 truncate">New Session</span>
                </ItemDescription>
              </ItemContent>
            </button>
          </Item>
```

- [ ] **Step 5: Run the focused regression test and verify it passes**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx --test-name-pattern "keeps long workspace"
```

Expected: PASS for `keeps long workspace and session names inside the fixed sidebar`.

## Task 3: Run Focused Verification And Commit

**Files:**
- Verify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- Verify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
- Verify: `packages/soul-app-workbench/src/universal-workbench/WorkspaceSessionTree.tsx`

- [ ] **Step 1: Run the full soul-app-workbench package tests**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
```

Expected: all package tests pass.

- [ ] **Step 2: Run the package typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck
```

Expected: TypeScript exits with code 0.

- [ ] **Step 3: Run UI governance**

Run:

```bash
bun run ui:check
```

Expected: UI governance passes with no new app-local visual-token or component-usage violations.

- [ ] **Step 4: Check whitespace and patch health**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Run code-review-graph review**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: code-review-graph completes. Review any findings before committing; if it reports a real issue, fix it and rerun the relevant focused tests plus `bun run crg:review`.

- [ ] **Step 6: Commit the implementation**

Run:

```bash
git status --short
git add packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx packages/soul-app-workbench/src/universal-workbench/WorkspaceSessionTree.tsx
git commit -m "fix: 限制 universal workbench 侧栏宽度"
```

Expected: commit succeeds and includes only the focused test and universal workbench component changes.

## Self-Review Notes

- Spec coverage: desktop fixed width is covered by Task 2 Step 1; text truncation and complete labels are covered by Task 2 Steps 2-4; focused tests and UI/code-review verification are covered by Tasks 1 and 3.
- Scope check: the plan changes only `packages/soul-app-workbench/src/universal-workbench` files and does not modify Host Web, Worker Configuration, mounted container, protocol, or `packages/ui`.
- Type consistency: the plan uses existing `LocalSession`, `workspaceFixture`, `UniversalWorkbenchApp`, `classForSlot`, and `WorkspaceSessionTreeNode` shapes already present in the test/component files.
