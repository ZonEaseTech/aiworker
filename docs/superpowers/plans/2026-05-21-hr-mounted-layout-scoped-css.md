# HR Mounted Layout Scoped CSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restore the HR mounted micro-app three-column reading-room layout without moving HR layout ownership into Host Web.

**Architecture:** Replace the fragile Tailwind arbitrary `xl:grid-cols-[...]` layout contract with HR-owned semantic CSS keyed by `hr-reading-room-grid` and existing panel-state data attributes. Host Web keeps rendering a generic `<micro-app>` container and the smoke test measures computed layout after micro-app scoped CSS runs.

**Tech Stack:** React 19, Bun test, Tailwind CSS v4, `@micro-zoe/micro-app`, Playwright smoke script through `apps/web/scripts/smoke-mounted-surfaces.ts`.

---

## File Structure

- Modify `apps/aiworker-hr/product/web/people-workbench/app.tsx`
  - Owns the HR reading-room React surface and panel-state data attributes.
  - Removes Tailwind arbitrary grid column classes from the mounted layout.
- Modify `apps/aiworker-hr/product/web/styles.css`
  - Owns HR-specific layout CSS that survives micro-app scoped CSS rewriting.
- Modify `apps/aiworker-hr/product/web/component-proof.test.tsx`
  - Keeps static proof coverage but stops treating an arbitrary Tailwind class as the layout contract.
- Modify `apps/aiworker-hr/host-adapter/index.test.ts`
  - Confirms mounted HTML exposes the stable HR layout hook and no longer depends on arbitrary grid classes.
- Modify `apps/web/scripts/smoke-mounted-surfaces.ts`
  - Adds computed-layout verification after the HR route is mounted through Host Web and micro-app scoped CSS has run.

## Task 1: Update Static HR Layout Contract Tests

**Files:**
- Modify: `apps/aiworker-hr/product/web/component-proof.test.tsx`
- Modify: `apps/aiworker-hr/host-adapter/index.test.ts`

- [x] **Step 1: Update the component proof assertion**

In `apps/aiworker-hr/product/web/component-proof.test.tsx`, replace the old arbitrary class assertion:

```ts
expect(html).toContain('xl:grid-cols-[minmax(12rem,0.55fr)_minmax(0,1.85fr)_minmax(15rem,0.72fr)]')
```

with:

```ts
expect(html).toContain('hr-reading-room-grid')
expect(html).toContain('data-left-panel="open"')
expect(html).toContain('data-right-panel="open"')
expect(html).not.toContain('xl:grid-cols-[minmax(12rem,0.55fr)_minmax(0,1.85fr)_minmax(15rem,0.72fr)]')
```

- [x] **Step 2: Update the mounted service assertion**

In `apps/aiworker-hr/host-adapter/index.test.ts`, replace the old arbitrary class assertion:

```ts
expect(routeMicroAppHtml).toContain('xl:grid-cols-[minmax(12rem,0.55fr)_minmax(0,1.85fr)_minmax(15rem,0.72fr)]')
```

with:

```ts
expect(routeMicroAppHtml).toContain('hr-reading-room-grid')
expect(routeMicroAppHtml).toContain('data-left-panel="open"')
expect(routeMicroAppHtml).toContain('data-right-panel="open"')
expect(routeMicroAppHtml).not.toContain('xl:grid-cols-[minmax(12rem,0.55fr)_minmax(0,1.85fr)_minmax(15rem,0.72fr)]')
```

- [x] **Step 3: Run focused HR tests and confirm failure**

Run:

```bash
bun test apps/aiworker-hr/product/web/component-proof.test.tsx apps/aiworker-hr/host-adapter/index.test.ts
```

Expected: FAIL because `hr-reading-room-grid` is not yet emitted and the old arbitrary class is still present.

## Task 2: Implement HR-Owned Scoped-Safe Layout CSS

**Files:**
- Modify: `apps/aiworker-hr/product/web/people-workbench/app.tsx`
- Modify: `apps/aiworker-hr/product/web/styles.css`

- [x] **Step 1: Replace the HR reading-room class list**

In `apps/aiworker-hr/product/web/people-workbench/app.tsx`, update the `section` class list to remove arbitrary grid column classes and add the stable HR hook:

```tsx
className={cn(
  'hr-reading-room-grid grid h-full max-h-full min-h-0 gap-0 overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-foreground/10',
)}
```

Do not remove these attributes:

```tsx
data-layout="reading-room-primary"
data-left-panel={leftPanelOpen ? 'open' : 'closed'}
data-right-panel={rightPanelOpen ? 'open' : 'closed'}
```

Do not keep `grid-cols-1` on this element. The final browser check showed
Tailwind utility layer ordering can override the HR component-layer grid rule.

- [x] **Step 2: Add ordinary HR layout selectors**

Append this block to `apps/aiworker-hr/product/web/styles.css` after the existing `@source` declarations:

```css
@layer components {
  .hr-reading-room-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 80rem) {
    .hr-reading-room-grid[data-left-panel="open"][data-right-panel="open"] {
      grid-template-columns:
        minmax(12rem, 0.55fr)
        minmax(0, 1.85fr)
        minmax(15rem, 0.72fr);
    }

    .hr-reading-room-grid[data-left-panel="open"][data-right-panel="closed"] {
      grid-template-columns: minmax(12rem, 0.55fr) minmax(0, 1.85fr);
    }

    .hr-reading-room-grid[data-left-panel="closed"][data-right-panel="open"] {
      grid-template-columns: minmax(0, 1.85fr) minmax(15rem, 0.72fr);
    }

    .hr-reading-room-grid[data-left-panel="closed"][data-right-panel="closed"] {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
```

- [x] **Step 3: Rebuild HR styles**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' build:styles
```

Expected: PASS and `apps/aiworker-hr/dist/web/styles.css` contains scoped-safe ordinary `hr-reading-room-grid` rules after build.

- [x] **Step 4: Run focused HR tests**

Run:

```bash
bun test apps/aiworker-hr/product/web/component-proof.test.tsx apps/aiworker-hr/host-adapter/index.test.ts
```

Expected: PASS.

## Task 3: Add Mounted Computed-Layout Smoke Coverage

**Files:**
- Modify: `apps/web/scripts/smoke-mounted-surfaces.ts`

- [x] **Step 1: Add the desktop layout assertion after HR route content loads**

In `apps/web/scripts/smoke-mounted-surfaces.ts`, after:

```ts
await page.getByText('Confirmed Facts').waitFor({ timeout: 10_000 })
```

add:

```ts
await assertHrMountedReadingRoomLayout(page, 'desktop')
```

- [x] **Step 2: Add a narrow viewport assertion before settings checks**

After the desktop assertion, add:

```ts
await page.setViewportSize({ height: 900, width: 760 })
await assertHrMountedReadingRoomLayout(page, 'narrow')
await page.setViewportSize({ height: 900, width: 1280 })
```

This keeps the rest of the existing settings flow at the original desktop width.

- [x] **Step 3: Add the computed-layout helper**

Add this helper near the other assertion helpers:

```ts
async function assertHrMountedReadingRoomLayout(page: Page, mode: 'desktop' | 'narrow'): Promise<void> {
  const state = await page.locator('[data-slot="hr-route-surface"]').evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      childCount: element.children.length,
      columns: style.gridTemplateColumns,
      height: box.height,
      leftPanel: element.getAttribute('data-left-panel'),
      rightPanel: element.getAttribute('data-right-panel'),
      width: box.width,
    }
  })

  if (state.childCount !== 3 || state.leftPanel !== 'open' || state.rightPanel !== 'open')
    throw new Error(`HR mounted reading-room surface is missing default panels: ${JSON.stringify(state)}`)
  if (state.width <= 0 || state.height <= 0)
    throw new Error(`HR mounted reading-room surface has no visible box: ${JSON.stringify(state)}`)

  const trackCount = state.columns.split(' ').filter(Boolean).length
  if (mode === 'desktop' && trackCount < 3)
    throw new Error(`HR mounted reading-room desktop layout is not three columns: ${JSON.stringify(state)}`)
  if (mode === 'narrow' && trackCount !== 1)
    throw new Error(`HR mounted reading-room narrow layout should be one column: ${JSON.stringify(state)}`)
}
```

- [x] **Step 4: Run the smoke script after a Web build is available**

Run:

```bash
bun apps/web/scripts/smoke-mounted-surfaces.ts
```

Expected before Task 2: FAIL with desktop layout not three columns.

Expected after Task 2: PASS with JSON containing `"status":"pass"`.

## Task 4: Run Focused Verification And Review

**Files:**
- Verify only unless a prior task exposes a failure.

- [x] **Step 1: Run HR package tests**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
```

Expected: PASS.

- [x] **Step 2: Run UI governance check**

Run:

```bash
bun run ui:check
```

Expected: PASS or report only pre-existing known migration debt. If it fails on files changed in this plan, fix those findings before continuing.

- [x] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [x] **Step 4: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: code-review-graph updates successfully and reports no blocking issue for the touched files.

## Task 5: Commit The Scoped Fix

**Files:**
- Stage only files changed for this HR layout fix.

- [x] **Step 1: Inspect the scoped diff**

Run:

```bash
git diff -- apps/aiworker-hr/product/web/people-workbench/app.tsx apps/aiworker-hr/product/web/styles.css apps/aiworker-hr/product/web/component-proof.test.tsx apps/aiworker-hr/host-adapter/index.test.ts apps/web/scripts/smoke-mounted-surfaces.ts
```

Expected: diff contains only the HR mounted layout CSS hook, ordinary CSS rules, test assertion updates, and computed-layout smoke assertion.

- [x] **Step 2: Stage only this fix**

Run:

```bash
git add apps/aiworker-hr/product/web/people-workbench/app.tsx apps/aiworker-hr/product/web/styles.css apps/aiworker-hr/product/web/component-proof.test.tsx apps/aiworker-hr/host-adapter/index.test.ts apps/web/scripts/smoke-mounted-surfaces.ts docs/superpowers/plans/2026-05-21-hr-mounted-layout-scoped-css.md
```

Expected: no unrelated PMA, runtime, manifest, storage, or engine files are staged.

- [x] **Step 3: Commit**

Run:

```bash
git commit -m "fix: 修复 HR mounted 三列布局"
```

Expected: commit succeeds with only the scoped HR layout fix and this implementation plan.

## Implementation Notes

- Browser CSSOM verification showed the new `.hr-reading-room-grid` selector
  survived micro-app scoped CSS rewriting and matched the HR route element.
- The desktop rule was still overridden until the route surface also stopped
  emitting Tailwind `grid-cols-1`; CSS cascade layer order let the utility
  layer beat the component-layer HR selector.
- The mounted smoke settings dialog assertion was updated to the current
  accessible name, `Local Host Settings`, while keeping the settings coverage
  otherwise unchanged.
