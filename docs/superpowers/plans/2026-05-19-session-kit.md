# Session Kit Shared Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract AIWorker session composer, action bar, attachment handling, timeline view models and reusable detail shells into `packages/component`, then migrate generic Worker Web and HR People Workbench consumers.

**Architecture:** The shared package owns UI + view-model helpers only. Host Web and Soul Apps pass controlled props, labels, options and callbacks; they keep API calls, streaming, routing and domain semantics.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4, Testing Library, Radix-backed shared primitives, package-owned CSS in `@zonease/aiworker-component/styles.css`.

---

## File Structure

- Create `packages/component/src/patterns/session-view-model.ts`: neutral types and helpers for attachment material conversion, file labels, event normalization and timeline grouping.
- Create `packages/component/src/patterns/session-composer.tsx`: `SessionComposer`, `SessionComposerActionBar`, `SessionAttachmentList` and related prop types.
- Create `packages/component/src/patterns/session-timeline.tsx`: `SessionTimeline` rendering normalized turns/events through existing message primitives.
- Create `packages/component/src/patterns/session-detail.tsx`: `SessionDetailPanel` and generic detail section shells.
- Modify `packages/component/src/patterns/index.ts`: export Session Kit components and types.
- Modify `packages/component/src/index.ts`: keep root package exports flowing through `patterns`.
- Modify `packages/component/src/styles/patterns.css`: add Session Kit styles and move shared composer/action-bar CSS here.
- Modify `packages/component/src/catalog.ts`: mark Session Kit components implemented and remove obsolete migration entries when covered.
- Modify `packages/component/src/patterns/patterns.test.tsx`: cover helpers and shared components.
- Modify `apps/web/src/features/local-workspace/components/session-composer.tsx`: turn the existing generic composer into a thin adapter over `SessionComposer`.
- Modify `apps/web/src/worker/session-chat.tsx`: consume `SessionTimeline`, shared event helpers and compact `SessionComposer`.
- Modify `apps/web/src/worker/session-detail.tsx`: consume `SessionDetailPanel` and shared compact composer where applicable.
- Modify `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`: consume shared composer/action bar/attachment helpers.
- Modify CSS files under `apps/web/src/styles/` and HR workbench CSS only to remove now-shared local rules.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`: assert generic and HR consumers still work.
- Modify PMA docs and changelog as implementation status changes.

---

### Task 1: Add Session Kit View-Model Helpers

**Files:**
- Create: `packages/component/src/patterns/session-view-model.ts`
- Modify: `packages/component/src/patterns/patterns.test.tsx`

- [ ] **Step 1: Write helper tests**

Add tests to `packages/component/src/patterns/patterns.test.tsx`:

```tsx
import {
  createComposerAttachment,
  createSessionTimelineViewModel,
  formatSessionAttachmentKind,
  formatSessionAttachmentSize,
  normalizeSessionEvents,
} from '.'

it('formats and reads composer attachments without domain language', async () => {
  const file = new File(['hello'], 'resume.md', { type: 'text/markdown' })
  const material = await createComposerAttachment(file)

  expect(material).toMatchObject({
    content: 'hello',
    encoding: 'utf8',
    mimeType: 'text/markdown',
    name: 'resume.md',
    size: 5,
  })
  expect(formatSessionAttachmentKind(file)).toBe('MD')
  expect(formatSessionAttachmentSize(1536)).toBe('1.5 KB')
})

it('normalizes session events and groups them by turn', () => {
  const events = normalizeSessionEvents([
    { id: 'e1', payloadJson: { agentEvent: { kind: 'text', text: 'Hi' } }, seq: 1, turnId: 'turn-1', type: 'assistant_delta' },
    { id: 'e2', payloadJson: { path: 'artifact.md' }, seq: 2, turnId: 'turn-1', type: 'artifact' },
    { id: 'e3', payloadJson: { message: 'boom' }, seq: 3, turnId: 'turn-2', type: 'error' },
  ])
  const viewModel = createSessionTimelineViewModel({
    events,
    turns: [
      { createdAt: '2026-05-19T00:00:00Z', id: 'turn-1', input: 'Start', response: null, seq: 1, status: 'running', updatedAt: '2026-05-19T00:00:00Z' },
      { createdAt: '2026-05-19T00:01:00Z', id: 'turn-2', input: 'Continue', response: null, seq: 2, status: 'failed', updatedAt: '2026-05-19T00:01:00Z' },
    ],
  })

  expect(viewModel.turns[0]?.events.map(event => event.kind)).toEqual(['text', 'artifact'])
  expect(viewModel.turns[1]?.events[0]?.kind).toBe('error')
})
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx
```

Expected: fails because the new Session Kit helpers are not exported.

- [ ] **Step 3: Implement helper module**

Create `packages/component/src/patterns/session-view-model.ts`:

```ts
export type SessionComposerMaterialEncoding = 'base64' | 'utf8'

export interface SessionComposerMaterial {
  content: string
  encoding: SessionComposerMaterialEncoding
  mimeType: string
  name: string
  size: number
}

export interface SessionTimelineEventInput {
  id: number | string
  payloadJson?: unknown
  seq?: number
  turnId?: null | string
  type: string
}

export type SessionTimelineEvent
  = | { detail?: string, id: string, kind: 'status', label: string }
    | { id: string, kind: 'text', text: string }
    | { id: string, kind: 'thinking', text: string }
    | { id: string, input: unknown, kind: 'tool_use', name: string, toolUseId: string }
    | { content: string, id: string, isError?: boolean, kind: 'tool_result', name?: string, toolUseId: string }
    | { costUsd?: number, id: string, inputTokens?: number, kind: 'usage', outputTokens?: number }
    | { chunk: string, id: string, kind: 'log', stream: 'stderr' | 'stdout' }
    | { id: string, kind: 'raw', line: string }
    | { detail: string, id: string, kind: 'artifact' | 'lesson' | 'review' }
    | { id: string, kind: 'error', message: string }

export interface SessionTimelineTurnInput {
  createdAt?: string
  error?: null | string
  id: string
  input: string
  response?: null | string
  seq: number
  status: string
  updatedAt?: string
}

export interface SessionTimelineTurnViewModel {
  events: SessionTimelineEvent[]
  turn: SessionTimelineTurnInput
}

export async function createComposerAttachment(file: File): Promise<SessionComposerMaterial> {
  const encoding: SessionComposerMaterialEncoding = isTextLikeFile(file) ? 'utf8' : 'base64'
  return {
    content: encoding === 'utf8' ? await file.text() : arrayBufferToBase64(await file.arrayBuffer()),
    encoding,
    mimeType: file.type || 'application/octet-stream',
    name: file.name,
    size: file.size,
  }
}

export function formatSessionAttachmentKind(file: Pick<File, 'name' | 'type'>): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : ''
  return (extension || file.type.split('/').pop() || 'file').slice(0, 5).toUpperCase()
}

export function formatSessionAttachmentSize(size: number): string {
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

export function normalizeSessionEvents(events: SessionTimelineEventInput[]): SessionTimelineEvent[] {
  return events
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map(coerceTimelineEvent)
}

export function createSessionTimelineViewModel(input: {
  events: SessionTimelineEvent[]
  turns: SessionTimelineTurnInput[]
}): { turns: SessionTimelineTurnViewModel[] } {
  const eventsByTurn = new Map<string, SessionTimelineEvent[]>()
  for (const event of input.events) {
    const turnId = 'turnId' in event ? String(event.turnId) : ''
    if (!turnId)
      continue
    const current = eventsByTurn.get(turnId) ?? []
    current.push(event)
    eventsByTurn.set(turnId, current)
  }
  return {
    turns: input.turns
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map(turn => ({
        events: compactTimelineEvents(eventsByTurn.get(turn.id) ?? fallbackResponseEvents(turn)),
        turn,
      })),
  }
}
```

Then add the private helper functions from the current `session-chat.tsx`
normalization logic, keeping them generic and free of Host imports.

- [ ] **Step 4: Export helpers**

Add exports to `packages/component/src/patterns/index.ts`:

```ts
export {
  createComposerAttachment,
  createSessionTimelineViewModel,
  formatSessionAttachmentKind,
  formatSessionAttachmentSize,
  normalizeSessionEvents,
} from './session-view-model'
export type {
  SessionComposerMaterial,
  SessionTimelineEvent,
  SessionTimelineEventInput,
  SessionTimelineTurnInput,
  SessionTimelineTurnViewModel,
} from './session-view-model'
```

- [ ] **Step 5: Run helper tests and verify they pass**

Run:

```bash
bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx
```

Expected: the helper tests pass.

---

### Task 2: Add Shared Composer And Action Bar

**Files:**
- Create: `packages/component/src/patterns/session-composer.tsx`
- Modify: `packages/component/src/patterns/index.ts`
- Modify: `packages/component/src/styles/patterns.css`
- Modify: `packages/component/src/patterns/patterns.test.tsx`

- [ ] **Step 1: Write composer component tests**

Add tests:

```tsx
it('renders session composer action bar with attachments template and submit', () => {
  const onSubmit = vi.fn(event => event.preventDefault())
  render(
    <SessionComposer
      ariaLabel="Profile draft material"
      submitAriaLabel="Generate profile draft"
      submitTitle="Generate profile draft"
      title="Complete Hiring Workspace candidate profile"
      description="Drafts stay reviewable before profile promotion."
      value="Summarize new evidence"
      onValueChange={vi.fn()}
      onSubmit={onSubmit}
      attachments={[{ id: 'a1', kind: 'MD', name: 'resume.md', removeLabel: 'Remove resume.md', size: '1 KB' }]}
      onRemoveAttachment={vi.fn()}
      onAddAttachments={vi.fn()}
      attachmentTriggerLabel="Add candidate materials"
      templateOptions={[{ label: 'Candidate profile proposal', value: 'profile-update-proposal' }]}
      selectedTemplateId="profile-update-proposal"
      onTemplateChange={vi.fn()}
    />,
  )

  expect(screen.getByRole('textbox', { name: 'Profile draft material' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Add candidate materials' })).toBeTruthy()
  expect(screen.getByRole('combobox', { name: /proposal type/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Generate profile draft' })).toBeTruthy()
  expect(screen.getByText('resume.md')).toBeTruthy()
})
```

- [ ] **Step 2: Run composer tests and verify they fail**

Run:

```bash
bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx
```

Expected: fails because `SessionComposer` is not exported.

- [ ] **Step 3: Implement `session-composer.tsx`**

Create `packages/component/src/patterns/session-composer.tsx` with:

```tsx
import type { FormEvent, ReactNode } from 'react'

import { Paperclip, SendHorizontal, X } from 'lucide-react'
import { IconButton, Select, Textarea } from '../primitives'
import { cx } from '../utils/cx'

export interface SessionComposerAttachmentItem {
  id: string
  kind: string
  name: string
  removeLabel: string
  size?: string
}

export interface SessionComposerOption {
  description?: string
  label: string
  value: string
}

export interface SessionComposerProps {
  ariaLabel: string
  attachmentTriggerLabel?: string
  attachments?: SessionComposerAttachmentItem[]
  className?: string
  description?: ReactNode
  disabled?: boolean
  disabledReason?: ReactNode
  error?: ReactNode
  onAddAttachments?: () => void
  onRemoveAttachment?: (id: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTemplateChange?: (value: string) => void
  onValueChange: (value: string) => void
  placeholder?: string
  selectedTemplateId?: string
  submitAriaLabel: string
  submitting?: boolean
  submitTitle?: string
  templateLabel?: string
  templateOptions?: SessionComposerOption[]
  title?: ReactNode
  value: string
  variant?: 'compact' | 'large' | 'panel'
}

export function SessionComposer(props: SessionComposerProps) {
  const canSubmit = !props.disabled && !props.submitting
    && (props.value.trim().length > 0 || (props.attachments?.length ?? 0) > 0)

  return (
    <form className={cx('session-composer', `session-composer-${props.variant ?? 'large'}`, props.className)} onSubmit={props.onSubmit}>
      {props.title || props.description
        ? (
            <header className="session-composer-heading">
              <div>
                {props.title ? <strong>{props.title}</strong> : null}
                {props.description ? <small>{props.description}</small> : null}
              </div>
            </header>
          )
        : null}
      <Textarea
        aria-label={props.ariaLabel}
        className="session-composer-input"
        disabled={props.disabled || props.submitting}
        placeholder={props.placeholder}
        value={props.value}
        onChange={event => props.onValueChange(event.target.value)}
      />
      <SessionAttachmentList attachments={props.attachments ?? []} onRemoveAttachment={props.onRemoveAttachment} />
      {props.error ? <div className="session-composer-warning" role="status">{props.error}</div> : null}
      {props.disabledReason ? <div className="session-composer-warning" role="status">{props.disabledReason}</div> : null}
      <SessionComposerActionBar
        attachmentCount={props.attachments?.length ?? 0}
        attachmentTriggerLabel={props.attachmentTriggerLabel}
        disabled={!canSubmit}
        onAddAttachments={props.onAddAttachments}
        onTemplateChange={props.onTemplateChange}
        selectedTemplateId={props.selectedTemplateId}
        submitAriaLabel={props.submitAriaLabel}
        submitting={props.submitting}
        submitTitle={props.submitTitle}
        templateLabel={props.templateLabel}
        templateOptions={props.templateOptions}
      />
    </form>
  )
}
```

Implement `SessionComposerActionBar` and `SessionAttachmentList` in the same
file using `IconButton`, `Select`, `Paperclip`, `SendHorizontal` and `X`.

- [ ] **Step 4: Add shared styles**

Append Session Kit styles to `packages/component/src/styles/patterns.css`:

```css
.session-composer {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.session-composer-large {
  width: min(100%, 920px);
}

.session-composer-panel {
  flex: 1 1 auto;
  min-height: 0;
}

.session-composer-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

.session-composer-heading strong {
  color: var(--text-strong);
  font-size: 17px;
  line-height: 1.25;
}

.session-composer-heading small,
.session-composer-warning {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.session-composer-input {
  width: 100%;
  min-width: 0;
  resize: vertical;
}

.session-composer-action-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
```

Add attachment row, count badge and compact select styles using existing HR
measurements as the baseline: 38px action buttons, mono option labels and
connected top-opening select support.

- [ ] **Step 5: Export components and run tests**

Add exports to `packages/component/src/patterns/index.ts`:

```ts
export { SessionAttachmentList, SessionComposer, SessionComposerActionBar } from './session-composer'
export type {
  SessionComposerAttachmentItem,
  SessionComposerOption,
  SessionComposerProps,
} from './session-composer'
```

Run:

```bash
bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx
bun run --filter '@zonease/aiworker-component' typecheck
```

Expected: pass.

---

### Task 3: Add Timeline And Detail Shared Surfaces

**Files:**
- Create: `packages/component/src/patterns/session-timeline.tsx`
- Create: `packages/component/src/patterns/session-detail.tsx`
- Modify: `packages/component/src/patterns/index.ts`
- Modify: `packages/component/src/styles/patterns.css`
- Modify: `packages/component/src/patterns/patterns.test.tsx`

- [ ] **Step 1: Write timeline/detail tests**

Add tests:

```tsx
it('renders session timeline turns and event blocks', () => {
  render(
    <SessionTimeline
      assistantRoleLabel="Agent"
      operatorRoleLabel="Operator"
      turns={[{
        events: [{ id: 'event-1', kind: 'status', label: 'file_change', detail: 'artifact.md' }],
        turn: { id: 'turn-1', input: 'Build profile', seq: 1, status: 'running' },
      }]}
    />,
  )

  expect(screen.getByText('Operator')).toBeTruthy()
  expect(screen.getByText('Build profile')).toBeTruthy()
  expect(screen.getByText('Agent')).toBeTruthy()
  expect(screen.getByText('file_change')).toBeTruthy()
})

it('renders session detail panel sections without domain meaning', () => {
  render(
    <SessionDetailPanel
      artifact={<p>Artifact preview</p>}
      eventStream={<p>Events</p>}
      review={<p>Review summary</p>}
      summary={<p>Summary</p>}
    />,
  )

  expect(screen.getByText('Artifact preview')).toBeTruthy()
  expect(screen.getByText('Review summary')).toBeTruthy()
  expect(screen.getByText('Events')).toBeTruthy()
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx
```

Expected: fails because timeline/detail exports do not exist.

- [ ] **Step 3: Implement `SessionTimeline`**

Create `packages/component/src/patterns/session-timeline.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { SessionTimelineEvent, SessionTimelineTurnViewModel } from './session-view-model'

import { AlertCircle, CheckCircle, FileText, Terminal, Wrench } from 'lucide-react'
import { MessageFlow, MessageRow, StatusEventPill, ToolResultCard } from './message-flow'
import { StudioPill } from './studio-patterns'

export interface SessionTimelineProps {
  assistantRoleLabel: ReactNode
  className?: string
  empty?: ReactNode
  operatorRoleLabel: ReactNode
  renderEvent?: (event: SessionTimelineEvent) => ReactNode
  timestampForTurn?: (turn: SessionTimelineTurnViewModel['turn']) => ReactNode
  turns: SessionTimelineTurnViewModel[]
}

export function SessionTimeline({ assistantRoleLabel, className, empty, operatorRoleLabel, renderEvent, timestampForTurn, turns }: SessionTimelineProps) {
  if (turns.length === 0)
    return <div className="session-timeline-empty">{empty}</div>
  return (
    <div className={className ? `session-timeline ${className}` : 'session-timeline'}>
      {turns.map(item => (
        <div key={item.turn.id} className="session-timeline-turn">
          <MessageRow className="session-message user" roleLabel={operatorRoleLabel} timestamp={timestampForTurn?.(item.turn)}>
            <div className="session-user-bubble">{item.turn.input}</div>
          </MessageRow>
          <MessageRow className="session-message assistant" roleLabel={assistantRoleLabel} timestamp={item.turn.status}>
            <MessageFlow className="session-assistant-flow">
              {item.events.map(event => renderEvent?.(event) ?? renderDefaultEvent(event))}
            </MessageFlow>
          </MessageRow>
        </div>
      ))}
    </div>
  )
}
```

Implement `renderDefaultEvent` by moving the generic block rendering from
`WorkerSessionChat` and keeping only generic labels such as `Usage`, `raw`,
`done` and `failed`.

- [ ] **Step 4: Implement `SessionDetailPanel`**

Create `packages/component/src/patterns/session-detail.tsx`:

```tsx
import type { ReactNode } from 'react'

export interface SessionDetailPanelProps {
  artifact?: ReactNode
  className?: string
  composer?: ReactNode
  eventStream?: ReactNode
  memory?: ReactNode
  review?: ReactNode
  summary?: ReactNode
}

export function SessionDetailPanel({ artifact, className, composer, eventStream, memory, review, summary }: SessionDetailPanelProps) {
  return (
    <div className={className ? `session-detail-panel ${className}` : 'session-detail-panel'}>
      {summary ? <section className="session-detail-section">{summary}</section> : null}
      {composer ? <section className="session-detail-section">{composer}</section> : null}
      {artifact ? <section className="session-detail-section">{artifact}</section> : null}
      {review ? <section className="session-detail-section">{review}</section> : null}
      {memory ? <section className="session-detail-section">{memory}</section> : null}
      {eventStream ? <section className="session-detail-section">{eventStream}</section> : null}
    </div>
  )
}
```

- [ ] **Step 5: Export and style timeline/detail**

Export in `packages/component/src/patterns/index.ts`:

```ts
export { SessionTimeline } from './session-timeline'
export type { SessionTimelineProps } from './session-timeline'
export { SessionDetailPanel } from './session-detail'
export type { SessionDetailPanelProps } from './session-detail'
```

Add CSS for `.session-timeline`, `.session-message`, `.session-user-bubble`,
`.session-detail-panel` and `.session-detail-section` in
`packages/component/src/styles/patterns.css`, reusing existing token values from
`session-chat.css` and `artifact.css`.

- [ ] **Step 6: Run shared package gates**

Run:

```bash
bun run --filter '@zonease/aiworker-component' test
bun run --filter '@zonease/aiworker-component' typecheck
```

Expected: pass.

---

### Task 4: Update Component Catalog

**Files:**
- Modify: `packages/component/src/catalog.ts`
- Modify: `packages/component/src/catalog.test.ts`

- [ ] **Step 1: Add catalog assertions**

Extend `catalog.test.ts`:

```ts
it('tracks Session Kit as implemented shared workbench components', () => {
  const names = new Set(componentCatalog.map(item => item.name))

  expect(names.has('SessionComposer')).toBe(true)
  expect(names.has('SessionComposerActionBar')).toBe(true)
  expect(names.has('SessionTimeline')).toBe(true)
  expect(names.has('SessionDetailPanel')).toBe(true)
})
```

- [ ] **Step 2: Run catalog test and verify it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-component' test src/catalog.test.ts
```

Expected: fails until catalog entries are added.

- [ ] **Step 3: Add catalog entries**

Add implemented entries:

```ts
{
  description: 'Shared controlled session composer shell with attachments and action bar.',
  family: 'workbench',
  name: 'SessionComposer',
  owner: 'host-soul-shared',
  status: 'implemented',
},
{
  description: 'Shared composer action bar with attachment trigger, template select and submit affordance.',
  family: 'workbench',
  name: 'SessionComposerActionBar',
  owner: 'host-soul-shared',
  status: 'implemented',
},
{
  description: 'Shared normalized session timeline renderer.',
  family: 'workbench',
  name: 'SessionTimeline',
  owner: 'host-soul-shared',
  status: 'implemented',
},
{
  description: 'Shared generic session detail section shell.',
  family: 'workbench',
  name: 'SessionDetailPanel',
  owner: 'host-soul-shared',
  status: 'implemented',
},
```

Keep migration queue entries only for source files that still have uncovered
shared gaps after the implementation.

- [ ] **Step 4: Run catalog test**

Run:

```bash
bun run --filter '@zonease/aiworker-component' test src/catalog.test.ts
```

Expected: pass.

---

### Task 5: Migrate Generic Workspace Composer

**Files:**
- Modify: `apps/web/src/features/local-workspace/components/session-composer.tsx`
- Modify: `apps/web/src/styles/workspace.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add/adjust integration assertion**

In `worker-studio.test.tsx`, keep the existing `new-session-panel` coverage and
add an assertion that the shared composer class renders:

```tsx
expect(await screen.findByTestId('new-session-panel')).toBeTruthy()
expect(document.querySelector('.session-composer')).toBeTruthy()
```

- [ ] **Step 2: Run focused Web test and verify current state fails the new assertion**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: fails until the generic composer uses shared Session Kit.

- [ ] **Step 3: Convert `WorkspaceSessionComposer` to a thin adapter**

Replace local markup with:

```tsx
import { SessionComposer } from '@zonease/aiworker-component'
import { displayTemplate } from '../../i18n'

export function WorkspaceSessionComposer(props: WorkspaceSessionComposerProps) {
  const selectedTemplateCopy = displayTemplate(props.selectedTemplate, props.locale)
  return (
    <section className="workspace-session-composer" data-testid="new-session-panel">
      <h2 className="workspace-composer-title">{props.copy.workspace.createSessionPrompt(props.workspace.name)}</h2>
      <SessionComposer
        ariaLabel={props.copy.create.businessContext}
        className="workspace-composer-box"
        disabled={!props.engineReadiness.ready}
        disabledReason={!props.engineReadiness.ready ? props.engineReadiness.detail : undefined}
        placeholder={props.copy.workspace.createSessionPlaceholder}
        selectedTemplateId={props.selectedTemplate.id}
        submitAriaLabel={props.copy.workspace.createSession}
        submitting={props.submitting}
        templateLabel={props.copy.create.capabilityTemplate}
        templateOptions={props.templates.map(template => ({
          description: template.outputKind,
          label: displayTemplate(template, props.locale).name,
          value: template.id,
        }))}
        value={props.value}
        variant="large"
        onSubmit={props.onSubmit}
        onTemplateChange={props.onTemplateChange}
        onValueChange={props.onContextChange}
      />
      <p className="workspace-composer-hint">{props.copy.workspace.createSessionHint(selectedTemplateCopy.name)}</p>
    </section>
  )
}
```

Keep the engine settings action as a `secondaryActions` or status action prop if
the implementation adds that prop to `SessionComposerActionBar`.

- [ ] **Step 4: Remove duplicated workspace composer styles**

Delete local CSS now owned by Session Kit from `apps/web/src/styles/workspace.css`,
keeping only route-level width, title and hint styles:

```css
.workspace-session-composer {
  width: min(100%, 920px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 20px;
  margin: auto;
}
```

- [ ] **Step 5: Run focused test**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: pass or fail only on assertions that need copy/class updates from the
shared composer.

---

### Task 6: Migrate HR Profile Tools Composer

**Files:**
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add HR shared composer assertions**

In the HR test block after expanding Profile Workbench:

```tsx
expect(within(profileTools).getByRole('textbox', { name: /candidate material/i })).toBeTruthy()
expect(profileTools.querySelector('.session-composer')).toBeTruthy()
expect(profileTools.querySelector('.session-composer-action-bar')).toBeTruthy()
```

- [ ] **Step 2: Run test and verify current state fails the shared class assertion**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: fails until HR uses shared Session Kit.

- [ ] **Step 3: Replace HR local composer internals**

Keep recent sessions and attachment state in HR, but render shared composer:

```tsx
import {
  createComposerAttachment,
  formatSessionAttachmentKind,
  formatSessionAttachmentSize,
  SessionComposer,
} from '@zonease/aiworker-component'

<SessionComposer
  ariaLabel={labels.candidateMaterialLabel}
  attachmentTriggerLabel={labels.addCandidateMaterials}
  attachments={attachments.map(attachment => ({
    id: attachment.id,
    kind: formatSessionAttachmentKind(attachment.file),
    name: attachment.file.name,
    removeLabel: labels.removeCandidateMaterial(attachment.file.name),
    size: formatSessionAttachmentSize(attachment.file.size),
  }))}
  className="profile-draft-composer"
  description={selectedWorkspace ? labels.composerSafetyDetail : labels.selectProfileFirst}
  disabled={!selectedWorkspace || !engineReadiness.ready}
  disabledReason={!selectedWorkspace ? labels.selectProfileFirst : !engineReadiness.ready ? engineReadiness.detail : undefined}
  error={attachmentError}
  onAddAttachments={() => fileInputRef.current?.click()}
  onRemoveAttachment={removeAttachment}
  onSubmit={handleSubmit}
  onTemplateChange={onTemplateChange}
  onValueChange={onContextChange}
  placeholder={labels.contextPlaceholder}
  selectedTemplateId={selectedTemplate.id}
  submitAriaLabel={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
  submitting={submitting}
  submitTitle={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
  templateLabel={labels.proposalTypeSelectLabel}
  templateOptions={templates.map(template => ({
    label: labels.proposalTypeLabel(template.id, template.outputKind, displayTemplate(template, locale).name),
    value: template.id,
  }))}
  title={labels.profileComposerTitle(focusedProfile?.name ?? labels.headerFallback)}
  value={value}
  variant="panel"
/>
```

Use `createComposerAttachment(attachment.file)` in `handleSubmit` instead of the
local `readAttachmentMaterial` helper.

- [ ] **Step 4: Remove HR duplicated helpers and CSS**

Remove local `readAttachmentMaterial`, `isTextLikeFile`,
`arrayBufferToBase64`, `fileKindLabel` and `formatFileSize`.

Remove CSS selectors now owned by shared Session Kit from the HR stylesheet:

```css
.hr-task-composer
.hr-composer-action-bar
.hr-material-list
.hr-material-row
.hr-composer-template-select
.hr-material-add-button
.hr-composer-submit
```

Keep panel layout CSS such as `.hr-profile-tools-panel`,
`.hr-recent-sessions-section` and recent session cards.

- [ ] **Step 5: Run focused HR tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: pass.

---

### Task 7: Migrate Session Chat Timeline And Follow-Up Composer

**Files:**
- Modify: `apps/web/src/worker/session-chat.tsx`
- Modify: `apps/web/src/styles/session-chat.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add session route assertions**

Use existing session route tests or add a focused assertion:

```tsx
window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1/sessions/session-1')
render(<WorkerStudio />)

expect(await screen.findByTestId('worker-chat-log')).toBeTruthy()
expect(document.querySelector('.session-timeline')).toBeTruthy()
expect(document.querySelector('.session-composer-compact')).toBeTruthy()
```

- [ ] **Step 2: Run test and verify current state fails shared class assertion**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: fails until chat consumes shared timeline/composer.

- [ ] **Step 3: Replace local event block helpers**

Import shared helpers:

```tsx
import {
  createSessionTimelineViewModel,
  normalizeSessionEvents,
  SessionComposer,
  SessionTimeline,
} from '@zonease/aiworker-component'
```

Build the timeline:

```tsx
const timeline = useMemo(() => createSessionTimelineViewModel({
  events: normalizeSessionEvents(sortedEvents),
  turns: sortedTurns,
}), [sortedEvents, sortedTurns])
```

Render:

```tsx
<div ref={logRef} className="worker-chat-log" data-testid="worker-chat-log">
  <SessionTimeline
    assistantRoleLabel={copy.workspace.engineRole}
    empty={engineReadiness.detail}
    operatorRoleLabel={copy.workspace.operatorRole}
    timestampForTurn={turn => formatRelativeTime(turn.createdAt ?? session.createdAt, locale)}
    turns={timeline.turns}
  />
  {turnSubmitting && sortedTurns.every(turn => turn.status !== 'running')
    ? <AssistantWaiting detail={engineReadiness.detail} role={copy.workspace.engineRole} />
    : null}
</div>
```

Use compact `SessionComposer` for the bottom follow-up composer.

- [ ] **Step 4: Remove obsolete local chat helpers and CSS**

Remove local `WorkerAgentEvent`, `AssistantTurn`, `AgentEventBlock`,
`EngineToolCard`, `coerceAgentEvent`, `compactAgentEvents`, `truncateLog`,
`readString`, `readNumber` and `isRecord` from `session-chat.tsx` once shared
helpers cover them.

Remove duplicated message/tool/status styles from `session-chat.css`, keeping
only route-level header, log wrapper and jump-to-latest styles.

- [ ] **Step 5: Run session tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: pass.

---

### Task 8: Migrate Session Detail Panel

**Files:**
- Modify: `apps/web/src/worker/session-detail.tsx`
- Modify: `apps/web/src/styles/artifact.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add shared detail assertion**

In a session detail test:

```tsx
expect(document.querySelector('.session-detail-panel')).toBeTruthy()
```

- [ ] **Step 2: Run test and verify current state fails the assertion**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: fails until `SessionDetail` uses `SessionDetailPanel`.

- [ ] **Step 3: Wrap detail sections in `SessionDetailPanel`**

Keep `SessionDetail` as the Host-owned adapter and move layout into shared
panel:

```tsx
import { SessionComposer, SessionDetailPanel } from '@zonease/aiworker-component'

const summaryContent = (
  <SessionSummary
    copy={copy}
    locale={locale}
    progress={progress}
    session={session}
    template={template}
    workspace={workspace}
  />
)
const artifactContent = (
  <ArtifactPreviewFrame
    className="artifact-panel"
    title={copy.artifact.label}
    description={copy.workspace.artifactCount(artifacts.length)}
    loading={artifact && artifactPreview.loading ? copy.artifact.loading : false}
    error={artifactPreview.error}
    empty={artifact ? undefined : progress?.previewDetail ?? copy.artifact.empty}
  >
    {artifact ? renderArtifactPreview() : null}
  </ArtifactPreviewFrame>
)

<SessionDetailPanel
  className="artifact-rail-body"
  summary={summaryContent}
  composer={mode === 'full'
    ? (
        <SessionComposer
          ariaLabel={copy.workspace.followUpInput}
          disabled={!engineReadiness.ready}
          disabledReason={engineReadiness.ready ? undefined : engineReadiness.detail}
          onSubmit={onSubmitTurn}
          onValueChange={onTurnInputChange}
          placeholder={copy.workspace.followUpPlaceholder}
          submitAriaLabel={turnSubmitting ? copy.workspace.sendingTurn : copy.workspace.sendTurn}
          submitting={turnSubmitting}
          value={turnInput}
          variant="compact"
        />
      )
    : null}
  artifact={artifactContent}
  review={renderReviewSection()}
  memory={renderMemorySection()}
  eventStream={renderEventStreamSection()}
/>
```

Extract tiny local rendering helpers such as `MemorySection` only if that keeps
`session-detail.tsx` readable. Do not move lesson policy into shared code.

- [ ] **Step 4: Remove obsolete artifact detail styles**

Remove local `.turn-composer` styles now covered by `SessionComposer`. Keep
artifact rail sizing, summary, preview, memory row and event list styles that
remain Host-owned.

- [ ] **Step 5: Run session detail tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: pass.

---

### Task 9: Final Verification And PMA Closeout

**Files:**
- Modify: `docs/task/FEAT-102.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-376.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run shared component gates**

Run:

```bash
bun run --filter '@zonease/aiworker-component' test
bun run --filter '@zonease/aiworker-component' typecheck
```

Expected: both pass.

- [ ] **Step 2: Run focused Web gates**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' lint
bun run --filter '@zonease/aiworker-web' build
```

Expected: all pass.

- [ ] **Step 3: Run governance and diff checks**

Run:

```bash
bun run ui:check
git diff --check
```

Expected: both pass.

- [ ] **Step 4: Browser smoke**

Start the local dev stack with the repo's accepted command:

```bash
bun run dev
```

Open Worker Web and verify:

- generic workspace composer renders the shared action bar;
- session route renders shared timeline and compact composer;
- HR profile right panel renders the shared composer/action bar;
- file attachment rows and proposal type select still work visually;
- no text overlaps at desktop and narrow widths.

- [ ] **Step 5: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: review exits 0 or only reports understood residual warnings that are
covered by focused tests.

- [ ] **Step 6: Update PMA docs and changelog**

Mark verification boxes in `docs/plan/PLAN-376.md`, summarize completion in
`docs/task/FEAT-102.md`, change index markers from `[-]` to `[x]`, and update
the changelog entry from `[progress]` to `[completed]`.

- [ ] **Step 7: Commit**

Run:

```bash
git status --short
git add packages/component apps/web docs/task/FEAT-102.md docs/task/index.md docs/plan/PLAN-376.md docs/plan/index.md docs/changelog.md docs/superpowers/plans/2026-05-19-session-kit.md
git commit -m "feat: 抽出 Session Kit 公共组件"
```

Expected: commit succeeds with only intentional files staged.

---

## Self-Review

- Spec coverage: The plan covers composer/action bar, attachments, timeline
  normalization/rendering, detail shells, HR consumption, generic Host Web
  consumption, catalog/PMA updates and verification.
- Scope: This remains one cohesive component extraction. It does not include
  Host API, protocol, storage or release work.
- Boundary check: Shared code receives props and neutral records only; Host Web
  and HR keep route/API/domain behavior.
- Verification: Component tests, focused Worker Web tests, typecheck, lint,
  build, UI governance, browser smoke and code-review-graph are included.
