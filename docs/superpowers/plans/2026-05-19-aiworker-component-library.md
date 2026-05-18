# AIWorker Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Upgrade `packages/component` into a Host/Soul shared component library with package-owned styles, component catalog, AGENTS constraints, CRG-driven migration, and verified Host/Soul Web stability.

**Architecture:** `packages/component` owns reusable UI structure, tokens, styles, accessibility wrappers, catalog, and generic workbench shells. Host Web and Soul Apps import the package directly while keeping data fetching, copy, workflow decisions, and domain semantics local. Migration proceeds in guarded batches so app-local CSS is removed only after package styles are imported and visual/build gates pass.

**Tech Stack:** React 19, TypeScript, Bun workspaces, Vite 8, Tailwind CSS v4 CSS-variable theme, Vitest + happy-dom, lucide-react, mature headless UI dependencies for delivered overlays/select/menu/tabs/tooltip components, code-review-graph, Browser visual smoke.

---

## Scope Check

The approved spec is broad, but it is one coherent subsystem: the shared Web
component layer. This plan intentionally combines the full component taxonomy
with aggressive uplift from existing Web code, because the user explicitly
approved doing both. The plan avoids a one-shot rewrite by sequencing style
entrypoint, catalog, tests, Host migrations, Soul proof, and verification.

## File Structure

- `AGENTS.md`: add the agent-facing rule that new Host/Soul UI must start from `packages/component`.
- `docs/task/FEAT-099.md`: PMA task for the component library delivery.
- `docs/plan/PLAN-367.md`: PMA plan tied to FEAT-099.
- `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`: PMA/changelog sync. Preserve existing unrelated FEAT-098/PLAN-365 edits already present in the worktree.
- `packages/component/package.json`: export `./styles.css`, add test script, and add only delivered headless dependencies.
- `packages/component/src/styles.css`: package style entrypoint.
- `packages/component/src/styles/*.css`: foundation, primitives, overlays, layout, patterns, workbench, markdown, and motion slices.
- `packages/component/src/catalog.ts`: typed component catalog with implemented/planned status and migration queue.
- `packages/component/src/catalog.test.ts`: guard catalog uniqueness and required metadata.
- `packages/component/src/primitives/*`: component primitives and headless wrappers.
- `packages/component/src/patterns/*`: generic workbench, artifact/profile/review shells, and promoted reusable patterns.
- `packages/component/src/index.ts`, `packages/component/src/primitives/index.ts`, `packages/component/src/patterns/index.ts`: public exports.
- `apps/web/src/app/main.tsx`: import `@zonease/aiworker-component/styles.css`.
- `apps/web/src/styles/index.css`: remove moved style imports only after package import is active.
- `apps/web/src/styles/*.css`: delete or shrink moved shared style rules while keeping app/domain-specific styles local.
- `apps/web/src/features/settings/components/settings-dialog.tsx`: migrate reusable settings shell/navigation/segmented/action pieces.
- `apps/web/src/worker/worker-studio.tsx`: migrate toolbar, locator/header, rail/group/list and shell patterns where generic.
- `apps/web/src/worker/session-chat.tsx`: migrate composer, message flow, tool result, status event shells where generic.
- `apps/web/src/worker/session-detail.tsx`: migrate artifact/review/memory generic panels where safe.
- `apps/web/src/worker/session-progress-panel.tsx`: promote progress card shell.
- `apps/web/src/worker/souls/hr/people-workbench/*`: migrate generic profile reader/list/action rail shells without HR semantics.
- `apps/aiworker-hr/product/web/*`: add a small real Soul-owned Web proof that imports shared components and styles.
- `apps/web/src/shared/__tests__/*`, `apps/web/src/worker/__tests__/worker-studio.test.tsx`: preserve and extend Host/Soul UI behavior tests.
- `packages/component/src/__tests__/*`: package-level component and catalog tests.
- `scripts/web-quality.ts`: update CSS guard selectors if style ownership moves.

## Task 1: CRG Baseline And PMA Claim

**Files:**
- Create: `docs/task/FEAT-099.md`
- Create: `docs/plan/PLAN-367.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`
- Create: `tmp/component-library-crg-candidates.md`

- [x] **Step 1: Rebuild CRG for the current branch**

Run:

```bash
bun run crg:update
bun run crg:build
bun run crg:status
```

Expected: all commands exit 0, and `crg:status` reports the current branch and
current commit instead of the older `codex/shared-collapsible-group-list`
branch.

- [x] **Step 2: Capture reusable UI candidates**

Run:

```bash
bun run crg:review
```

Then inspect the high-value files:

```bash
rg -n "className=|<button|<section|<aside|<details|role=|aria-" \
  apps/web/src/features/settings/components/settings-dialog.tsx \
  apps/web/src/worker/worker-studio.tsx \
  apps/web/src/worker/session-chat.tsx \
  apps/web/src/worker/session-detail.tsx \
  apps/web/src/worker/session-progress-panel.tsx \
  apps/web/src/worker/souls/hr/people-workbench
```

Create `tmp/component-library-crg-candidates.md` with this concrete structure:

```md
# Component Library Candidate Audit

## CRG Baseline

- `bun run crg:update`: passed
- `bun run crg:build`: passed
- `bun run crg:status`: current branch and commit confirmed
- `bun run crg:review`: passed with any advisory gaps listed below

## Promote Now

| Source | Candidate | Target | Reason |
| --- | --- | --- | --- |
| apps/web/src/features/settings/components/settings-dialog.tsx | settings shell/nav/segmented/action controls | packages/component/src/patterns/settings.tsx | Generic settings UI structure |
| apps/web/src/worker/session-progress-panel.tsx | session progress card | packages/component/src/patterns/progress.tsx | Generic progress/status card |
| apps/web/src/worker/session-chat.tsx | message/tool/result/status shells | packages/component/src/patterns/message-flow.tsx | Generic session message UI |
| apps/web/src/worker/session-detail.tsx | artifact/review/memory panel shells | packages/component/src/patterns/artifact-review.tsx | Generic workbench side panels |
| apps/web/src/worker/souls/hr/people-workbench/components/profile-reading-room.tsx | profile reader shell | packages/component/src/patterns/profile.tsx | Generic profile reader frame |

## Keep Local For Now

| Source | Local Responsibility |
| --- | --- |
| HR lifecycle labels and profile parsing | HR owns profile meaning |
| Worker/session data loading and mutations | Host Web owns API state |
| Soul App manifest/protocol descriptors | Host/Soul boundary, not shared UI |

## Advisory Gaps

- Record the exact `bun run crg:review` advisory summary here after the command
  runs. If the command reports no advisory gaps, write `None reported`.
```

- [x] **Step 3: Add PMA task**

Create `docs/task/FEAT-099.md`:

```md
# FEAT-099 Host/Soul shared component library

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **plan**: PLAN-367
- **relatesTo**: ARCH-001, HOST-001, SOUL-001, IMPORT-001, REFACTOR-083

## Background

`packages/component` exists, but it is still closer to a Worker Web extraction
than a complete Host/Soul component library. Components import React structure
from the package while styles still live mostly under `apps/web/src/styles/*`.
That lets new Web work drift back to handcrafted app-local CSS.

## Acceptance Criteria

1. `packages/component` exports package-owned styles through
   `@zonease/aiworker-component/styles.css`.
2. Host Web imports the package style entrypoint and keeps its shell/workbench
   visually stable.
3. The component package includes a catalog with implemented/planned components
   and a migration queue.
4. `AGENTS.md` requires new Host/Soul UI to start from `packages/component` and
   records the app-local CSS exception rule.
5. Reusable UI from settings, shell/rail, session chat/detail/progress, and HR
   workbench is promoted where it is generic.
6. A real official Soul App Web proof imports shared components and styles.
7. Shared components do not fetch Host/Soul data and do not encode HR/QA domain
   semantics.
8. Focused package, Host Web, Soul App proof, browser, CRG, and diff checks pass.

## Completion

Task 8 adds the exact completion evidence after implementation and verification
commands pass. Until then this task remains `in_progress`.
```

- [x] **Step 4: Add PMA implementation plan**

Create `docs/plan/PLAN-367.md`:

```md
# PLAN-367 Host/Soul shared component library

- **status**: approved
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: FEAT-099

## Current State

The approved design is
`docs/superpowers/specs/2026-05-19-aiworker-component-library-design.md`.
`packages/component` exports React primitives and patterns, but styles are not
package-owned and there is no complete catalog or Host/Soul consumption proof.

## Proposal

Make `packages/component` the shared Host/Soul Web component library. Move
shared styles and tokens into the package, export a style entrypoint, add a
component catalog, migrate reusable Host Web and HR workbench UI into generic
components, and prove a Soul App Web surface imports the package directly.

## Scope

- `AGENTS.md`
- `packages/component`
- `apps/web`
- `apps/aiworker-hr/product/web`
- `docs/task/FEAT-099.md`
- `docs/plan/PLAN-367.md`
- `docs/changelog.md`
- focused tests and browser verification

## Non-Goals

- No Host/Soul protocol or manifest schema change.
- No HR/QA domain semantics in `packages/component`.
- No shadcn copy-registry model.
- No blind removal of app-local CSS before visual/build checks pass.

## Verification

- `bun run crg:update`
- `bun run crg:build`
- `bun run crg:review`
- `bun run --filter '@zonease/aiworker-component' test`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run web:smoke:mounted-surfaces`
- Browser smoke for Host Web
- Browser smoke for Soul App proof surface
- `git diff --check`
```

- [x] **Step 5: Update PMA indexes and changelog**

Preserve any existing FEAT-098/PLAN-365 changes in the dirty worktree. Append or
insert FEAT-099 and PLAN-367 according to the current index style. Add a
changelog entry:

```md
## Unreleased

- Started FEAT-099 / PLAN-367 to make `packages/component` a real Host/Soul
  shared component library with package-owned styles, component catalog,
  AGENTS constraints, CRG candidate audit, and Host/Soul Web verification.
```

- [x] **Step 6: Verify PMA/doc contract**

Run:

```bash
bun run docs:check
git diff --check
```

Expected: both pass.

- [x] **Step 7: Commit the claim**

Stage only the files from this task and commit:

```bash
git add AGENTS.md docs/task/FEAT-099.md docs/plan/PLAN-367.md docs/task/index.md docs/plan/index.md docs/changelog.md tmp/component-library-crg-candidates.md
git commit -m "docs: 启动 Host/Soul 共享组件库计划"
```

If `AGENTS.md` has not been changed yet, omit it from this task commit and
include it in Task 2.

## Task 2: Agent Constraint And Component Catalog

**Files:**
- Modify: `AGENTS.md`
- Create: `packages/component/src/catalog.ts`
- Create: `packages/component/src/catalog.test.ts`
- Modify: `packages/component/src/index.ts`
- Modify: `packages/component/package.json`

- [x] **Step 1: Add AGENTS.md UI constraint**

In the `## UI 规则` section, replace the current soft reuse bullet with this
stronger rule:

```md
- 新增或修改 Host Web / Soul App UI 时必须优先从 `packages/component` 查找
  primitives、patterns、layout 与 package-owned styles。新增 app-local UI
  组件或 CSS 前必须说明缺口：组件库尚无对应 primitive/pattern、该 UI
  确实是 Soul App 领域语义，或属于临时迁移步骤。可复用缺口必须补进
  `packages/component` 或登记到组件 catalog 的 migration queue；不要默认在
  app 内手搓样式。
```

- [x] **Step 2: Add catalog model**

Create `packages/component/src/catalog.ts`:

```ts
export type ComponentCatalogStatus = 'deprecated' | 'experimental' | 'implemented' | 'planned'

export type ComponentCatalogFamily =
  | 'data-display'
  | 'feedback'
  | 'forms'
  | 'foundation'
  | 'layout'
  | 'navigation'
  | 'overlays'
  | 'primitives'
  | 'soul-shells'
  | 'workbench'

export interface ComponentCatalogItem {
  description: string
  family: ComponentCatalogFamily
  name: string
  owner: 'host-soul-shared'
  source?: string
  status: ComponentCatalogStatus
}

export interface ComponentMigrationCandidate {
  candidate: string
  reason: string
  source: string
  target: string
}

export const componentCatalog: ComponentCatalogItem[] = [
  { family: 'foundation', name: 'styles.css', status: 'implemented', owner: 'host-soul-shared', description: 'Package-owned shared style entrypoint.' },
  { family: 'primitives', name: 'Button', status: 'implemented', owner: 'host-soul-shared', description: 'Shared button primitive with tone and icon support.' },
  { family: 'primitives', name: 'Input', status: 'planned', owner: 'host-soul-shared', description: 'Tokenized text input primitive.' },
  { family: 'forms', name: 'Field', status: 'implemented', owner: 'host-soul-shared', description: 'Form field shell with label, help and validation slots.' },
  { family: 'overlays', name: 'Dialog', status: 'implemented', owner: 'host-soul-shared', description: 'Accessible dialog wrapper for shared modal surfaces.' },
  { family: 'overlays', name: 'DropdownMenu', status: 'planned', owner: 'host-soul-shared', description: 'Headless dropdown wrapper.' },
  { family: 'overlays', name: 'Tooltip', status: 'planned', owner: 'host-soul-shared', description: 'Headless tooltip wrapper.' },
  { family: 'navigation', name: 'NavItemButton', status: 'implemented', owner: 'host-soul-shared', description: 'Shared navigation item button.' },
  { family: 'data-display', name: 'StudioCollapsibleGroup', status: 'implemented', owner: 'host-soul-shared', description: 'Generic collapsible grouped-list shell.' },
  { family: 'data-display', name: 'StatusPill', status: 'implemented', owner: 'host-soul-shared', description: 'Generic status pill with tone and optional detail.' },
  { family: 'layout', name: 'WorkerStudioLayout', status: 'implemented', owner: 'host-soul-shared', description: 'Host-mounted worker studio shell layout.' },
  { family: 'workbench', name: 'ProgressCard', status: 'planned', owner: 'host-soul-shared', description: 'Generic progress/status card promoted from session progress UI.' },
  { family: 'workbench', name: 'MessageFlow', status: 'planned', owner: 'host-soul-shared', description: 'Generic session message and tool-result shells.' },
  { family: 'soul-shells', name: 'ProfileReaderShell', status: 'planned', owner: 'host-soul-shared', description: 'Generic profile reader frame without HR semantics.' },
  { family: 'soul-shells', name: 'ArtifactPreviewFrame', status: 'planned', owner: 'host-soul-shared', description: 'Generic artifact preview frame without artifact semantics.' },
]

export const componentMigrationQueue: ComponentMigrationCandidate[] = [
  {
    candidate: 'settings shell, nav item, segmented control and action controls',
    reason: 'Generic settings UI structure should not live only in Host Web.',
    source: 'apps/web/src/features/settings/components/settings-dialog.tsx',
    target: 'packages/component/src/patterns/settings.tsx',
  },
  {
    candidate: 'session progress card',
    reason: 'Reusable progress/status card can serve Host and Soul workbenches.',
    source: 'apps/web/src/worker/session-progress-panel.tsx',
    target: 'packages/component/src/patterns/progress.tsx',
  },
  {
    candidate: 'message, tool result and status event shells',
    reason: 'Session message UI is generic while event meaning stays local.',
    source: 'apps/web/src/worker/session-chat.tsx',
    target: 'packages/component/src/patterns/message-flow.tsx',
  },
  {
    candidate: 'profile reader frame',
    reason: 'Profile reading layout is reusable while HR owns profile parsing and labels.',
    source: 'apps/web/src/worker/souls/hr/people-workbench/components/profile-reading-room.tsx',
    target: 'packages/component/src/patterns/profile.tsx',
  },
]
```

- [x] **Step 3: Add catalog tests**

Create `packages/component/src/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { componentCatalog, componentMigrationQueue } from './catalog'

describe('component catalog', () => {
  it('has unique component names', () => {
    const names = componentCatalog.map(item => item.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps every component owned by the shared Host/Soul library', () => {
    expect(componentCatalog.every(item => item.owner === 'host-soul-shared')).toBe(true)
  })

  it('tracks a concrete migration queue', () => {
    expect(componentMigrationQueue.length).toBeGreaterThan(0)
    expect(componentMigrationQueue.every(item => item.source && item.target && item.reason)).toBe(true)
  })
})
```

- [x] **Step 4: Add package test script and Vitest dependency surface**

Modify `packages/component/package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

If `vitest` is already available from the root workspace, do not add a package
dependency. If Bun cannot resolve it in package context, add `"vitest": "4"` to
root `devDependencies` only if not already present.

- [x] **Step 5: Export catalog**

Append to `packages/component/src/index.ts`:

```ts
export { componentCatalog, componentMigrationQueue } from './catalog'
export type { ComponentCatalogFamily, ComponentCatalogItem, ComponentCatalogStatus, ComponentMigrationCandidate } from './catalog'
```

- [x] **Step 6: Run catalog gates**

Run:

```bash
bun run --filter '@zonease/aiworker-component' test
bun run --filter '@zonease/aiworker-component' typecheck
```

Expected: both pass.

- [x] **Step 7: Commit**

```bash
git add AGENTS.md packages/component/package.json packages/component/src/catalog.ts packages/component/src/catalog.test.ts packages/component/src/index.ts
git commit -m "docs: 约束共享组件库优先使用"
```

## Task 3: Package-Owned Style Entrypoint

**Files:**
- Modify: `packages/component/package.json`
- Create: `packages/component/src/styles.css`
- Create: `packages/component/src/styles/foundation.css`
- Create: `packages/component/src/styles/primitives.css`
- Create: `packages/component/src/styles/patterns.css`
- Create: `packages/component/src/styles/layout.css`
- Create: `packages/component/src/styles/markdown.css`
- Create: `packages/component/src/styles/motion.css`
- Modify: `apps/web/src/app/main.tsx`
- Modify: `apps/web/src/styles/index.css`

- [x] **Step 1: Export package styles**

Add this export to `packages/component/package.json`:

```json
"./styles.css": {
  "import": "./src/styles.css"
}
```

- [x] **Step 2: Create package style entrypoint**

Create `packages/component/src/styles.css`:

```css
@import './styles/foundation.css';
@import './styles/primitives.css';
@import './styles/patterns.css';
@import './styles/layout.css';
@import './styles/markdown.css';
@import './styles/motion.css';
```

- [x] **Step 3: Move foundation tokens without breaking Host Web**

Create `packages/component/src/styles/foundation.css` by moving the shared
content currently in `apps/web/src/styles/tokens.css` and `apps/web/src/styles/base.css`.
Keep selectors that are app-only loading shells in `apps/web` until browser
verification proves they are shared.

The file must contain every rule currently in
`apps/web/src/styles/tokens.css`, plus the reset, body, focus, form field,
button, `.sr-only`, and `.od-loading-shell` rules currently in
`apps/web/src/styles/base.css`.

- [x] **Step 4: Move shared primitive and pattern styles**

Move these selector groups into package style slices:

- `button`, `button.primary`, `button.ghost`, `.icon-btn` -> `primitives.css`
- `.modal-backdrop`, `.modal`, `.modal-head`, `.settings-close` -> `primitives.css` or `patterns.css`
- `.studio-section-*`, `.studio-empty-*`, `.studio-pill*`, `.studio-activity-*`, `.studio-collapsible-*`, `.studio-select*` -> `patterns.css`
- `.entry-shell`, `.entry`, `.entry-side`, `.entry-main`, `.workspace-entry`, `.host-header-row`, `.host-topbar*`, `.host-locator*` -> `layout.css`
- `.markdown-preview*` -> `markdown.css`
- keyframes and `.studio-collapsible-group-toggle` motion rules -> `motion.css`

Do not move HR-specific selectors such as `.hr-profile-*` yet.

- [x] **Step 5: Import package styles before app styles**

Modify `apps/web/src/app/main.tsx`:

```ts
import '@zonease/aiworker-component/styles.css'
import '../styles/index.css'
```

- [x] **Step 6: Remove duplicate moved imports from app style entrypoint**

Modify `apps/web/src/styles/index.css` so it no longer imports CSS files whose
shared contents moved entirely into the package. Keep app-specific files:

```css
@import "tailwindcss";
@import './fonts.css';
@import './creation.css';
@import './rail.css';
@import './workspace.css';
@import '../worker/souls/hr/people-workbench/styles.css';
@import './session-chat.css';
@import './workspace-cards.css';
@import './artifact.css';
@import './dialog.css';
@import './settings.css';
@import './responsive.css';
```

If a file still contains local-only rules after extraction, keep its import and
delete only the moved selectors.

- [x] **Step 7: Run CSS/build gates**

```bash
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-component' typecheck
git diff --check
```

Expected: all pass, including `check:studio-css` from Web build.

- [x] **Step 8: Commit**

```bash
git add packages/component/package.json packages/component/src/styles.css packages/component/src/styles apps/web/src/app/main.tsx apps/web/src/styles
git commit -m "feat: 让组件库拥有共享样式入口"
```

## Task 4: Core Primitives And Headless Wrappers

**Files:**
- Modify: `packages/component/src/primitives/button.tsx`
- Modify: `packages/component/src/primitives/field.tsx`
- Create: `packages/component/src/primitives/input.tsx`
- Create: `packages/component/src/primitives/switch.tsx`
- Modify: `packages/component/src/primitives/dialog.tsx`
- Modify: `packages/component/src/primitives/select.tsx`
- Modify: `packages/component/src/primitives/index.ts`
- Create: `packages/component/src/primitives/primitives.test.tsx`
- Modify: `packages/component/package.json`

- [x] **Step 1: Add mature headless dependencies for delivered wrappers**

Add dependencies only for delivered wrappers:

```json
"dependencies": {
  "@radix-ui/react-dialog": "^1.1.15",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-switch": "^1.2.6",
  "lucide-react": "^1.8.0",
  "react": "^19.1.0",
  "react-markdown": "^10.1.0",
  "remark-gfm": "^4.0.1"
}
```

Run:

```bash
bun install
```

- [x] **Step 2: Add Input primitive**

Create `packages/component/src/primitives/input.tsx`:

```tsx
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

import { cx } from '../utils/cx'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export function Input({ className, invalid = false, ...props }: InputProps) {
  return <input {...props} aria-invalid={invalid || props['aria-invalid']} className={cx('ui-input', className)} />
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export function Textarea({ className, invalid = false, ...props }: TextareaProps) {
  return <textarea {...props} aria-invalid={invalid || props['aria-invalid']} className={cx('ui-textarea', className)} />
}
```

- [x] **Step 3: Upgrade Field props without breaking existing users**

Modify `packages/component/src/primitives/field.tsx` to add optional
`description`, `error`, and `htmlFor` support while preserving the existing
`label` behavior:

```tsx
export interface FieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  description?: ReactNode
  error?: ReactNode
  label: ReactNode
}
```

Render `description` as `<small className="ui-field-description">` and `error`
as `<small className="ui-field-error" role="alert">`.

- [x] **Step 4: Convert Dialog to Radix while keeping public props**

Modify `packages/component/src/primitives/dialog.tsx` to use
`@radix-ui/react-dialog`, but keep the existing `DialogProps` so current
consumers do not change:

```tsx
import * as DialogPrimitive from '@radix-ui/react-dialog'
```

Render `DialogPrimitive.Root`, `Portal`, `Overlay`, `Content`, `Title`, and
`Close`. Preserve `modal-backdrop`, `modal`, `modal-head`, and close class names
so current CSS guard selectors remain stable.

- [x] **Step 5: Convert Select to Radix while keeping current props**

Modify `packages/component/src/primitives/select.tsx` to use
`@radix-ui/react-select`, preserving `SelectProps` and class names
`studio-select`, `studio-select-trigger`, `studio-select-list`, and
`studio-select-option`.

- [x] **Step 6: Add Switch primitive**

Create `packages/component/src/primitives/switch.tsx`:

```tsx
import type { ComponentPropsWithoutRef } from 'react'

import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cx } from '../utils/cx'

export interface SwitchProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: string
}

export function Switch({ className, label, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root {...props} className={cx('ui-switch', className)} aria-label={props['aria-label'] ?? label}>
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  )
}
```

- [x] **Step 7: Export new primitives**

Update `packages/component/src/primitives/index.ts`:

```ts
export { Input, Textarea } from './input'
export type { InputProps, TextareaProps } from './input'
export { Switch } from './switch'
export type { SwitchProps } from './switch'
```

- [x] **Step 8: Add primitive tests**

Create `packages/component/src/primitives/primitives.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Dialog, Input, Select, Switch } from '.'

describe('shared primitives', () => {
  it('renders input invalid state', () => {
    render(<Input aria-label="Name" invalid />)
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('opens and closes dialog with accessible title', () => {
    const onClose = vi.fn()
    render(<Dialog open closeLabel="Close" onClose={onClose} title="Settings" titleId="settings-title">Body</Dialog>)
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('changes select value', () => {
    const onChange = vi.fn()
    render(<Select ariaLabel="Mode" label="Mode" value="a" onChange={onChange} options={[{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Mode' }))
    fireEvent.click(screen.getByRole('option', { name: 'B' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('toggles switch', () => {
    const onCheckedChange = vi.fn()
    render(<Switch label="Enabled" onCheckedChange={onCheckedChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})
```

If `@testing-library/react` is not available to the package test runner, add it
to root dev dependencies only if missing.

- [x] **Step 9: Run primitive gates**

```bash
bun run --filter '@zonease/aiworker-component' test
bun run --filter '@zonease/aiworker-component' typecheck
bun run --filter '@zonease/aiworker-web' test src/shared/__tests__/studio-collapsible-group.test.tsx
```

- [x] **Step 10: Commit**

```bash
git add package.json bun.lock packages/component
git commit -m "feat: 补齐共享组件基础 primitives"
```

## Task 5: Generic Patterns From Host Web Hotspots

**Files:**
- Create: `packages/component/src/patterns/settings.tsx`
- Create: `packages/component/src/patterns/progress.tsx`
- Create: `packages/component/src/patterns/message-flow.tsx`
- Create: `packages/component/src/patterns/artifact-review.tsx`
- Create: `packages/component/src/patterns/profile.tsx`
- Modify: `packages/component/src/patterns/index.ts`
- Create: `packages/component/src/patterns/patterns.test.tsx`
- Modify: `packages/component/src/catalog.ts`

- [x] **Step 1: Add SettingsShell pattern**

Create `packages/component/src/patterns/settings.tsx` with generic shell
components:

```tsx
import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface SettingsShellProps extends HTMLAttributes<HTMLDivElement> {
  content: ReactNode
  sidebar: ReactNode
}

export function SettingsShell({ className, content, sidebar, ...props }: SettingsShellProps) {
  return (
    <div {...props} className={cx('settings-shell', className)}>
      <aside className="settings-sidebar">{sidebar}</aside>
      <section className="settings-content">{content}</section>
    </div>
  )
}

export interface SegmentedControlOption {
  description?: ReactNode
  label: ReactNode
  value: string
}

export function SegmentedControl({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string
  onChange: (value: string) => void
  options: SegmentedControlOption[]
  value: string
}) {
  return (
    <div className="seg-control" style={{ '--seg-cols': options.length } as React.CSSProperties} role="group" aria-label={ariaLabel}>
      {options.map(option => (
        <button key={option.value} type="button" className={cx('seg-btn', option.value === value && 'active')} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          <span className="seg-title">{option.label}</span>
          {option.description ? <span className="seg-meta">{option.description}</span> : null}
        </button>
      ))}
    </div>
  )
}
```

- [x] **Step 2: Add ProgressCard pattern**

Create `packages/component/src/patterns/progress.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface ProgressCardProps extends HTMLAttributes<HTMLElement> {
  compact?: boolean
  detail?: ReactNode
  label: ReactNode
}

export function ProgressCard({ className, compact = false, detail, label, ...props }: ProgressCardProps) {
  return (
    <section {...props} className={cx('session-progress-card', compact && 'compact', className)}>
      <div className="session-progress-head">
        <span className="session-progress-dot" aria-hidden="true" />
        <span className="session-progress-label">{label}</span>
      </div>
      {detail ? <span className="session-progress-detail">{detail}</span> : null}
    </section>
  )
}
```

- [x] **Step 3: Add message and tool result shells**

Create `packages/component/src/patterns/message-flow.tsx` with generic
`MessageFlow`, `MessageRow`, `ToolResultCard`, and `StatusEventPill` components.
These components accept `children`, `roleLabel`, `timestamp`, `tone`, `command`,
and `result` props, but do not parse engine events.

- [x] **Step 4: Add artifact/review/profile shells**

Create:

- `ArtifactPreviewFrame` in `artifact-review.tsx`
- `ReviewPanelShell` in `artifact-review.tsx`
- `ProfileReaderShell` in `profile.tsx`

Each component accepts explicit `title`, `description`, `actions`, `children`,
`empty`, `loading`, and `error` props. They must not mention HR, QA, candidate,
release, or review verdict semantics.

- [x] **Step 5: Export patterns**

Update `packages/component/src/patterns/index.ts` to export all new patterns and
types.

- [x] **Step 6: Add pattern tests**

Create `packages/component/src/patterns/patterns.test.tsx` verifying:

- `SettingsShell` renders complementary/sidebar and main content.
- `SegmentedControl` calls `onChange`.
- `ProgressCard` renders label/detail and compact class.
- `ProfileReaderShell` renders loading/error/empty states without domain words.

- [x] **Step 7: Mark catalog items implemented**

Update `componentCatalog` statuses for `ProgressCard`, `MessageFlow`,
`ArtifactPreviewFrame`, `ReviewPanelShell`, and `ProfileReaderShell` from
`planned` to `implemented` after each pattern exists.

- [x] **Step 8: Run pattern gates**

```bash
bun run --filter '@zonease/aiworker-component' test
bun run --filter '@zonease/aiworker-component' typecheck
```

- [x] **Step 9: Commit**

```bash
git add packages/component/src/patterns packages/component/src/catalog.ts
git commit -m "feat: 提升共享工作台 UI patterns"
```

## Task 6: Host Web Migration

**Files:**
- Modify: `apps/web/src/features/settings/components/settings-dialog.tsx`
- Modify: `apps/web/src/worker/session-progress-panel.tsx`
- Modify: `apps/web/src/worker/session-chat.tsx`
- Modify: `apps/web/src/worker/session-detail.tsx`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/styles/*.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Migrate SessionProgressPanel first**

Replace local markup in `apps/web/src/worker/session-progress-panel.tsx` with
`ProgressCard`:

```tsx
import { ProgressCard } from '@zonease/aiworker-component'

export function SessionProgressPanel({ className = '', compact = false, progress }: SessionProgressPanelProps) {
  return (
    <ProgressCard
      className={className}
      compact={compact}
      detail={progress.detail}
      label={progress.label}
    />
  )
}
```

- [x] **Step 2: Migrate settings reusable shell**

In `settings-dialog.tsx`, replace local `.modal-body` grid composition with
`SettingsShell`, and replace duplicated segmented controls with
`SegmentedControl`. Keep settings data state and copy in Host Web.

- [x] **Step 3: Migrate session chat shells**

Use `MessageFlow`, `MessageRow`, and `ToolResultCard` for generic layout in
`session-chat.tsx`. Keep engine event parsing and copy in Host Web.

- [x] **Step 4: Migrate session detail shells**

Use `ArtifactPreviewFrame` and `ReviewPanelShell` for generic side panel layout.
Keep artifact preview loading, review submit, memory lesson status and labels in
Host Web.

- [x] **Step 5: Migrate worker-studio toolbar/list leftovers**

Use existing and new shared patterns for the Host locator, toolbar buttons,
grouped rail sections, and empty states. Do not move worker/workspace/session
API state to the component package.

- [x] **Step 6: Delete duplicate app CSS only after tests pass**

Remove style rules from `apps/web/src/styles/*.css` only when the selector is
now owned by `packages/component/src/styles/*.css`. Keep HR-specific and
Host-specific domain styles local.

- [x] **Step 7: Extend Host tests**

Update `worker-studio.test.tsx` to assert that migrated surfaces still render
critical shared class names:

```tsx
expect(document.querySelector('.session-progress-card')).toBeTruthy()
expect(document.querySelector('.studio-collapsible-group')).toBeTruthy()
```

Add settings or session assertions only where existing fixtures already open
those surfaces.

- [x] **Step 8: Run Host migration gates**

```bash
bun run --filter '@zonease/aiworker-web' test src/shared/__tests__/studio-collapsible-group.test.tsx src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' lint
bun run --filter '@zonease/aiworker-web' build
git diff --check
```

- [x] **Step 9: Commit**

```bash
git add apps/web packages/component/src/styles packages/component/src/catalog.ts
git commit -m "refactor: 迁移 Host Web 到共享组件库"
```

## Task 7: Official Soul App Web Proof

**Files:**
- Modify: `apps/aiworker-hr/package.json`
- Modify: `apps/aiworker-hr/product/web/widgets/people-widget.tsx`
- Modify: `apps/aiworker-hr/product/web/panels/profile-panel.tsx`
- Create: `apps/aiworker-hr/product/web/component-proof.test.tsx`
- Modify: `apps/aiworker-hr/tsconfig.json` only if the added TSX test is not
  included by the current config after `bun run --filter '@zonease/aiworker-hr'
  test`

- [x] **Step 1: Add component package dependency to HR app**

Add to `apps/aiworker-hr/package.json` dependencies:

```json
"@zonease/aiworker-component": "workspace:*"
```

- [x] **Step 2: Replace descriptor-only widget with a small real component export**

Modify `people-widget.tsx`:

```tsx
import '@zonease/aiworker-component/styles.css'
import { ProfileReaderShell, StudioStatusPill } from '@zonease/aiworker-component'

export const widgetId = 'hr-people-widget'

export function HrPeopleWidgetProof() {
  return (
    <ProfileReaderShell
      title="People Profile"
      description="Shared component proof for the HR Soul App Web surface."
      actions={<StudioStatusPill active>Shared UI</StudioStatusPill>}
    >
      <p>HR owns the profile meaning. The shared package owns this shell.</p>
    </ProfileReaderShell>
  )
}
```

This proof can use generic labels, but must not move HR parsing/promotion logic
into the component package.

- [x] **Step 3: Add package-level proof test**

Create `apps/aiworker-hr/product/web/component-proof.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HrPeopleWidgetProof } from './widgets/people-widget'

describe('HR product web shared component proof', () => {
  it('renders a shared profile shell without moving HR meaning into the component package', () => {
    render(<HrPeopleWidgetProof />)
    expect(screen.getByText('People Profile')).toBeTruthy()
    expect(screen.getByText('Shared UI')).toBeTruthy()
  })
})
```

- [x] **Step 4: Run HR gates**

```bash
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-hr' test
```

If the HR package has no test script, add `"test": "vitest run"` to
`apps/aiworker-hr/package.json`.

- [x] **Step 5: Commit**

```bash
git add apps/aiworker-hr package.json bun.lock
git commit -m "feat: 证明 HR Soul App 消费共享组件库"
```

## Task 8: Quality Gates, Browser Smoke, CRG Closeout

**Files:**
- Modify: `scripts/web-quality.ts`
- Modify: `docs/task/FEAT-099.md`
- Modify: `docs/plan/PLAN-367.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Update CSS guard selectors**

Ensure `scripts/web-quality.ts` checks selectors that prove component package
styles survived extraction:

```ts
const criticalStudioSelectors = [
  '.entry-shell',
  '.entry-side',
  '.entry-main',
  '.host-header-row',
  '.studio-collapsible-group',
  '.session-progress-card',
  '.modal-settings',
  '.settings-sidebar',
  '.markdown-preview',
] as const
```

Keep existing selectors that remain critical and remove only stale selectors
after confirming they are not rendered by the current Host Web build.

- [x] **Step 2: Run full focused gate**

```bash
bun run --filter '@zonease/aiworker-component' test
bun run --filter '@zonease/aiworker-component' typecheck
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-web' test
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' lint
bun run --filter '@zonease/aiworker-web' build
bun run web:smoke:mounted-surfaces
git diff --check
```

Expected: all pass.

- [x] **Step 3: Run browser smoke**

Start the dev server:

```bash
bun run dev
```

Open Host Web in Browser:

```text
http://127.0.0.1:5173
```

Verify:

- Host header and left rail render.
- Settings dialog opens and is styled.
- Worker/workspace/session views render without collapsed layout.
- HR workbench profile list/reader/tools layout renders without style collapse.
- No obvious overlapping text, missing background, invisible buttons, or blank
  panels.

Open or render the HR proof component through the available test/story/dev
surface. If there is no existing route, use the Vitest-rendered proof plus a
temporary local Vite proof page under `tmp/` and do not commit that temp page.

- [x] **Step 4: Run final CRG**

```bash
bun run crg:update
bun run crg:build
bun run crg:review
```

Expected: commands exit 0. If advisory gaps remain, summarize why focused tests
and browser smoke cover the changed behavior.

- [x] **Step 5: Complete PMA and changelog**

Update `docs/task/FEAT-099.md` completion section with:

- Component style entrypoint.
- Catalog and AGENTS constraint.
- Host Web migrated surfaces.
- HR Soul App proof.
- Verification command results.
- Browser smoke summary.
- CRG summary.

Update `docs/plan/PLAN-367.md` verification with exact passed commands.
Update `docs/changelog.md` with the completed summary.

- [x] **Step 6: Commit closeout**

```bash
git add scripts/web-quality.ts docs/task/FEAT-099.md docs/plan/PLAN-367.md docs/task/index.md docs/plan/index.md docs/changelog.md
git commit -m "test: 验证 Host/Soul 共享组件库稳定性"
```

## Task 9: Completion Audit

**Files:**
- No required file changes unless the audit finds gaps.

- [x] **Step 1: Derive requirements from the objective**

Check the objective and confirm evidence exists for:

- approved spec
- implementation plan
- implemented shared component library
- migrated reusable Host Web UI
- real Soul App Web proof
- AGENTS constraint
- PMA docs
- CRG audit before and after
- strict tests
- browser smoke proving Host/Soul Web did not collapse

- [x] **Step 2: Inspect current state**

Run:

```bash
git status --short
rg -n "styles.css|componentCatalog|componentMigrationQueue|ProfileReaderShell|ProgressCard|SettingsShell" packages/component apps/web apps/aiworker-hr AGENTS.md
```

Expected: evidence exists in current files, not only in plan text.

- [x] **Step 3: Decide whether the goal is complete**

If every requirement is proven by current files and command output, report the
evidence and mark the goal complete. If any requirement is missing or only
indirectly proven, keep the goal active and continue the missing task.
