# Codex-like Session Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Worker Web session surface so one session feels like a Codex Desktop-style invocation timeline with a composer control dock and rich transcript rendering.

**Architecture:** Keep the change Web-owned and session-scoped. Expand the transcript view model first, then render P0 rich items through shared `packages/ui` primitives, then wire `apps/worker-web` ChatSurface to produce the lifecycle, activity, resource, command, action, and composer states without changing the follow-up API.

**Tech Stack:** React 19, TypeScript, Vitest + happy-dom, shadcn-managed primitives through `packages/ui`, Hugeicons already used by `packages/ui`, Worker broker APIs in `apps/worker-web`.

---

## Scope Check

The approved spec covers one subsystem: `apps/worker-web` single-session surface plus shared `packages/ui` transcript/composer primitives. It does not require a separate daemon/API plan. If a task discovers missing typed resource metadata from the broker, only add the smallest redacted metadata field needed for typed resource cards and keep `POST /api/sessions/:sessionId/invocations` unchanged.

Non-goals that must stay visible during implementation:

- Do not recreate the full Codex Desktop shell.
- Do not add permissions, context remaining, or model/strength UI.
- Do not introduce Host-owned session UI.
- Do not let Soul provide UI.
- Do not display raw chunks, secrets, chain-of-thought, or unredacted tool payloads.

## File Structure

- Modify `packages/ui/src/components/transcript-types.ts`: add first-class transcript item types for resource cards and turn actions; preserve existing `artifact-strip` compatibility.
- Create `packages/ui/src/components/resource-card.tsx`: typed resource card primitive for web, file, directory, document, image, browser, and unknown resources.
- Create `packages/ui/src/components/resource-card.test.tsx`: resource card safety and rendering tests.
- Create `packages/ui/src/components/turn-action-rail.tsx`: quiet per-turn action rail primitive.
- Create `packages/ui/src/components/turn-action-rail.test.tsx`: action rendering, disabled state, and callback tests.
- Modify `packages/ui/src/components/chat-thread.tsx`: render `resource-card` and `turn-action-rail`; tune transcript material and timeline rhythm.
- Modify `packages/ui/src/components/chat-thread.test.tsx`: prove new first-class item rendering and absence of nested card chrome.
- Modify `packages/ui/src/components/assistant-markdown.tsx`: expand P0 markdown rendering for headings, task lists, nested list indentation, typed links, and stable inline semantic token backgrounds.
- Modify `packages/ui/src/components/assistant-markdown.test.tsx`: P0 rich markdown tests.
- Modify `packages/ui/src/components/artifact-strip.tsx`: keep compatibility while delegating individual cards to `ResourceCard`.
- Modify `packages/ui/src/components/artifact-strip.test.tsx`: preserve safe link behavior through the delegated renderer.
- Modify `packages/ui/src/components/command-block.tsx`: make command blocks lighter in the transcript and keep failed output expanded.
- Modify `packages/ui/src/components/command-block.test.tsx`: cover compact transcript styling and failed evidence.
- Modify `packages/ui/src/components/session-composer.tsx`: support a dock-like running state without adding permissions/context/model controls.
- Modify `packages/ui/src/components/session-composer.test.tsx`: prove running/stop affordance and absence of removed controls.
- Modify `apps/worker-web/src/worker/studio/chat/bridge-event-mapper.ts`: map session events into P0 first-class items.
- Modify `apps/worker-web/src/worker/studio/chat/bridge-event-mapper.test.ts`: mapper tests for resource, command, activity, lifecycle, terminal state, and redaction.
- Create `apps/worker-web/src/worker/studio/chat/session-timeline.tsx`: Worker Web session timeline wrapper around `ChatThread`, including localized labels and turn actions.
- Create `apps/worker-web/src/worker/studio/chat/session-timeline.test.tsx`: session timeline state tests.
- Create `apps/worker-web/src/worker/studio/chat/session-composer-dock.tsx`: Worker Web composer state wrapper around `ManagedSessionComposer`.
- Create `apps/worker-web/src/worker/studio/chat/session-composer-dock.test.tsx`: dock state tests for idle, submitting, running, completed, failed, and cancelled.
- Modify `apps/worker-web/src/worker/studio/chat/chat-transcript.tsx`: consume the expanded mapper and pass stable turns to `SessionTimeline`.
- Modify `apps/worker-web/src/worker/studio/chat/chat-surface.tsx`: own session lifecycle state, optimistic submit, sticky scroll, composer reserve, and cancel/continue wiring.
- Modify `apps/worker-web/src/worker/studio/chat/chat-surface.test.tsx`: integration tests for lifecycle and no removed controls.
- Modify `apps/worker-web/src/worker/studio/chat/chat-composer.tsx`: keep `submitSessionInvocation` route; expose submit status to `SessionComposerDock`.
- Modify `apps/worker-web/src/worker/studio/chat/chat-composer.test.tsx`: preserve canonical follow-up route.

### Task 1: Expand Transcript View Model And Mapper

**Files:**
- Modify: `packages/ui/src/components/transcript-types.ts`
- Modify: `apps/worker-web/src/worker/studio/chat/bridge-event-mapper.ts`
- Test: `apps/worker-web/src/worker/studio/chat/bridge-event-mapper.test.ts`

- [ ] **Step 1: Write failing mapper tests for P0 first-class items**

Add these tests to `apps/worker-web/src/worker/studio/chat/bridge-event-mapper.test.ts`:

```ts
it('maps redacted resource observations into first-class resource-card items', () => {
  const turns = buildInvocationTurns([
    event({
      invocationId: 'inv-1',
      seq: 1,
      type: 'artifact',
      payloadJson: {
        bridgeEvent: 'resource.observed',
        resource: {
          href: 'http://localhost:54393/report',
          kind: 'web',
          location: 'localhost:54393',
          status: 'available',
          title: 'Superpowers Brainstorm',
        },
      },
    }),
    event({
      invocationId: 'inv-1',
      seq: 2,
      type: 'file_change',
      payloadJson: {
        bridgeEvent: 'file.changed',
        file: {
          kind: 'document',
          path: 'docs/runtime.md',
          status: 'modified',
          title: 'runtime.md',
        },
      },
    }),
  ])

  expect(turns[0]!.items).toMatchObject([
    {
      id: 'inv-1:resource:1',
      kind: 'resource-card',
      resource: {
        href: 'http://localhost:54393/report',
        kind: 'web',
        location: 'localhost:54393',
        status: 'available',
        title: 'Superpowers Brainstorm',
      },
    },
    {
      id: 'inv-1:resource:2',
      kind: 'resource-card',
      resource: {
        kind: 'document',
        location: 'docs/runtime.md',
        status: 'modified',
        title: 'runtime.md',
      },
    },
  ])
})

it('maps redacted command observations into command items without leaking tool args', () => {
  const turns = buildInvocationTurns([
    event({
      invocationId: 'inv-1',
      seq: 1,
      type: 'tool',
      payloadJson: {
        bridgeEvent: 'invocation.tool.observed',
        tool: {
          command: 'bun run --filter @zonease/aiworker-ui test',
          id: 'tool-1',
          name: 'exec_command',
          output: '1 failed',
          phase: 'result',
          status: 'failed',
          args: { token: 'sk-test-raw-secret' },
        },
      },
    }),
  ])

  const group = turns[0]!.items.find(item => item.kind === 'activity-group')
  expect(group).toMatchObject({
    kind: 'activity-group',
    activities: [
      {
        command: {
          command: 'bun run --filter @zonease/aiworker-ui test',
          output: '1 failed',
          status: 'failed',
          title: 'exec_command',
        },
        status: 'failed',
        title: 'exec_command',
      },
    ],
  })
  expect(JSON.stringify(turns)).not.toContain('sk-test-raw-secret')
})

it('appends a quiet action rail after assistant output for completed turns', () => {
  const turns = buildInvocationTurns([
    event({ invocationId: 'inv-1', seq: 1, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'Done.' } } }),
    event({ invocationId: 'inv-1', seq: 2, type: 'status', payloadJson: { bridgeEvent: 'invocation.completed' } }),
  ])

  expect(turns[0]!.items.at(-1)).toMatchObject({
    id: 'inv-1:actions',
    kind: 'turn-action-rail',
    actions: [
      { id: 'copy', label: 'Copy' },
      { id: 'quote', label: 'Quote' },
    ],
  })
})
```

- [ ] **Step 2: Run mapper tests to verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' test -- src/worker/studio/chat/bridge-event-mapper.test.ts
```

Expected: FAIL because `resource-card` and `turn-action-rail` are not valid `TranscriptItemModel` variants and `buildInvocationTurns` does not map those events.

- [ ] **Step 3: Add transcript item types**

In `packages/ui/src/components/transcript-types.ts`, add these interfaces below `TranscriptCommandModel` and update `TranscriptItemModel` plus `summarizeTranscriptTurn`:

```ts
export type TranscriptResourceKind = 'browser' | 'directory' | 'document' | 'file' | 'image' | 'unknown' | 'web'

export interface TranscriptResourceModel {
  actionLabel?: ReactNode
  description?: ReactNode
  href?: string
  id: string
  kind: TranscriptResourceKind
  location?: ReactNode
  status?: ReactNode
  title: ReactNode
}

export interface TranscriptTurnActionModel {
  disabled?: boolean
  href?: string
  id: string
  label: ReactNode
  onClick?: () => void
}
```

Update the union:

```ts
export type TranscriptItemModel
  = | { body: ReactNode, id: string, kind: 'user-message' }
    | { id: string, kind: 'assistant-markdown', markdown: string, streaming?: boolean }
    | ({ kind: 'timeline-step' } & TranscriptTimelineStepModel)
    | { activities: TranscriptActivityModel[], defaultCollapsed?: boolean, id: string, kind: 'activity-group', summary: ReactNode }
    | ({ id: string, kind: 'command' } & TranscriptCommandModel)
    | { artifacts: TranscriptArtifactModel[], id: string, kind: 'artifact-strip' }
    | { id: string, kind: 'resource-card', resource: TranscriptResourceModel }
    | { actions: TranscriptTurnActionModel[], id: string, kind: 'turn-action-rail' }
    | { body: ReactNode, id: string, kind: 'status', tone?: TranscriptTone }
    | { id: string, kind: 'custom', node: ReactNode }
```

Update `TranscriptTurnSummary`:

```ts
export interface TranscriptTurnSummary {
  activityCount: number
  artifactCount: number
  assistantCount: number
  commandCount: number
  itemCount: number
  resourceCount: number
}
```

Initialize `resourceCount: 0`, increment it for `resource-card`, and keep existing `artifact-strip` counting unchanged.

- [ ] **Step 4: Implement mapper helpers**

In `apps/worker-web/src/worker/studio/chat/bridge-event-mapper.ts`, add type aliases:

```ts
type TranscriptResourceCardItem = Extract<TranscriptItemModel, { kind: 'resource-card' }>
type TranscriptTurnActionRailItem = Extract<TranscriptItemModel, { kind: 'turn-action-rail' }>
```

Inside the event loop, after tool/error mapping, add:

```ts
const resource = resourceItemForEvent(event)
if (resource)
  items.push(resource)
```

After the event loop and before returning the turn, add:

```ts
appendTurnActions(items, invocationId)
```

Add helper functions:

```ts
function resourceItemForEvent(event: LocalSessionEvent): TranscriptResourceCardItem | null {
  if (event.type !== 'artifact' && event.type !== 'file_change')
    return null

  const payload = readRecord(event.payloadJson)
  const resource = readRecord(payload.resource)
  const file = readRecord(payload.file)
  const source = Object.keys(resource).length > 0 ? resource : file
  const title = readString(source.title) || readString(source.path) || readString(source.href)
  if (!title)
    return null

  return {
    id: `${event.invocationId}:resource:${event.seq}`,
    kind: 'resource-card',
    resource: {
      href: readSafeHref(source.href),
      id: `${event.invocationId}:resource:${event.seq}:model`,
      kind: readResourceKind(source.kind),
      location: readString(source.location) || readString(source.path) || undefined,
      status: readString(source.status) || undefined,
      title,
    },
  }
}

function readResourceKind(value: unknown): TranscriptResourceCardItem['resource']['kind'] {
  if (value === 'browser' || value === 'directory' || value === 'document' || value === 'file' || value === 'image' || value === 'web')
    return value
  return 'unknown'
}

function readSafeHref(value: unknown): string | undefined {
  const href = readString(value).trim()
  if (!href || /[\u0000-\u001F\u007F]/.test(href))
    return undefined
  try {
    const url = new URL(href, 'https://aiworker.local')
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return href
  }
  catch {
    return undefined
  }
  return undefined
}

function appendTurnActions(items: TranscriptItemModel[], invocationId: string): void {
  const hasAssistant = items.some(item => item.kind === 'assistant-markdown' && item.markdown.trim().length > 0)
  if (!hasAssistant)
    return
  items.push({
    actions: [
      { id: 'copy', label: 'Copy' },
      { id: 'quote', label: 'Quote' },
    ],
    id: `${invocationId}:actions`,
    kind: 'turn-action-rail',
  })
}
```

Update `toolActivityForEvent` so redacted command details are consumed only from allowlisted fields:

```ts
function toolActivityForEvent(event: LocalSessionEvent, invocationId: string, index: number): TranscriptActivityModel {
  const tool = readRecord(readRecord(event.payloadJson).tool)
  const phase = readString(tool.phase)
  const explicitStatus = readString(tool.status)
  const status = phase === 'result'
    ? (tool.isError === true || explicitStatus === 'failed' ? 'failed' : 'succeeded')
    : 'running'
  const title = readString(tool.name) || 'tool'
  const command = commandForTool(tool, title, status)
  return {
    command,
    id: `${invocationId}:tool:${index}`,
    status,
    title,
  }
}

function commandForTool(
  tool: Record<string, unknown>,
  title: string,
  status: TranscriptActivityModel['status'],
): TranscriptActivityModel['command'] {
  const command = readString(tool.command)
  if (!command)
    return undefined
  return {
    command,
    output: readString(tool.output) || undefined,
    status,
    title,
  }
}
```

- [ ] **Step 5: Run mapper tests to verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' test -- src/worker/studio/chat/bridge-event-mapper.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/ui/src/components/transcript-types.ts apps/worker-web/src/worker/studio/chat/bridge-event-mapper.ts apps/worker-web/src/worker/studio/chat/bridge-event-mapper.test.ts
git commit -m "feat(worker-web): expand session transcript view model"
```

### Task 2: Add Resource Card And Turn Action Rail Primitives

**Files:**
- Create: `packages/ui/src/components/resource-card.tsx`
- Create: `packages/ui/src/components/resource-card.test.tsx`
- Create: `packages/ui/src/components/turn-action-rail.tsx`
- Create: `packages/ui/src/components/turn-action-rail.test.tsx`
- Modify: `packages/ui/src/components/chat-thread.tsx`
- Test: `packages/ui/src/components/chat-thread.test.tsx`

- [ ] **Step 1: Write failing primitive tests**

Create `packages/ui/src/components/resource-card.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ResourceCard } from './resource-card'

afterEach(() => cleanup())

describe('resource card', () => {
  it('renders a typed web resource with location, status and open action', () => {
    render(
      <ResourceCard
        resource={{
          href: 'http://localhost:54393',
          id: 'resource-1',
          kind: 'web',
          location: 'localhost:54393',
          status: 'available',
          title: '网页预览',
        }}
      />,
    )

    expect(screen.getByText('网页预览')).toBeTruthy()
    expect(screen.getByText('网站')).toBeTruthy()
    expect(screen.getByText('localhost:54393')).toBeTruthy()
    expect(screen.getByText('available')).toBeTruthy()
    expect(screen.getByRole('link', { name: '打开 网页预览' }).getAttribute('href')).toBe('http://localhost:54393')
  })

  it('renders unsafe hrefs as text without an open link', () => {
    render(
      <ResourceCard
        resource={{
          href: 'javascript:alert(1)',
          id: 'resource-1',
          kind: 'document',
          title: 'Unsafe doc',
        }}
      />,
    )

    expect(screen.getByText('Unsafe doc')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '打开 Unsafe doc' })).toBeNull()
  })
})
```

Create `packages/ui/src/components/turn-action-rail.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TurnActionRail } from './turn-action-rail'

afterEach(() => cleanup())

describe('turn action rail', () => {
  it('renders quiet turn actions and invokes callbacks', () => {
    const onCopy = vi.fn()
    render(<TurnActionRail actions={[{ id: 'copy', label: 'Copy', onClick: onCopy }, { id: 'quote', label: 'Quote' }]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Quote' })).toBeTruthy()
  })

  it('renders safe href actions as links and disabled actions as disabled buttons', () => {
    render(<TurnActionRail actions={[{ href: 'https://example.test/source', id: 'source', label: 'Source' }, { disabled: true, id: 'quote', label: 'Quote' }]} />)

    expect(screen.getByRole('link', { name: 'Source' }).getAttribute('href')).toBe('https://example.test/source')
    expect(screen.getByRole('button', { name: 'Quote' })).toBeDisabled()
  })
})
```

Append to `packages/ui/src/components/chat-thread.test.tsx`:

```tsx
it('renders resource cards and turn actions as first-class transcript items', () => {
  render(
    <ChatThread
      ariaLabel="Conversation"
      turns={[{
        id: 'inv-1',
        items: [
          {
            id: 'resource-item',
            kind: 'resource-card',
            resource: {
              href: 'http://localhost:54393',
              id: 'resource-1',
              kind: 'web',
              location: 'localhost:54393',
              title: '网页预览',
            },
          },
          {
            actions: [{ id: 'copy', label: 'Copy' }],
            id: 'actions',
            kind: 'turn-action-rail',
          },
        ],
      }]}
    />,
  )

  expect(screen.getByText('网页预览')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  expect(document.querySelector('[data-transcript-slot="resource-card"]')).toBeTruthy()
  expect(document.querySelector('[data-transcript-slot="turn-action-rail"]')).toBeTruthy()
})
```

- [ ] **Step 2: Run primitive tests to verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/resource-card.test.tsx src/components/turn-action-rail.test.tsx src/components/chat-thread.test.tsx
```

Expected: FAIL because `ResourceCard` and `TurnActionRail` do not exist and `ChatThread` does not render the new item kinds.

- [ ] **Step 3: Create `ResourceCard`**

Create `packages/ui/src/components/resource-card.tsx`:

```tsx
import type { TranscriptResourceKind, TranscriptResourceModel } from './transcript-types'

import { Badge, BadgeLabel } from '#components/badge'
import { Button } from '#components/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '#components/item'
import { cn } from '#lib/utils'
import {
  File02Icon,
  Folder01Icon,
  Globe02Icon,
  Image02Icon,
  Link04Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export interface ResourceCardProps {
  className?: string
  resource: TranscriptResourceModel
}

export function ResourceCard({ className, resource }: ResourceCardProps) {
  const href = normalizeResourceHref(resource.href)
  const title = stringifyResourceLabel(resource.title)

  return (
    <Item
      data-transcript-slot="resource-card"
      data-resource-kind={resource.kind}
      variant="muted"
      size="sm"
      className={cn('min-w-0 border-border/70 bg-muted/25 shadow-none', className)}
    >
      <ItemMedia variant="icon" aria-hidden="true">
        <HugeiconsIcon icon={iconForResourceKind(resource.kind)} strokeWidth={2} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="max-w-full">
          {resource.title}
        </ItemTitle>
        <ItemDescription className="max-w-full line-clamp-none">
          <span>{labelForResourceKind(resource.kind)}</span>
          {resource.location ? <span>{' · '}{resource.location}</span> : null}
        </ItemDescription>
      </ItemContent>
      {resource.status
        ? (
            <Badge variant="outline">
              <BadgeLabel>{resource.status}</BadgeLabel>
            </Badge>
          )
        : null}
      {href
        ? (
            <ItemActions>
              <Button asChild type="button" variant="ghost" size="sm" aria-label={`打开 ${title}`}>
                <a href={href} target="_blank" rel="noreferrer">
                  <HugeiconsIcon icon={Link04Icon} strokeWidth={2} aria-hidden="true" />
                  {resource.actionLabel ?? '打开'}
                </a>
              </Button>
            </ItemActions>
          )
        : null}
    </Item>
  )
}

export function normalizeResourceHref(href: string | undefined) {
  if (!href)
    return undefined
  const value = href.trim()
  if (!value || /[\u0000-\u001F\u007F]/.test(value))
    return undefined
  try {
    const url = new URL(value, 'https://aiworker.local')
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return value
  }
  catch {
    return undefined
  }
  return undefined
}

function stringifyResourceLabel(value: TranscriptResourceModel['title']): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'resource'
}

function labelForResourceKind(kind: TranscriptResourceKind): string {
  if (kind === 'web')
    return '网站'
  if (kind === 'browser')
    return '浏览器'
  if (kind === 'directory')
    return '目录'
  if (kind === 'document')
    return '文档'
  if (kind === 'image')
    return '图片'
  if (kind === 'file')
    return '文件'
  return '资源'
}

function iconForResourceKind(kind: TranscriptResourceKind) {
  if (kind === 'web' || kind === 'browser')
    return Globe02Icon
  if (kind === 'directory')
    return Folder01Icon
  if (kind === 'image')
    return Image02Icon
  return File02Icon
}
```

- [ ] **Step 4: Create `TurnActionRail`**

Create `packages/ui/src/components/turn-action-rail.tsx`:

```tsx
import type { TranscriptTurnActionModel } from './transcript-types'

import { Button } from '#components/button'
import { cn } from '#lib/utils'

export interface TurnActionRailProps {
  actions: TranscriptTurnActionModel[]
  className?: string
}

export function TurnActionRail({ actions, className }: TurnActionRailProps) {
  if (actions.length === 0)
    return null

  return (
    <div data-transcript-slot="turn-action-rail" className={cn('flex min-w-0 items-center gap-1 pt-1 text-muted-foreground', className)}>
      {actions.map(action => (
        action.href && !action.disabled
          ? (
              <Button key={action.id} asChild variant="ghost" size="sm">
                <a href={action.href} target="_blank" rel="noreferrer">{action.label}</a>
              </Button>
            )
          : (
              <Button
                key={action.id}
                type="button"
                variant="ghost"
                size="sm"
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Wire `ChatThread` item rendering**

In `packages/ui/src/components/chat-thread.tsx`, import the new primitives:

```tsx
import { ResourceCard } from './resource-card'
import { TurnActionRail } from './turn-action-rail'
```

Add these branches inside `TranscriptItem` before `status`:

```tsx
if (item.kind === 'resource-card')
  return <ResourceCard resource={item.resource} />

if (item.kind === 'turn-action-rail')
  return <TurnActionRail actions={item.actions} />
```

- [ ] **Step 6: Run primitive tests to verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/resource-card.test.tsx src/components/turn-action-rail.test.tsx src/components/chat-thread.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add packages/ui/src/components/resource-card.tsx packages/ui/src/components/resource-card.test.tsx packages/ui/src/components/turn-action-rail.tsx packages/ui/src/components/turn-action-rail.test.tsx packages/ui/src/components/chat-thread.tsx packages/ui/src/components/chat-thread.test.tsx
git commit -m "feat(ui): add session resource and action primitives"
```

### Task 3: Upgrade P0 Assistant Markdown Rendering

**Files:**
- Modify: `packages/ui/src/components/assistant-markdown.tsx`
- Test: `packages/ui/src/components/assistant-markdown.test.tsx`

- [ ] **Step 1: Write failing P0 rendering tests**

Add to `packages/ui/src/components/assistant-markdown.test.tsx`:

```tsx
it('renders headings, nested lists and task lists with stable transcript semantics', () => {
  render(
    <AssistantMarkdown
      markdown={[
        '### Composer 状态',
        '',
        '- [x] Ready: 输入目标',
        '- [ ] Streaming: 保持跟随',
        '  - nested item',
        '',
        '1. First',
        '   1. Child',
      ].join('\n')}
    />,
  )

  expect(screen.getByRole('heading', { level: 3, name: 'Composer 状态' })).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: 'Ready: 输入目标' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Streaming: 保持跟随' })).not.toBeChecked()
  expect(screen.getByText('nested item')).toBeTruthy()
  expect(screen.getByText('Child')).toBeTruthy()
})

it('renders typed links and safe bare localhost urls', () => {
  render(<AssistantMarkdown markdown="Open [docs](https://example.com/docs) and http://localhost:54393/report now." />)

  expect(screen.getByRole('link', { name: 'docs' }).getAttribute('href')).toBe('https://example.com/docs')
  expect(screen.getByRole('link', { name: 'http://localhost:54393/report' }).getAttribute('href')).toBe('http://localhost:54393/report')
  expect(screen.getAllByTestId('assistant-link-icon')).toHaveLength(2)
})

it('renders inline semantic tokens for code, paths, branches and commands', () => {
  render(<AssistantMarkdown markdown="Run `bun test`, inspect docs/runtime.md, then check codex/aiworker-refactor-dev-loop." />)

  expect(screen.getByText('bun test').getAttribute('data-inline-token-kind')).toBe('code')
  expect(screen.getByText('docs/runtime.md').getAttribute('data-inline-token-kind')).toBe('path')
  expect(screen.getByText('codex/aiworker-refactor-dev-loop').getAttribute('data-inline-token-kind')).toBe('branch')
})
```

- [ ] **Step 2: Run markdown tests to verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/assistant-markdown.test.tsx
```

Expected: FAIL because heading/task-list/nested-list/autolink/semantic token behavior is missing.

- [ ] **Step 3: Extend parser block types**

In `packages/ui/src/components/assistant-markdown.tsx`, update `MarkdownBlock`:

```ts
type MarkdownBlock
  = | { code: string, kind: 'code', language?: string }
    | { depth: number, items: MarkdownListItem[], kind: 'ordered-list' | 'task-list' | 'unordered-list' }
    | { depth: 1 | 2 | 3 | 4, kind: 'heading', text: string }
    | { kind: 'paragraph', text: string }
    | { kind: 'quote', text: string }

interface MarkdownListItem {
  checked?: boolean
  id: string
  text: string
}
```

- [ ] **Step 4: Add parser cases for headings, tasks and indentation**

Add helpers near `parseMarkdownBlocks`:

```ts
function headingMatch(line: string): { depth: 1 | 2 | 3 | 4, text: string } | null {
  const match = /^(#{1,4})\s+(.+)$/.exec(line)
  if (!match)
    return null
  return { depth: match[1]!.length as 1 | 2 | 3 | 4, text: match[2]!.trim() }
}

function listDepth(line: string): number {
  const leading = /^(\s*)/.exec(line)?.[1].length ?? 0
  return Math.min(3, Math.floor(leading / 2))
}

function taskListMatch(line: string): { checked: boolean, text: string } | null {
  const match = /^\s*[-*]\s+\[([ xX])]\s+(.+)$/.exec(line)
  if (!match)
    return null
  return { checked: match[1]!.toLowerCase() === 'x', text: match[2]! }
}
```

Inside the parse loop, before quote/list handling, add:

```ts
const heading = headingMatch(line)
if (heading) {
  blocks.push({ ...heading, kind: 'heading' })
  index += 1
  continue
}

const task = taskListMatch(line)
if (task) {
  const depth = listDepth(line)
  const items: MarkdownListItem[] = []
  while (index < lines.length) {
    const current = lines[index] ?? ''
    const currentTask = taskListMatch(current)
    if (!currentTask)
      break
    items.push({
      checked: currentTask.checked,
      id: `task-line-${index}`,
      text: currentTask.text,
    })
    index += 1
  }
  blocks.push({ depth, items, kind: 'task-list' })
  continue
}
```

When pushing ordered or unordered list blocks, include `depth: listDepth(line)`.

- [ ] **Step 5: Render headings, tasks and semantic inline tokens**

Add these render branches in `renderBlock`:

```tsx
if (block.kind === 'heading') {
  const HeadingTag = `h${block.depth}` as 'h1' | 'h2' | 'h3' | 'h4'
  return (
    <HeadingTag key={`heading-${index}`} className="text-sm/relaxed font-semibold text-foreground">
      {renderInlineMarkdown(block.text, `heading-${index}`)}
    </HeadingTag>
  )
}

if (block.kind === 'task-list') {
  return (
    <ul key={`task-${index}`} className="space-y-1 pl-1" data-transcript-slot="assistant-task-list">
      {block.items.map(item => (
        <li key={item.id} className="flex min-w-0 items-start gap-2">
          <input type="checkbox" checked={item.checked} readOnly aria-label={item.text} className="mt-1 size-3.5" />
          <span className="min-w-0">{renderInlineMarkdown(item.text, item.id)}</span>
        </li>
      ))}
    </ul>
  )
}
```

Update existing list class names:

```tsx
className={cn('space-y-1', block.kind === 'ordered-list' ? 'list-decimal' : 'list-disc', block.depth > 0 ? 'pl-8' : 'pl-5')}
```

Inside `renderInlineMarkdown`, after explicit markdown link handling and before inline code handling, add bare URL handling:

```tsx
const bareUrl = matchBareUrlAt(text, index)
if (bareUrl) {
  flushText()
  nodes.push(
    <a
      key={`${keyPrefix}-bare-link-${index}`}
      href={bareUrl.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-baseline gap-1 rounded bg-muted/50 px-1 py-0.5 underline-offset-4 hover:text-primary"
    >
      <span data-testid="assistant-link-icon" aria-hidden="true">↗</span>
      {bareUrl.href}
    </a>,
  )
  index = bareUrl.end
  continue
}
```

Replace inline code node with:

```tsx
nodes.push(<InlineSemanticToken key={`${keyPrefix}-code-${index}`} kind="code">{text.slice(index + 1, closeIndex)}</InlineSemanticToken>)
```

Before adding each plain character to `buffer`, test for semantic token spans:

```ts
const semanticToken = matchSemanticTokenAt(text, index)
if (semanticToken) {
  flushText()
  nodes.push(<InlineSemanticToken key={`${keyPrefix}-token-${index}`} kind={semanticToken.kind}>{semanticToken.text}</InlineSemanticToken>)
  index = semanticToken.end
  continue
}
```

Add helper component and matchers:

```tsx
function InlineSemanticToken({ children, kind }: { children: ReactNode, kind: 'branch' | 'code' | 'path' }) {
  return (
    <code
      data-inline-token-kind={kind}
      className="rounded bg-muted/70 px-1 py-0.5 font-mono text-xs text-foreground"
    >
      {children}
    </code>
  )
}

function matchBareUrlAt(text: string, index: number): { end: number, href: string } | null {
  const rest = text.slice(index)
  const match = /^https?:\/\/[^\s)]+/.exec(rest)
  if (!match)
    return null
  return { end: index + match[0].length, href: match[0] }
}

function matchSemanticTokenAt(text: string, index: number): { end: number, kind: 'branch' | 'path', text: string } | null {
  const rest = text.slice(index)
  const branch = /^codex\/[A-Za-z0-9._/-]+/.exec(rest)
  if (branch)
    return { end: index + branch[0].length, kind: 'branch', text: branch[0] }
  const path = /^(?:\.{0,2}\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+\.[A-Za-z0-9]+/.exec(rest)
  if (path)
    return { end: index + path[0].length, kind: 'path', text: path[0] }
  return null
}
```

- [ ] **Step 6: Run markdown tests to verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/assistant-markdown.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add packages/ui/src/components/assistant-markdown.tsx packages/ui/src/components/assistant-markdown.test.tsx
git commit -m "feat(ui): enrich assistant transcript markdown"
```

### Task 4: Make Transcript Activity And Command Objects Feel Lightweight

**Files:**
- Modify: `packages/ui/src/components/command-block.tsx`
- Modify: `packages/ui/src/components/command-block.test.tsx`
- Modify: `packages/ui/src/components/transcript-activity-group.tsx`
- Modify: `packages/ui/src/components/transcript-activity-group.test.tsx`

- [ ] **Step 1: Write failing visual-behavior tests**

Append to `packages/ui/src/components/command-block.test.tsx`:

```tsx
it('uses compact transcript chrome without heavy card treatment', () => {
  const { container } = render(<CommandBlock command="bun test" output="ok" status="succeeded" title="Run tests" />)
  const block = container.querySelector('[data-transcript-slot="command-block"]')

  expect(block?.className).toContain('bg-muted/20')
  expect(block?.className).toContain('shadow-none')
  expect(block?.className).not.toContain('bg-card')
})
```

Append to `packages/ui/src/components/transcript-activity-group.test.tsx`:

```tsx
it('summarizes succeeded activities quietly while keeping failed details open', () => {
  const { rerender } = render(
    <TranscriptActivityGroup
      summary="2 activities"
      activities={[
        { id: 'read', status: 'succeeded', title: 'Read files' },
        { id: 'search', status: 'succeeded', title: 'Search code' },
      ]}
    />,
  )

  expect(screen.getByRole('button', { name: 'Toggle activity details' }).getAttribute('aria-expanded')).toBe('false')

  rerender(
    <TranscriptActivityGroup
      summary="2 activities"
      activities={[
        { id: 'read', status: 'succeeded', title: 'Read files' },
        { command: { command: 'bun test', output: 'failed', status: 'failed' }, id: 'test', status: 'failed', title: 'Run tests' },
      ]}
    />,
  )

  expect(screen.getByRole('button', { name: 'Toggle activity details' }).getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText('failed')).toBeTruthy()
})
```

- [ ] **Step 2: Run command/activity tests to verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/command-block.test.tsx src/components/transcript-activity-group.test.tsx
```

Expected: FAIL on the compact chrome assertion before style changes.

- [ ] **Step 3: Tune command block material**

In `packages/ui/src/components/command-block.tsx`, change the figure class to:

```tsx
className={cn(
  'min-w-0 overflow-hidden rounded-md border border-border/70 bg-muted/20 text-xs/relaxed shadow-none',
  status === 'failed' && 'border-destructive/40 bg-destructive/5',
  className,
)}
```

Change the figcaption class to:

```tsx
<figcaption className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5">
```

Change the command `pre` class to:

```tsx
'overflow-x-auto px-3 py-2 font-mono text-foreground'
```

Change output `pre` class to:

```tsx
'max-h-72 overflow-auto border-t border-border/70 px-3 py-2 font-mono text-muted-foreground'
```

- [ ] **Step 4: Tune activity group material**

In `packages/ui/src/components/transcript-activity-group.tsx`, change the root class to:

```tsx
className={cn('min-w-0 rounded-md border border-border/70 bg-muted/15 shadow-none', className)}
```

Change trigger class to:

```tsx
className="h-9 w-full justify-between px-3 text-muted-foreground hover:text-foreground"
```

Change content class to:

```tsx
<CollapsibleContent id={contentId} className="border-t border-border/70 p-2">
```

- [ ] **Step 5: Run command/activity tests to verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/command-block.test.tsx src/components/transcript-activity-group.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add packages/ui/src/components/command-block.tsx packages/ui/src/components/command-block.test.tsx packages/ui/src/components/transcript-activity-group.tsx packages/ui/src/components/transcript-activity-group.test.tsx
git commit -m "feat(ui): refine transcript activity rhythm"
```

### Task 5: Build SessionTimeline And ComposerDock

**Files:**
- Create: `apps/worker-web/src/worker/studio/chat/session-timeline.tsx`
- Create: `apps/worker-web/src/worker/studio/chat/session-timeline.test.tsx`
- Create: `apps/worker-web/src/worker/studio/chat/session-composer-dock.tsx`
- Create: `apps/worker-web/src/worker/studio/chat/session-composer-dock.test.tsx`
- Modify: `apps/worker-web/src/worker/studio/chat/chat-transcript.tsx`
- Modify: `apps/worker-web/src/worker/studio/chat/chat-composer.tsx`

- [ ] **Step 1: Write failing SessionTimeline tests**

Create `apps/worker-web/src/worker/studio/chat/session-timeline.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SessionTimeline } from './session-timeline'

afterEach(() => cleanup())

describe('session timeline', () => {
  it('renders elapsed status above the transcript without replacing rich turn items', () => {
    render(
      <SessionTimeline
        ariaLabel="Session transcript"
        elapsedLabel="已处理 1m 2s"
        turns={[{
          id: 'inv-1',
          items: [
            { id: 'answer', kind: 'assistant-markdown', markdown: 'Answer with **detail**.' },
            {
              id: 'resource',
              kind: 'resource-card',
              resource: { id: 'resource-1', kind: 'web', title: '网页预览' },
            },
            { actions: [{ id: 'copy', label: 'Copy' }], id: 'actions', kind: 'turn-action-rail' },
          ],
        }]}
      />,
    )

    expect(screen.getByText('已处理 1m 2s')).toBeTruthy()
    expect(screen.getByText('detail').tagName).toBe('STRONG')
    expect(screen.getByText('网页预览')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Write failing ComposerDock tests**

Create `apps/worker-web/src/worker/studio/chat/session-composer-dock.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionComposerDock } from './session-composer-dock'

const labels = {
  ariaLabel: 'Session input',
  attachment: {
    add: 'Add material',
    closePreview: 'Close preview',
    count: (count: number) => `${count} attachments`,
    imagePreview: 'Preview image',
    remove: (name: string) => `Remove ${name}`,
  },
  placeholder: '要求后续变更',
  submitAriaLabel: 'Send',
  stopAriaLabel: 'Stop invocation',
}

afterEach(() => cleanup())

describe('session composer dock', () => {
  it('shows send while idle and stop while running without permissions context or model controls', () => {
    const onSubmitDraft = vi.fn()
    const onStop = vi.fn()
    const { rerender } = render(
      <SessionComposerDock labels={labels} onSubmitDraft={onSubmitDraft} state="idle" />,
    )

    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(screen.queryByText(/权限|context|模型|5\.5|超高/)).toBeNull()

    rerender(<SessionComposerDock labels={labels} onStop={onStop} onSubmitDraft={onSubmitDraft} state="running" />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop invocation' }))

    expect(onStop).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/权限|context|模型|5\.5|超高/)).toBeNull()
  })

  it('keeps the composer available after completed failed and cancelled states', () => {
    for (const state of ['completed', 'failed', 'cancelled'] as const) {
      const { unmount } = render(<SessionComposerDock labels={labels} onSubmitDraft={vi.fn()} state={state} />)
      expect(screen.getByPlaceholderText('要求后续变更')).not.toBeDisabled()
      unmount()
    }
  })
})
```

- [ ] **Step 3: Run new app tests to verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' test -- src/worker/studio/chat/session-timeline.test.tsx src/worker/studio/chat/session-composer-dock.test.tsx
```

Expected: FAIL because the new components do not exist.

- [ ] **Step 4: Create `SessionTimeline`**

Create `apps/worker-web/src/worker/studio/chat/session-timeline.tsx`:

```tsx
import type { TranscriptTurnModel } from '@zonease/aiworker-ui/components/transcript-types'
import type { ReactNode } from 'react'

import { ChatThread } from '@zonease/aiworker-ui/components/chat-thread'

export interface SessionTimelineProps {
  ariaLabel: string
  elapsedLabel?: ReactNode
  emptyState?: ReactNode
  loading?: boolean
  turns: TranscriptTurnModel[]
}

export function SessionTimeline({ ariaLabel, elapsedLabel, emptyState, loading = false, turns }: SessionTimelineProps) {
  return (
    <div data-session-slot="timeline" className="grid min-w-0 gap-4">
      {elapsedLabel
        ? (
            <div data-session-slot="timeline-elapsed" className="border-b border-border/70 pb-2 text-sm text-muted-foreground">
              {elapsedLabel}
            </div>
          )
        : null}
      <ChatThread ariaLabel={ariaLabel} emptyState={emptyState} loading={loading} turns={turns} />
    </div>
  )
}
```

- [ ] **Step 5: Create `SessionComposerDock`**

Create `apps/worker-web/src/worker/studio/chat/session-composer-dock.tsx`:

```tsx
import type { ManagedSessionComposerAttachmentLabels, ManagedSessionComposerDraft } from '@zonease/aiworker-ui/components/managed-session-composer'

import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/managed-session-composer'
import { Cancel01Icon, MailSend02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export type SessionComposerDockState = 'cancelled' | 'completed' | 'failed' | 'idle' | 'running' | 'submitting'

export interface SessionComposerDockLabels {
  ariaLabel: string
  attachment: ManagedSessionComposerAttachmentLabels
  placeholder?: string
  stopAriaLabel: string
  submitAriaLabel: string
}

export interface SessionComposerDockProps {
  focusRequestToken?: number
  labels: SessionComposerDockLabels
  onStop?: () => void
  onSubmitDraft: (draft: ManagedSessionComposerDraft) => Promise<void> | void
  state: SessionComposerDockState
}

export function SessionComposerDock({ focusRequestToken, labels, onStop, onSubmitDraft, state }: SessionComposerDockProps) {
  const running = state === 'running' || state === 'submitting'
  return (
    <div data-session-slot="composer-dock" data-composer-state={state} className="rounded-2xl border border-border/70 bg-muted/45 p-2 shadow-lg shadow-background/30">
      <ManagedSessionComposer
        ariaLabel={labels.ariaLabel}
        attachmentLabels={labels.attachment}
        focusRequestToken={focusRequestToken}
        placeholder={labels.placeholder}
        submitAriaLabel={running ? labels.stopAriaLabel : labels.submitAriaLabel}
        submitIcon={<HugeiconsIcon icon={running ? Cancel01Icon : MailSend02Icon} strokeWidth={2} aria-hidden="true" />}
        submitTitle={running ? labels.stopAriaLabel : labels.submitAriaLabel}
        onSubmitDraft={async (draft) => {
          if (running) {
            onStop?.()
            return
          }
          await onSubmitDraft(draft)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 6: Update `ChatTranscript` to use `SessionTimeline`**

In `apps/worker-web/src/worker/studio/chat/chat-transcript.tsx`, replace the `ChatThread` import with `SessionTimeline`:

```tsx
import { SessionTimeline } from './session-timeline'
```

Replace the return line:

```tsx
return (
  <SessionTimeline
    ariaLabel={ariaLabel}
    emptyState={emptyState}
    loading={loading && turns.length === 0}
    turns={turns}
  />
)
```

- [ ] **Step 7: Update `ChatComposer` to delegate dock state**

In `apps/worker-web/src/worker/studio/chat/chat-composer.tsx`, import `SessionComposerDock` and add props:

```ts
import type { SessionComposerDockState } from './session-composer-dock'
import { SessionComposerDock } from './session-composer-dock'

export interface ChatComposerLabels {
  ariaLabel: string
  attachment: ManagedSessionComposerAttachmentLabels
  stopAriaLabel?: string
  submitAriaLabel: string
  placeholder?: string
}

export interface ChatComposerProps {
  focusRequestToken?: number
  labels: ChatComposerLabels
  onSubmitted?: (submission: { invocationId: string, text: string }) => void
  onStop?: () => void
  sessionId: string
  state?: SessionComposerDockState
}
```

Replace the returned component:

```tsx
return (
  <SessionComposerDock
    focusRequestToken={focusRequestToken}
    labels={{ ...labels, stopAriaLabel: labels.stopAriaLabel ?? 'Stop invocation' }}
    onStop={onStop}
    state={state ?? 'idle'}
    onSubmitDraft={async (draft) => {
      const input = sessionDraftToInvocationInput(draft)
      if (input.length === 0)
        return
      const result = await submitSessionInvocation(sessionId, { input, waitForCompletion: false })
      onSubmitted?.({ invocationId: result.invocation.id, text: sessionDraftToDisplayText(draft) })
    }}
  />
)
```

- [ ] **Step 8: Run app tests to verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' test -- src/worker/studio/chat/session-timeline.test.tsx src/worker/studio/chat/session-composer-dock.test.tsx src/worker/studio/chat/chat-transcript.test.tsx src/worker/studio/chat/chat-composer.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

```bash
git add apps/worker-web/src/worker/studio/chat/session-timeline.tsx apps/worker-web/src/worker/studio/chat/session-timeline.test.tsx apps/worker-web/src/worker/studio/chat/session-composer-dock.tsx apps/worker-web/src/worker/studio/chat/session-composer-dock.test.tsx apps/worker-web/src/worker/studio/chat/chat-transcript.tsx apps/worker-web/src/worker/studio/chat/chat-composer.tsx apps/worker-web/src/worker/studio/chat/chat-transcript.test.tsx apps/worker-web/src/worker/studio/chat/chat-composer.test.tsx
git commit -m "feat(worker-web): add session timeline and composer dock"
```

### Task 6: Wire ChatSurface Lifecycle, Stickiness, And Removed-Control Guardrails

**Files:**
- Modify: `apps/worker-web/src/worker/studio/chat/chat-surface.tsx`
- Modify: `apps/worker-web/src/worker/studio/chat/chat-surface.test.tsx`

- [ ] **Step 1: Write failing ChatSurface lifecycle tests**

Add to `apps/worker-web/src/worker/studio/chat/chat-surface.test.tsx`:

```tsx
it('shows optimistic submit, starting feedback, streaming output, resource card and action rail in one session surface', async () => {
  const invocation = {
    id: 'invocation-1',
    sessionId: 'session-1',
    seq: 1,
    engineId: 'codex',
    engineCommand: null,
    status: 'running',
    processState: 'running',
    projectionReceiptId: null,
    externalSessionRef: null,
    rawLogRef: null,
    eventLogRef: null,
    failureCode: null,
    inputRef: 'input-1',
    summary: null,
    error: null,
    metadataJson: {},
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  }
  mockFetchSessionDetail({ events: [], invocations: [], session: sessionFixture })
  mockSubmitSessionInvocation({ events: [], files: [], invocation, session: sessionFixture })
  mockInvocationEvents([
    { id: 1, invocationId: 'invocation-1', sessionId: 'session-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'invocation.started' }, createdAt: '2026-06-05T00:00:01.000Z' },
    { id: 2, invocationId: 'invocation-1', sessionId: 'session-1', seq: 2, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'Hello **there**.' } }, createdAt: '2026-06-05T00:00:02.000Z' },
    { id: 3, invocationId: 'invocation-1', sessionId: 'session-1', seq: 3, type: 'artifact', payloadJson: { bridgeEvent: 'resource.observed', resource: { href: 'http://localhost:54393', kind: 'web', title: '网页预览' } }, createdAt: '2026-06-05T00:00:03.000Z' },
    { id: 4, invocationId: 'invocation-1', sessionId: 'session-1', seq: 4, type: 'status', payloadJson: { bridgeEvent: 'invocation.completed' }, createdAt: '2026-06-05T00:00:04.000Z' },
  ], { ...invocation, status: 'succeeded' })

  render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)
  await userEvent.type(screen.getByRole('textbox', { name: composerLabels.ariaLabel }), 'Build this')
  await userEvent.click(screen.getByRole('button', { name: composerLabels.submitAriaLabel }))

  expect(await screen.findByText('Build this')).toBeTruthy()
  expect(await screen.findByText('Invocation completed')).toBeTruthy()
  expect(await screen.findByText('there')).toBeTruthy()
  expect(await screen.findByText('网页预览')).toBeTruthy()
  expect(await screen.findByRole('button', { name: 'Copy' })).toBeTruthy()
})

it('does not render permissions context remaining or model strength controls in the session composer', async () => {
  mockFetchSessionDetail({ events: [], invocations: [], session: sessionFixture })

  render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

  expect(await screen.findByRole('textbox', { name: composerLabels.ariaLabel })).toBeTruthy()
  expect(screen.queryByText(/权限|完全访问|context|剩余|模型|5\.5|超高/)).toBeNull()
})
```

- [ ] **Step 2: Run ChatSurface tests to verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' test -- src/worker/studio/chat/chat-surface.test.tsx
```

Expected: FAIL until `ChatSurface` passes composer state and rich transcript items through the new components.

- [ ] **Step 3: Add composer state derivation**

In `apps/worker-web/src/worker/studio/chat/chat-surface.tsx`, add:

```ts
type ActiveInvocationState = 'cancelled' | 'completed' | 'failed' | 'idle' | 'running' | 'submitting'

function composerStateForInvocation(active: { invocationId: string, text: string } | null, latestInvocation: LocalEngineInvocation | null): ActiveInvocationState {
  if (!active)
    return 'idle'
  if (!latestInvocation || latestInvocation.id !== active.invocationId)
    return 'submitting'
  if (latestInvocation.status === 'succeeded')
    return 'completed'
  if (latestInvocation.status === 'failed' || latestInvocation.status === 'lost')
    return 'failed'
  if (latestInvocation.status === 'cancelled')
    return 'cancelled'
  return 'running'
}
```

Pass state into `ChatComposer`:

```tsx
const composerState = composerStateForInvocation(active, latestInvocation)

const composer = (
  <ChatComposer
    focusRequestToken={composerFocusRequestToken}
    labels={composerLabels}
    state={composerState}
    onSubmitted={(submission) => {
      setActive(submission)
      setComposerFocusRequestToken(token => (token ?? 0) + 1)
    }}
    sessionId={sessionId}
  />
)
```

- [ ] **Step 4: Preserve stick-to-latest and no-scroll-steal behavior**

Keep the existing `transcriptShouldStickToLatestRef`, `MutationObserver`, `isTranscriptNearLatest`, and `scrollTranscriptToLatest` logic. Do not replace the reversed scroll container during this task. If a test needs an assertion, use the existing test `does not force a manually scrolled transcript back to the bottom during streaming mutations`.

- [ ] **Step 5: Run ChatSurface tests to verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' test -- src/worker/studio/chat/chat-surface.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run package-local UI and worker-web focused tests**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/assistant-markdown.test.tsx src/components/resource-card.test.tsx src/components/turn-action-rail.test.tsx src/components/chat-thread.test.tsx src/components/artifact-strip.test.tsx src/components/command-block.test.tsx src/components/transcript-activity-group.test.tsx src/components/session-composer.test.tsx
```

Expected: PASS.

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' test -- src/worker/studio/chat/bridge-event-mapper.test.ts src/worker/studio/chat/session-timeline.test.tsx src/worker/studio/chat/session-composer-dock.test.tsx src/worker/studio/chat/chat-transcript.test.tsx src/worker/studio/chat/chat-composer.test.tsx src/worker/studio/chat/chat-surface.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add apps/worker-web/src/worker/studio/chat/chat-surface.tsx apps/worker-web/src/worker/studio/chat/chat-surface.test.tsx
git commit -m "feat(worker-web): wire codex-like session surface states"
```

### Task 7: Final Verification, Browser Proof, And Code Review Graph

**Files:**
- Verify: `packages/ui`
- Verify: `apps/worker-web`
- Verify: Browser at the active Worker Web URL

- [ ] **Step 1: Run package typechecks**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' typecheck
```

Expected: PASS.

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' typecheck
```

Expected: PASS.

- [ ] **Step 2: Run package tests**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/assistant-markdown.test.tsx src/components/resource-card.test.tsx src/components/turn-action-rail.test.tsx src/components/chat-thread.test.tsx src/components/artifact-strip.test.tsx src/components/command-block.test.tsx src/components/transcript-activity-group.test.tsx src/components/session-composer.test.tsx
```

Expected: PASS.

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' test -- src/worker/studio/chat/bridge-event-mapper.test.ts src/worker/studio/chat/session-timeline.test.tsx src/worker/studio/chat/session-composer-dock.test.tsx src/worker/studio/chat/chat-transcript.test.tsx src/worker/studio/chat/chat-composer.test.tsx src/worker/studio/chat/chat-surface.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run worker-web lint or build quality gate**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' lint
```

Expected: PASS.

Run:

```bash
bun run --filter '@zonease/aiworker-worker-web' build
```

Expected: PASS, including `check:studio-css`.

- [ ] **Step 4: Verify local dev stack**

Run:

```bash
bun run dev:status
```

Expected: daemon healthy on the configured API port and Vite worker-web reachable. If the web service is not running, start the canonical dev stack:

```bash
bun run dev
```

Keep the dev server running for browser proof.

- [ ] **Step 5: Browser proof on desktop viewport**

Open the active Worker Web URL in the in-app Browser. Exercise this flow:

```text
1. Open an existing workspace session or create a new session.
2. Submit a request that causes assistant streaming and at least one tool/progress event.
3. Confirm user turn appears immediately.
4. Confirm starting feedback appears within 300ms of submit.
5. Confirm assistant markdown streams without whole-block replacement.
6. Confirm activity/tool summary stays visually secondary.
7. Confirm failed command or failed tool expands and keeps output evidence.
8. Confirm resource card appears for a browser/file/document reference when such an event is present.
9. Confirm turn action rail appears after assistant output.
10. Confirm completed state returns composer to continue input.
11. Refresh the page and confirm historical transcript uses the same visual language.
12. Confirm no permissions, context remaining, model, strength, "5.5", or "超高" controls are visible.
```

Capture one screenshot under `tmp/` with a descriptive filename, for example:

```text
tmp/codex-like-session-surface-desktop.png
```

- [ ] **Step 6: Browser proof on mobile viewport**

Use the Browser viewport controls or Playwright if the Browser skill exposes viewport sizing. Confirm:

```text
1. Transcript text does not overlap.
2. Composer stays attached to the bottom area.
3. Resource card title and action fit within the column.
4. Command output scrolls horizontally or wraps only when wrap is enabled.
5. Turn action rail remains reachable.
```

Capture:

```text
tmp/codex-like-session-surface-mobile.png
```

- [ ] **Step 7: Run code-review-graph**

Run:

```bash
bun run crg:update
```

Expected: command exits 0.

Run:

```bash
bun run crg:review
```

Expected: no blocking findings. If findings appear, address them with focused tests or document why the finding does not apply in the final response.

- [ ] **Step 8: Final diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

Run:

```bash
git status --short
```

Expected: only intended source/test files and screenshot evidence if screenshots are intentionally kept untracked. Do not stage screenshots unless the user asks for artifact files in git.

- [ ] **Step 9: Final commit**

If Task 7 required code fixes, commit them:

```bash
git add packages/ui/src/components apps/worker-web/src/worker/studio/chat
git commit -m "fix(worker-web): harden codex-like session surface"
```

If Task 7 made no code changes after Task 6, do not create an empty commit.

## Plan Self-Review Notes

- Spec coverage: Task 1 covers timeline VM and mapper; Tasks 2-4 cover P0 rich rendering; Task 5 covers SessionTimeline and ComposerDock; Task 6 covers ChatSurface wiring and removed-control guardrails; Task 7 covers browser proof, package tests, visual checks, and code-review-graph.
- Boundary coverage: the plan keeps follow-up submission on `submitSessionInvocation(sessionId, { input, waitForCompletion: false })`, keeps Worker Web ownership, and avoids Host/Soul UI.
- Removed controls: Task 5 and Task 6 explicitly assert absence of permissions, context remaining, model, strength, `5.5`, and `超高`.
- Redaction: Task 1 asserts raw tool args and secret-like values do not enter transcript items.
