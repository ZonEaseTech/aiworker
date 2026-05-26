# Chat View Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build reusable `packages/ui` chat/transcript rendering primitives with friendly activity grouping, command blocks, markdown, streaming placeholders, artifact strips and legacy compatibility.

**Architecture:** Keep the renderer fully generic: consumers pass an already-normalized view model, while `packages/ui` only renders turn/message/activity/command/markdown/artifact shapes. Do not bind the components to Host ownership, app ownership, workspace/session routing, engine parsing or domain workflow semantics. Keep each component small, shadcn-first and independently testable.

**Tech Stack:** Bun workspaces, TypeScript, React 19, Vitest/happy-dom, Testing Library, shadcn-managed `@zonease/aiworker-ui` primitives, Hugeicons, Tailwind CSS v4 semantic tokens.

---

## File Structure

- Create `packages/ui/src/components/transcript-types.ts`
  - Owns generic transcript view-model types and small summary helpers.
  - Imports only `ReactNode`.
- Create `packages/ui/src/components/assistant-markdown.tsx`
  - Owns the first-pass markdown renderer and streaming markdown repair.
  - Supports paragraph, bold, italic, inline code, fenced code, lists, links and blockquote.
- Create `packages/ui/src/components/assistant-markdown.test.tsx`
  - Covers markdown syntax and streaming fence repair.
- Create `packages/ui/src/components/command-block.tsx`
  - Owns command/output display, copy action, wrap toggle and long-output collapse.
- Create `packages/ui/src/components/command-block.test.tsx`
  - Covers copy, wrap, expansion and failure state.
- Create `packages/ui/src/components/artifact-strip.tsx`
  - Owns generic artifact references without domain interpretation.
- Create `packages/ui/src/components/artifact-strip.test.tsx`
  - Covers status labels, action slots and nested-card avoidance.
- Create `packages/ui/src/components/streaming-placeholder.tsx`
  - Owns stable loading/prework placeholder UI.
- Create `packages/ui/src/components/streaming-placeholder.test.tsx`
  - Covers `aria-live`, minimum-height class and label rendering.
- Create `packages/ui/src/components/transcript-activity-group.tsx`
  - Owns activity grouping and accessible collapse controls.
- Create `packages/ui/src/components/transcript-activity-group.test.tsx`
  - Covers collapsed defaults, failure visibility and details.
- Create `packages/ui/src/components/chat-thread.tsx`
  - Owns `ChatThread` and `TranscriptTurn` composition over generic items.
- Create `packages/ui/src/components/chat-thread.test.tsx`
  - Covers turn rendering, collapsed history, item composition and boundary language.
- Modify `packages/ui/src/components/session-thread.test.tsx`
  - Keep the existing compatibility test and add a lightweight assertion that legacy `SessionThread` still does not nest cards.
- Do not modify `apps/web`, `apps/aiworker-*`, `packages/shared`, API, storage, engine adapters or Soul App manifests in this plan.

## Task 1: PMA Tracking

**Files:**
- Create: `docs/task/TODO-048.md`
- Modify: `docs/task/index.md`
- Create: `docs/plan/PLAN-418.md`
- Modify: `docs/plan/index.md`

- [ ] **Step 1: Create the task record**

Create `docs/task/TODO-048.md` with this content:

```markdown
# TODO-048 Build generic chat view rendering primitives

- **status**: in-progress
- **priority**: P2
- **owner**: Codex
- **createdAt**: 2026-05-26
- **relatesTo**: packages/ui

## Context

The current shared `SessionThread` is a linear message list. Chat-like product
surfaces need reusable, friendly transcript primitives for turns, activity
groups, command blocks, markdown, streaming placeholders and artifact
references.

## Boundary

This task belongs to `packages/ui` reusable primitives. It must not describe
workspace, session, chat or transcript as Host-owned product surfaces. Consumers
provide generic view models; the shared components only render them.

## Acceptance

- Generic chat/transcript renderer primitives exist under `packages/ui`.
- The renderer supports activity grouping, command blocks, assistant markdown,
  streaming placeholders and artifact strips.
- Legacy `SessionThread` compatibility remains intact.
- Focused UI tests, typecheck, UI governance and code-review-graph pass.
```

- [ ] **Step 2: Append the task index line**

Append this line at the end of `docs/task/index.md` under `## Tasks`:

```markdown
- [-] [**TODO-048 Build generic chat view rendering primitives**](TODO-048.md) `P2`
```

- [ ] **Step 3: Create the plan record**

Create `docs/plan/PLAN-418.md` with this content:

```markdown
# PLAN-418 Generic chat view rendering primitives

- **status**: approved
- **owner**: Codex
- **createdAt**: 2026-05-26
- **relatedTask**: TODO-048
- **superpowersSpec**: docs/superpowers/specs/2026-05-26-chat-view-rendering-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-26-chat-view-rendering.md

## Context

The approved design adds generic `packages/ui` chat/transcript rendering
primitives inspired by Codex Desktop's information hierarchy while keeping the
AIWorker boundary intact.

## Proposal

1. Add generic transcript view-model types.
2. Add assistant markdown rendering with a small supported syntax set.
3. Add command block, streaming placeholder and artifact strip primitives.
4. Add activity grouping and turn composition primitives.
5. Preserve legacy `SessionThread` compatibility.
6. Verify with focused tests, typecheck, UI governance and code-review-graph.

## Verification

- `bun run --filter '@zonease/aiworker-ui' test`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run ui:check`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`
```

- [ ] **Step 4: Append the plan index line**

Append this line at the end of `docs/plan/index.md` under `## Plans`:

```markdown
- [-] [**PLAN-418 Generic chat view rendering primitives**](PLAN-418.md) `2026-05-26`
```

- [ ] **Step 5: Commit tracking docs**

Run:

```bash
git add docs/task/TODO-048.md docs/task/index.md docs/plan/PLAN-418.md docs/plan/index.md
git commit -m "docs: 跟踪通用 chat view 渲染组件"
```

Expected: commit succeeds with only PMA tracking files.

## Task 2: Transcript View-Model Types

**Files:**
- Create: `packages/ui/src/components/transcript-types.ts`

- [ ] **Step 1: Write the generic transcript types**

Create `packages/ui/src/components/transcript-types.ts` with this content:

```ts
import type { ReactNode } from 'react'

export type TranscriptTone = 'danger' | 'info' | 'muted' | 'warning'
export type TranscriptActivityStatus = 'failed' | 'idle' | 'running' | 'succeeded' | 'waiting'

export interface TranscriptArtifactModel {
  action?: ReactNode
  description?: ReactNode
  href?: string
  id: string
  status?: ReactNode
  title: ReactNode
}

export interface TranscriptCommandModel {
  command: string
  id?: string
  language?: string
  output?: string
  status?: TranscriptActivityStatus
  title?: ReactNode
}

export interface TranscriptActivityModel {
  command?: TranscriptCommandModel
  description?: ReactNode
  detail?: ReactNode
  id: string
  meta?: ReactNode
  status?: TranscriptActivityStatus
  title: ReactNode
}

export type TranscriptItemModel =
  | { body: ReactNode, id: string, kind: 'user-message' }
  | { id: string, kind: 'assistant-markdown', markdown: string, streaming?: boolean }
  | { activities: TranscriptActivityModel[], defaultCollapsed?: boolean, id: string, kind: 'activity-group', summary: ReactNode }
  | ({ id: string, kind: 'command' } & TranscriptCommandModel)
  | { artifacts: TranscriptArtifactModel[], id: string, kind: 'artifact-strip' }
  | { body: ReactNode, id: string, kind: 'status', tone?: TranscriptTone }
  | { id: string, kind: 'custom', node: ReactNode }

export interface TranscriptTurnModel {
  collapsed?: boolean
  id: string
  items: TranscriptItemModel[]
  meta?: ReactNode
  summary?: ReactNode
  title?: ReactNode
}

export interface TranscriptTurnSummary {
  activityCount: number
  artifactCount: number
  assistantCount: number
  commandCount: number
  itemCount: number
}

export function summarizeTranscriptTurn(turn: TranscriptTurnModel): TranscriptTurnSummary {
  return turn.items.reduce<TranscriptTurnSummary>((summary, item) => {
    summary.itemCount += 1

    if (item.kind === 'assistant-markdown')
      summary.assistantCount += 1

    if (item.kind === 'command')
      summary.commandCount += 1

    if (item.kind === 'activity-group') {
      summary.activityCount += item.activities.length
      summary.commandCount += item.activities.filter(activity => activity.command).length
    }

    if (item.kind === 'artifact-strip')
      summary.artifactCount += item.artifacts.length

    return summary
  }, {
    activityCount: 0,
    artifactCount: 0,
    assistantCount: 0,
    commandCount: 0,
    itemCount: 0,
  })
}
```

- [ ] **Step 2: Run typecheck for the new type file**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' typecheck
```

Expected: PASS. If it fails because the package was already failing before this task, capture the pre-existing error and stop for review.

- [ ] **Step 3: Commit the type contract**

Run:

```bash
git add packages/ui/src/components/transcript-types.ts
git commit -m "feat: 添加通用 transcript 类型"
```

Expected: commit succeeds with only `transcript-types.ts`.

## Task 3: Assistant Markdown Renderer

**Files:**
- Create: `packages/ui/src/components/assistant-markdown.tsx`
- Create: `packages/ui/src/components/assistant-markdown.test.tsx`

- [ ] **Step 1: Write failing markdown tests**

Create `packages/ui/src/components/assistant-markdown.test.tsx` with this content:

```tsx
// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AssistantMarkdown, repairStreamingMarkdown } from './assistant-markdown'

afterEach(() => cleanup())

describe('AssistantMarkdown', () => {
  it('renders common assistant markdown syntax', () => {
    render(
      <AssistantMarkdown
        markdown={[
          'Hello **bold** and *italic* with `inline` code.',
          '',
          '- first',
          '- second',
          '',
          '> quoted',
          '',
          '[docs](https://example.com)',
          '',
          '```ts',
          'const value = 1',
          '```',
        ].join('\n')}
      />,
    )

    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
    expect(screen.getByText('inline').tagName).toBe('CODE')
    expect(screen.getByRole('list')).toBeTruthy()
    expect(screen.getByText('quoted')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com')
    expect(within(screen.getByTestId('assistant-code-block')).getByText('const value = 1')).toBeTruthy()
  })

  it('repairs incomplete streaming fences before rendering', () => {
    expect(repairStreamingMarkdown('```ts\nconst value = 1', true)).toBe('```ts\nconst value = 1\n```')
    expect(repairStreamingMarkdown('**bold', true)).toBe('**bold**')
    expect(repairStreamingMarkdown('*italic', true)).toBe('*italic*')
    expect(repairStreamingMarkdown('`inline', true)).toBe('`inline`')
  })
})
```

- [ ] **Step 2: Run the markdown tests and verify they fail**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/assistant-markdown.test.tsx
```

Expected: FAIL because `assistant-markdown.tsx` does not exist.

- [ ] **Step 3: Implement the markdown renderer**

Create `packages/ui/src/components/assistant-markdown.tsx` with this content:

```tsx
import type { ReactNode } from 'react'

import { cn } from '#lib/utils'

export interface AssistantMarkdownProps {
  className?: string
  markdown: string
  streaming?: boolean
}

type MarkdownBlock =
  | { code: string, kind: 'code', language?: string }
  | { items: string[], kind: 'ordered-list' | 'unordered-list' }
  | { kind: 'paragraph', text: string }
  | { kind: 'quote', text: string }

export function AssistantMarkdown({ className, markdown, streaming = false }: AssistantMarkdownProps) {
  const repaired = repairStreamingMarkdown(markdown, streaming)
  const blocks = parseMarkdownBlocks(repaired)

  return (
    <div data-chat-slot="assistant-markdown" className={cn('min-w-0 space-y-3 text-sm/relaxed text-foreground', className)}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  )
}

export function repairStreamingMarkdown(markdown: string, streaming: boolean): string {
  if (!streaming)
    return markdown

  let repaired = markdown
  const fenceCount = (repaired.match(/```/g) ?? []).length
  if (fenceCount % 2 === 1)
    repaired = `${repaired}\n\`\`\``

  const withoutFences = repaired.replace(/```[\s\S]*?```/g, '')
  const inlineBacktickCount = (withoutFences.match(/`/g) ?? []).length
  if (inlineBacktickCount % 2 === 1)
    repaired = `${repaired}\``

  const strongCount = (withoutFences.match(/\*\*/g) ?? []).length
  if (strongCount % 2 === 1)
    repaired = `${repaired}**`

  const emphasisCount = countSingleAsterisks(withoutFences)
  if (emphasisCount % 2 === 1)
    repaired = `${repaired}*`

  return repaired
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || undefined
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length)
        index += 1
      blocks.push({ code: codeLines.join('\n'), kind: 'code', language })
      continue
    }

    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (index < lines.length && (lines[index] ?? '').startsWith('>')) {
        quoteLines.push((lines[index] ?? '').replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ kind: 'quote', text: quoteLines.join('\n') })
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      blocks.push({ items, kind: 'unordered-list' })
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      blocks.push({ items, kind: 'ordered-list' })
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length
      && (lines[index] ?? '').trim()
      && !(lines[index] ?? '').startsWith('```')
      && !(lines[index] ?? '').startsWith('>')
      && !/^\s*[-*]\s+/.test(lines[index] ?? '')
      && !/^\s*\d+\.\s+/.test(lines[index] ?? '')
    ) {
      paragraphLines.push(lines[index] ?? '')
      index += 1
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join('\n') })
  }

  return blocks
}

function renderBlock(block: MarkdownBlock, index: number): ReactNode {
  if (block.kind === 'code') {
    return (
      <figure key={`code-${index}`} data-chat-slot="assistant-code-block" data-testid="assistant-code-block" className="overflow-hidden rounded-md border border-border bg-muted/40">
        {block.language ? <figcaption className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{block.language}</figcaption> : null}
        <pre className="overflow-x-auto p-3 text-xs/relaxed" dir="ltr"><code>{block.code}</code></pre>
      </figure>
    )
  }

  if (block.kind === 'quote')
    return <blockquote key={`quote-${index}`} className="border-l-2 border-border pl-3 text-muted-foreground">{renderInlineMarkdown(block.text, `quote-${index}`)}</blockquote>

  if (block.kind === 'ordered-list')
    return <ol key={`ol-${index}`} className="list-decimal space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `ol-${index}-${itemIndex}`)}</li>)}</ol>

  if (block.kind === 'unordered-list')
    return <ul key={`ul-${index}`} className="list-disc space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `ul-${index}-${itemIndex}`)}</li>)}</ul>

  return <p key={`p-${index}`} className="whitespace-pre-wrap">{renderInlineMarkdown(block.text, `p-${index}`)}</p>
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex)
      nodes.push(text.slice(lastIndex, match.index))

    if (match[2] && match[3]) {
      nodes.push(<a key={`${keyPrefix}-link-${match.index}`} href={match[3]} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-primary">{match[2]}</a>)
    }
    else if (match[4]) {
      nodes.push(<code key={`${keyPrefix}-code-${match.index}`} className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em]">{match[4]}</code>)
    }
    else if (match[5]) {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`} className="font-semibold">{match[5]}</strong>)
    }
    else if (match[6]) {
      nodes.push(<em key={`${keyPrefix}-em-${match.index}`}>{match[6]}</em>)
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length)
    nodes.push(text.slice(lastIndex))

  return nodes
}

function countSingleAsterisks(text: string): number {
  return [...text.matchAll(/(^|[^*])\*([^*]|$)/g)].length
}
```

- [ ] **Step 4: Run markdown tests and typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/assistant-markdown.test.tsx
bun run --filter '@zonease/aiworker-ui' typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit markdown renderer**

Run:

```bash
git add packages/ui/src/components/assistant-markdown.tsx packages/ui/src/components/assistant-markdown.test.tsx
git commit -m "feat: 添加 assistant markdown 渲染组件"
```

Expected: commit succeeds with only markdown component files.

## Task 4: Command Block

**Files:**
- Create: `packages/ui/src/components/command-block.tsx`
- Create: `packages/ui/src/components/command-block.test.tsx`

- [ ] **Step 1: Write failing command block tests**

Create `packages/ui/src/components/command-block.test.tsx` with this content:

```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CommandBlock } from './command-block'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CommandBlock', () => {
  it('renders command metadata and toggles output visibility', () => {
    render(<CommandBlock command="bun test" language="bash" output="ok" title="Run tests" />)

    expect(screen.getByText('Run tests')).toBeTruthy()
    expect(screen.getByText('bash')).toBeTruthy()
    expect(screen.getByText('bun test')).toBeTruthy()
    expect(screen.getByText('ok')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse command output' }))
    expect(screen.queryByText('ok')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand command output' }))
    expect(screen.getByText('ok')).toBeTruthy()
  })

  it('copies command text and toggles wrapping', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<CommandBlock command="rg SessionThread packages/ui" output="match" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }))
    expect(writeText).toHaveBeenCalledWith('rg SessionThread packages/ui')

    fireEvent.click(screen.getByRole('button', { name: 'Wrap command output' }))
    expect(screen.getByTestId('command-output')).toHaveAttribute('data-wrapped', 'true')
  })

  it('marks failed commands without hiding the evidence', () => {
    render(<CommandBlock command="bun test" output="failed" status="failed" />)

    expect(screen.getByText('failed')).toBeTruthy()
    expect(screen.getByText('failed').closest('[data-command-status="failed"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run command block tests and verify they fail**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/command-block.test.tsx
```

Expected: FAIL because `command-block.tsx` does not exist.

- [ ] **Step 3: Implement `CommandBlock`**

Create `packages/ui/src/components/command-block.tsx` with this content:

```tsx
import type { ReactNode } from 'react'
import type { TranscriptActivityStatus } from './transcript-types'

import { Badge, BadgeLabel } from '#components/badge'
import { Button } from '#components/button'
import { cn } from '#lib/utils'
import { useState } from 'react'

export interface CommandBlockProps {
  className?: string
  command: string
  defaultExpanded?: boolean
  language?: string
  output?: string
  status?: TranscriptActivityStatus
  title?: ReactNode
}

export function CommandBlock({
  className,
  command,
  defaultExpanded = true,
  language = 'shell',
  output,
  status = 'idle',
  title,
}: CommandBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [wrapped, setWrapped] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasOutput = Boolean(output)

  async function copyCommand() {
    if (!navigator.clipboard)
      return
    await navigator.clipboard.writeText(command)
    setCopied(true)
  }

  return (
    <figure
      data-chat-slot="command-block"
      data-command-status={status}
      className={cn(
        'min-w-0 overflow-hidden rounded-md border border-border bg-muted/30 text-xs/relaxed',
        status === 'failed' && 'border-destructive/40 bg-destructive/5',
        className,
      )}
    >
      <figcaption className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">{title ?? 'Command'}</span>
          <Badge variant={status === 'failed' ? 'destructive' : 'outline'}>
            <BadgeLabel>{language}</BadgeLabel>
          </Badge>
          {status === 'failed' ? <Badge variant="destructive"><BadgeLabel>failed</BadgeLabel></Badge> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" aria-label="Copy command" onClick={copyCommand}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button type="button" variant="ghost" size="sm" aria-label="Wrap command output" onClick={() => setWrapped(value => !value)}>
            Wrap
          </Button>
          {hasOutput
            ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={expanded ? 'Collapse command output' : 'Expand command output'}
                  aria-expanded={expanded}
                  onClick={() => setExpanded(value => !value)}
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </Button>
              )
            : null}
        </div>
      </figcaption>
      <pre className={cn('overflow-x-auto p-3 font-mono', wrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre')} dir="ltr"><code>{command}</code></pre>
      {hasOutput && expanded
        ? (
            <pre
              data-testid="command-output"
              data-wrapped={wrapped ? 'true' : 'false'}
              className={cn('max-h-72 overflow-auto border-t border-border p-3 font-mono text-muted-foreground', wrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre')}
              dir="ltr"
            >
              <code>{output}</code>
            </pre>
          )
        : null}
    </figure>
  )
}
```

- [ ] **Step 4: Run command block tests and typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/command-block.test.tsx
bun run --filter '@zonease/aiworker-ui' typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit command block**

Run:

```bash
git add packages/ui/src/components/command-block.tsx packages/ui/src/components/command-block.test.tsx
git commit -m "feat: 添加 command block 组件"
```

Expected: commit succeeds with only command block files.

## Task 5: Artifact Strip And Streaming Placeholder

**Files:**
- Create: `packages/ui/src/components/artifact-strip.tsx`
- Create: `packages/ui/src/components/artifact-strip.test.tsx`
- Create: `packages/ui/src/components/streaming-placeholder.tsx`
- Create: `packages/ui/src/components/streaming-placeholder.test.tsx`

- [ ] **Step 1: Write failing artifact and placeholder tests**

Create `packages/ui/src/components/artifact-strip.test.tsx` with this content:

```tsx
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ArtifactStrip } from './artifact-strip'

afterEach(() => cleanup())

describe('ArtifactStrip', () => {
  it('renders generic artifact references without nested cards', () => {
    const { container } = render(
      <ArtifactStrip
        artifacts={[
          { description: 'Browser evidence', id: 'evidence', status: 'available', title: 'Screenshot' },
          { action: <button type="button">Open</button>, id: 'report', title: 'Report' },
        ]}
      />,
    )

    expect(screen.getByText('Screenshot')).toBeTruthy()
    expect(screen.getByText('Browser evidence')).toBeTruthy()
    expect(screen.getByText('available')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
    expect(container.querySelector('[data-chat-slot="artifact-strip"] [data-slot="card"] [data-slot="card"]')).toBeNull()
  })
})
```

Create `packages/ui/src/components/streaming-placeholder.test.tsx` with this content:

```tsx
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StreamingPlaceholder } from './streaming-placeholder'

afterEach(() => cleanup())

describe('StreamingPlaceholder', () => {
  it('renders a stable polite loading placeholder', () => {
    render(<StreamingPlaceholder label="Preparing response" />)

    const status = screen.getByRole('status', { name: 'Preparing response' })
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status.className).toContain('min-h-')
    expect(screen.getByText('Preparing response')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run artifact and placeholder tests and verify they fail**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/artifact-strip.test.tsx src/components/streaming-placeholder.test.tsx
```

Expected: FAIL because the component files do not exist.

- [ ] **Step 3: Implement `ArtifactStrip`**

Create `packages/ui/src/components/artifact-strip.tsx` with this content:

```tsx
import type { TranscriptArtifactModel } from './transcript-types'

import { Badge, BadgeLabel } from '#components/badge'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '#components/item'
import { cn } from '#lib/utils'

export interface ArtifactStripProps {
  artifacts: TranscriptArtifactModel[]
  className?: string
}

export function ArtifactStrip({ artifacts, className }: ArtifactStripProps) {
  if (artifacts.length === 0)
    return null

  return (
    <ItemGroup data-chat-slot="artifact-strip" className={cn('grid gap-2 sm:grid-cols-2', className)}>
      {artifacts.map(artifact => (
        <Item key={artifact.id} data-chat-slot="artifact-reference" variant="muted" size="sm" className="min-w-0">
          <ItemContent className="min-w-0">
            <ItemTitle className="max-w-full">{artifact.href ? <a href={artifact.href}>{artifact.title}</a> : artifact.title}</ItemTitle>
            {artifact.description ? <ItemDescription className="max-w-full line-clamp-none">{artifact.description}</ItemDescription> : null}
          </ItemContent>
          {artifact.status ? <Badge variant="outline"><BadgeLabel>{artifact.status}</BadgeLabel></Badge> : null}
          {artifact.action ? <ItemActions>{artifact.action}</ItemActions> : null}
        </Item>
      ))}
    </ItemGroup>
  )
}
```

- [ ] **Step 4: Implement `StreamingPlaceholder`**

Create `packages/ui/src/components/streaming-placeholder.tsx` with this content:

```tsx
import type { ReactNode } from 'react'

import { Skeleton } from '#components/skeleton'
import { cn } from '#lib/utils'

export interface StreamingPlaceholderProps {
  className?: string
  label: ReactNode
}

export function StreamingPlaceholder({ className, label }: StreamingPlaceholderProps) {
  const ariaLabel = typeof label === 'string' ? label : 'Assistant response is loading'

  return (
    <div
      data-chat-slot="streaming-placeholder"
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
      className={cn('min-h-20 rounded-md border border-dashed border-border bg-muted/20 p-3', className)}
    >
      <Skeleton className="mb-3 h-3 w-2/5" />
      <Skeleton className="mb-3 h-3 w-3/5" />
      <p className="text-xs/relaxed text-muted-foreground">{label}</p>
    </div>
  )
}
```

- [ ] **Step 5: Run artifact and placeholder tests and typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/artifact-strip.test.tsx src/components/streaming-placeholder.test.tsx
bun run --filter '@zonease/aiworker-ui' typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit artifact and placeholder components**

Run:

```bash
git add packages/ui/src/components/artifact-strip.tsx packages/ui/src/components/artifact-strip.test.tsx packages/ui/src/components/streaming-placeholder.tsx packages/ui/src/components/streaming-placeholder.test.tsx
git commit -m "feat: 添加 transcript artifact 和 streaming 占位组件"
```

Expected: commit succeeds with only artifact and placeholder files.

## Task 6: Activity Group

**Files:**
- Create: `packages/ui/src/components/transcript-activity-group.tsx`
- Create: `packages/ui/src/components/transcript-activity-group.test.tsx`

- [ ] **Step 1: Write failing activity group tests**

Create `packages/ui/src/components/transcript-activity-group.test.tsx` with this content:

```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { TranscriptActivityGroup } from './transcript-activity-group'

afterEach(() => cleanup())

describe('TranscriptActivityGroup', () => {
  it('collapses successful activity details by default', () => {
    render(
      <TranscriptActivityGroup
        activities={[{ description: 'packages/ui', id: 'read', title: 'Read files' }]}
        defaultCollapsed
        summary="Explored 1 file"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle activity details' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('packages/ui')).toBeNull()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('packages/ui')).toBeTruthy()
  })

  it('keeps failed activity visible', () => {
    render(
      <TranscriptActivityGroup
        activities={[{ description: 'lint failed', id: 'lint', status: 'failed', title: 'Run lint' }]}
        defaultCollapsed
        summary="Ran 1 command"
      />,
    )

    expect(screen.getByText('lint failed')).toBeTruthy()
    expect(screen.getByText('failed')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run activity tests and verify they fail**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/transcript-activity-group.test.tsx
```

Expected: FAIL because `transcript-activity-group.tsx` does not exist.

- [ ] **Step 3: Implement activity group**

Create `packages/ui/src/components/transcript-activity-group.tsx` with this content:

```tsx
import type { ReactNode } from 'react'
import type { TranscriptActivityModel } from './transcript-types'

import { Badge, BadgeLabel } from '#components/badge'
import { Button } from '#components/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/collapsible'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '#components/item'
import { cn } from '#lib/utils'
import { useId, useState } from 'react'

import { CommandBlock } from './command-block'

export interface TranscriptActivityGroupProps {
  activities: TranscriptActivityModel[]
  className?: string
  defaultCollapsed?: boolean
  summary: ReactNode
}

export function TranscriptActivityGroup({
  activities,
  className,
  defaultCollapsed = true,
  summary,
}: TranscriptActivityGroupProps) {
  const hasFailedActivity = activities.some(activity => activity.status === 'failed')
  const [open, setOpen] = useState(hasFailedActivity || !defaultCollapsed)
  const contentId = useId()

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-chat-slot="activity-group"
      className={cn('min-w-0 rounded-md border border-border bg-muted/20', className)}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          aria-label="Toggle activity details"
          aria-controls={contentId}
          aria-expanded={open}
          className="h-9 w-full justify-between px-3"
        >
          <span className="min-w-0 truncate text-left">{summary}</span>
          <Badge variant={hasFailedActivity ? 'destructive' : 'outline'}><BadgeLabel>{activities.length}</BadgeLabel></Badge>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent id={contentId} className="border-t border-border p-2">
        <ItemGroup className="gap-2">
          {activities.map(activity => (
            <Item key={activity.id} variant="default" size="sm" className={cn('min-w-0', activity.status === 'failed' && 'bg-destructive/5')}>
              <ItemContent className="min-w-0 gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ItemTitle className="min-w-0 flex-1 truncate">{activity.title}</ItemTitle>
                  {activity.status ? <Badge variant={activity.status === 'failed' ? 'destructive' : 'outline'}><BadgeLabel>{activity.status}</BadgeLabel></Badge> : null}
                  {activity.meta ? <span className="text-xs text-muted-foreground">{activity.meta}</span> : null}
                </div>
                {activity.description ? <ItemDescription className="max-w-full line-clamp-none">{activity.description}</ItemDescription> : null}
                {activity.command ? <CommandBlock {...activity.command} status={activity.command.status ?? activity.status} /> : null}
                {activity.detail ? <div className="text-xs/relaxed text-muted-foreground">{activity.detail}</div> : null}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CollapsibleContent>
    </Collapsible>
  )
}
```

- [ ] **Step 4: Run activity tests and typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/transcript-activity-group.test.tsx
bun run --filter '@zonease/aiworker-ui' typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit activity group**

Run:

```bash
git add packages/ui/src/components/transcript-activity-group.tsx packages/ui/src/components/transcript-activity-group.test.tsx
git commit -m "feat: 添加 transcript activity 分组组件"
```

Expected: commit succeeds with only activity group files.

## Task 7: Chat Thread And Turn Composition

**Files:**
- Create: `packages/ui/src/components/chat-thread.tsx`
- Create: `packages/ui/src/components/chat-thread.test.tsx`
- Modify: `packages/ui/src/components/session-thread.test.tsx`

- [ ] **Step 1: Write failing chat thread tests**

Create `packages/ui/src/components/chat-thread.test.tsx` with this content:

```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatThread } from './chat-thread'

afterEach(() => cleanup())

describe('ChatThread', () => {
  it('renders generic turn items without owning product semantics', () => {
    render(
      <ChatThread
        ariaLabel="Conversation"
        turns={[
          {
            id: 'turn-1',
            items: [
              { body: 'Please review this.', id: 'user', kind: 'user-message' },
              { activities: [{ id: 'read', title: 'Read files' }], id: 'activity', kind: 'activity-group', summary: 'Explored 1 file' },
              { id: 'answer', kind: 'assistant-markdown', markdown: 'Done with **evidence**.' },
              { artifacts: [{ id: 'artifact', title: 'Evidence' }], id: 'artifacts', kind: 'artifact-strip' },
            ],
            title: 'Turn 1',
          },
        ]}
      />,
    )

    expect(screen.getByRole('log', { name: 'Conversation' })).toBeTruthy()
    expect(screen.getByText('Please review this.')).toBeTruthy()
    expect(screen.getByText('Explored 1 file')).toBeTruthy()
    expect(screen.getByText('evidence').tagName).toBe('STRONG')
    expect(screen.getByText('Evidence')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Host-owned/i)
  })

  it('lets consumers control collapsed turns', () => {
    const onTurnCollapsedChange = vi.fn()

    render(
      <ChatThread
        ariaLabel="Conversation"
        onTurnCollapsedChange={onTurnCollapsedChange}
        turns={[
          {
            collapsed: true,
            id: 'turn-1',
            items: [{ body: 'Hidden detail', id: 'user', kind: 'user-message' }],
            summary: '1 previous message',
            title: 'Previous turn',
          },
        ]}
      />,
    )

    expect(screen.getByText('1 previous message')).toBeTruthy()
    expect(screen.queryByText('Hidden detail')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand turn Previous turn' }))
    expect(onTurnCollapsedChange).toHaveBeenCalledWith('turn-1', false)
  })
})
```

Append this test inside `describe('sessionThread', () => { ... })` in `packages/ui/src/components/session-thread.test.tsx`:

```tsx
  it('keeps legacy SessionThread as a compatibility surface', () => {
    const { container } = render(
      <SessionThread
        ariaLabel="Legacy session thread"
        messages={[
          { body: 'Legacy body', id: 'legacy-user', kind: 'user', title: 'User' },
        ]}
      />,
    )

    expect(screen.getByRole('log', { name: 'Legacy session thread' })).toBeTruthy()
    expect(screen.getByText('Legacy body')).toBeTruthy()
    expect(container.querySelector('[data-session-slot="session-thread"]')).toBeTruthy()
  })
```

- [ ] **Step 2: Run chat thread tests and verify they fail**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/chat-thread.test.tsx src/components/session-thread.test.tsx
```

Expected: FAIL because `chat-thread.tsx` does not exist.

- [ ] **Step 3: Implement `ChatThread` and `TranscriptTurn`**

Create `packages/ui/src/components/chat-thread.tsx` with this content:

```tsx
import type { ReactNode } from 'react'
import type { TranscriptItemModel, TranscriptTurnModel } from './transcript-types'

import { Button } from '#components/button'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '#components/item'
import { cn } from '#lib/utils'

import { ArtifactStrip } from './artifact-strip'
import { AssistantMarkdown } from './assistant-markdown'
import { CommandBlock } from './command-block'
import { StreamingPlaceholder } from './streaming-placeholder'
import { TranscriptActivityGroup } from './transcript-activity-group'
import { summarizeTranscriptTurn } from './transcript-types'

export interface ChatThreadProps {
  ariaLabel: string
  className?: string
  onTurnCollapsedChange?: (turnId: string, collapsed: boolean) => void
  turns: TranscriptTurnModel[]
}

export function ChatThread({ ariaLabel, className, onTurnCollapsedChange, turns }: ChatThreadProps) {
  return (
    <ItemGroup data-chat-slot="chat-thread" role="log" aria-label={ariaLabel} className={cn('min-w-0 gap-3', className)}>
      {turns.map(turn => (
        <TranscriptTurn key={turn.id} onCollapsedChange={onTurnCollapsedChange} turn={turn} />
      ))}
    </ItemGroup>
  )
}

export interface TranscriptTurnProps {
  onCollapsedChange?: (turnId: string, collapsed: boolean) => void
  turn: TranscriptTurnModel
}

export function TranscriptTurn({ onCollapsedChange, turn }: TranscriptTurnProps) {
  const summary = turn.summary ?? createDefaultTurnSummary(turn)
  const title = turn.title ?? 'Turn'

  return (
    <section data-chat-slot="transcript-turn" data-collapsed={turn.collapsed ? 'true' : undefined} className="min-w-0 rounded-md border border-border bg-background">
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs/relaxed font-medium">{title}</h3>
          {turn.collapsed ? <p className="truncate text-xs/relaxed text-muted-foreground">{summary}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {turn.meta ? <div className="text-xs text-muted-foreground">{turn.meta}</div> : null}
          {onCollapsedChange
            ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${turn.collapsed ? 'Expand' : 'Collapse'} turn ${stringifyNode(title)}`}
                  aria-expanded={!turn.collapsed}
                  onClick={() => onCollapsedChange(turn.id, !turn.collapsed)}
                >
                  {turn.collapsed ? 'Expand' : 'Collapse'}
                </Button>
              )
            : null}
        </div>
      </header>
      {turn.collapsed
        ? null
        : (
            <div className="grid min-w-0 gap-3 p-3">
              {turn.items.map(item => <TranscriptItem key={item.id} item={item} />)}
            </div>
          )}
    </section>
  )
}

function TranscriptItem({ item }: { item: TranscriptItemModel }) {
  if (item.kind === 'user-message')
    return <Item data-chat-slot="user-message" variant="muted" className="min-w-0"><ItemContent><ItemDescription className="max-w-full line-clamp-none text-foreground">{item.body}</ItemDescription></ItemContent></Item>

  if (item.kind === 'assistant-markdown')
    return item.streaming && !item.markdown.trim() ? <StreamingPlaceholder label="Preparing response" /> : <AssistantMarkdown markdown={item.markdown} streaming={item.streaming} />

  if (item.kind === 'activity-group')
    return <TranscriptActivityGroup activities={item.activities} defaultCollapsed={item.defaultCollapsed} summary={item.summary} />

  if (item.kind === 'command')
    return <CommandBlock command={item.command} language={item.language} output={item.output} status={item.status} title={item.title} />

  if (item.kind === 'artifact-strip')
    return <ArtifactStrip artifacts={item.artifacts} />

  if (item.kind === 'status')
    return <Item data-chat-slot="status-message" variant="muted" className={cn('min-w-0', item.tone === 'danger' && 'bg-destructive/5')}><ItemContent><ItemDescription className="max-w-full line-clamp-none">{item.body}</ItemDescription></ItemContent></Item>

  return <div data-chat-slot="custom-item" className="min-w-0">{item.node}</div>
}

function createDefaultTurnSummary(turn: TranscriptTurnModel): ReactNode {
  const summary = summarizeTranscriptTurn(turn)
  return `${summary.itemCount} items, ${summary.activityCount} activities, ${summary.artifactCount} artifacts`
}

function stringifyNode(node: ReactNode): string {
  return typeof node === 'string' || typeof node === 'number' ? String(node) : 'item'
}
```

- [ ] **Step 4: Run chat tests and typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/chat-thread.test.tsx src/components/session-thread.test.tsx
bun run --filter '@zonease/aiworker-ui' typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit chat thread composition**

Run:

```bash
git add packages/ui/src/components/chat-thread.tsx packages/ui/src/components/chat-thread.test.tsx packages/ui/src/components/session-thread.test.tsx
git commit -m "feat: 添加通用 chat thread 组合组件"
```

Expected: commit succeeds with chat thread files and the legacy compatibility test update.

## Task 8: Focused Verification And UI Governance

**Files:**
- Read: `packages/ui/components.json`
- Read: `packages/ui/src/styles/globals.css`
- Read: touched component files

- [ ] **Step 1: Run the complete `packages/ui` test suite**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test
```

Expected: PASS.

- [ ] **Step 2: Run focused UI typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' typecheck
```

Expected: PASS.

- [ ] **Step 3: Run UI governance**

Run:

```bash
bun run ui:check
```

Expected: PASS. If the check reports app-local class, radius, token or icon issues in touched files, fix those issues before continuing.

- [ ] **Step 4: Run repository diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace or conflict-marker errors.

- [ ] **Step 5: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: both commands complete. Address any concrete finding that applies to the touched files before continuing.

- [ ] **Step 6: Commit verification fixes if any were needed**

If Steps 1-5 required fixes, commit only those fixes:

```bash
git add packages/ui/src/components docs/task docs/plan
git commit -m "fix: 收口 chat view 渲染组件验证问题"
```

Expected: commit succeeds only when there were actual fixes. If no fixes were needed, skip this commit.

## Task 9: PMA Closeout

**Files:**
- Modify: `docs/task/TODO-048.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-418.md`
- Modify: `docs/plan/index.md`

- [ ] **Step 1: Mark task detail completed**

Update the front matter block in `docs/task/TODO-048.md` to:

```markdown
- **status**: completed
- **priority**: P2
- **owner**: Codex
- **createdAt**: 2026-05-26
- **completedAt**: 2026-05-26
- **relatesTo**: packages/ui
```

- [ ] **Step 2: Mark task index completed**

Change the `TODO-048` line in `docs/task/index.md` to:

```markdown
- [x] [**TODO-048 Build generic chat view rendering primitives**](TODO-048.md) `P2`
```

- [ ] **Step 3: Mark plan detail completed**

Update the metadata block in `docs/plan/PLAN-418.md` to:

```markdown
- **status**: completed
- **owner**: Codex
- **createdAt**: 2026-05-26
- **completedAt**: 2026-05-26
- **relatedTask**: TODO-048
- **superpowersSpec**: docs/superpowers/specs/2026-05-26-chat-view-rendering-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-26-chat-view-rendering.md
```

Append this section to `docs/plan/PLAN-418.md`:

```markdown
## Completion Summary

Generic chat/transcript rendering primitives were added under `packages/ui`.
The components render generic view models for turns, activity groups, command
blocks, assistant markdown, streaming placeholders and artifact references
without owning workspace/session/chat product semantics. Legacy `SessionThread`
compatibility remains intact.
```

- [ ] **Step 4: Mark plan index completed**

Change the `PLAN-418` line in `docs/plan/index.md` to:

```markdown
- [x] [**PLAN-418 Generic chat view rendering primitives**](PLAN-418.md) `2026-05-26`
```

- [ ] **Step 5: Commit PMA closeout**

Run:

```bash
git add docs/task/TODO-048.md docs/task/index.md docs/plan/PLAN-418.md docs/plan/index.md
git commit -m "docs: 完成通用 chat view 渲染组件跟踪"
```

Expected: commit succeeds with only PMA tracking closeout files.

## Final Verification

Before reporting completion, run:

```bash
bun run --filter '@zonease/aiworker-ui' test
bun run --filter '@zonease/aiworker-ui' typecheck
bun run ui:check
bun run crg:update
bun run crg:review
git diff --check
```

Expected: all commands pass, or any pre-existing unrelated failure is documented with exact output and why it is unrelated.

## Boundary Checklist

- The new components live in `packages/ui`.
- The components do not import `apps/web`, `apps/aiworker-*`, `packages/shared`, storage, API, engine or Soul App internals.
- The components do not call APIs or parse raw engine events.
- The components do not describe workspace/session/chat/transcript as Host-owned product surfaces.
- Activity labels and domain copy come from consumer-provided view models.
- Icons, spacing, radius and colors follow `packages/ui` shadcn semantic conventions.
