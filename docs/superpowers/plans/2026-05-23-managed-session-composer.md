# Managed Session Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable managed session composer in `@zonease/aiworker-ui` and migrate new-session, follow-up-session and HR profile composer consumers onto it.

**Architecture:** Keep `SessionComposer` as the presentational shadcn-first UI primitive and add a managed layer that owns generic draft state, file input, paste, previews, dedupe, material reads, cleanup and neutral draft submission. Apps translate the neutral draft into their own session or domain requests, so `packages/ui` stays free of Host, workspace, session and HR semantics. The composer remains a thin local context entrypoint into the native engine bridge and does not implement engine workflow, approval, memory or orchestration behavior.

**Tech Stack:** Bun workspaces, TypeScript, React 19, Vitest/happy-dom, Bun test, shadcn UI primitives in `packages/ui`, Hugeicons, AIWorker Host/Soul local session APIs.

---

## File Structure

- Create `packages/ui/src/components/managed-session-composer.tsx`
  - Owns `ManagedSessionComposer`, `useSessionComposerDraft`, neutral draft types and managed labels.
  - Imports the existing `SessionComposer` and attachment helpers from `./session-composer`.
  - Does not import `@zonease/aiworker-shared`, Host Web, Soul App packages or HR code.
- Modify `packages/ui/src/components/session-composer.tsx`
  - Re-export managed composer types and functions from `./managed-session-composer`.
  - Keep existing `SessionComposer` behavior compatible.
- Modify `packages/ui/src/components/session-composer.test.tsx`
  - Add managed composer coverage for draft submission, attachments, cleanup, errors, templates and mentions.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
  - Replace hand-written new-session input and button with `ManagedSessionComposer`.
  - Update `onCreateSession` prop to accept a neutral session draft payload.
  - Keep workspace/session selection and layout state inside universal workbench.
- Modify `packages/soul-app-workbench/src/universal-workbench/SessionChatView.tsx`
  - Replace local attachment state and material read logic with `ManagedSessionComposer`.
  - Keep timeline, scroll pinning, usage calculation and engine readiness outside `packages/ui`.
- Modify `packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx`
  - Use `ManagedSessionComposer` for the detail follow-up composer.
  - Keep session metadata, event stream and history rendering in this file.
- Modify `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
  - Send `metadata.materials` and `metadata.mentions` from managed drafts when creating sessions or submitting turns.
  - Use `draft.selectedTemplateId` when creating a session.
- Create `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
  - Server-render component states to prove the new-session surface uses the shared composer and no hand-written text input/button.
- Modify `apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx`
  - Replace HR-local file input, preview URL and attachment mapping with `ManagedSessionComposer`.
  - Keep HR draft options, profile gating, copy and submit payload translation in HR code.
- Modify `apps/aiworker-hr/product/web/component-proof.test.tsx`
  - Add assertions for HR managed composer integration if the existing proof test already renders the profile composer.
- Modify `apps/aiworker-hr/product/web/people-workbench/api.test.ts` only if HR submit payload tests currently cover composer input.
- Do not modify Host micro-app mounting, engine event parsing, timeline rendering, message flow rendering or Host chrome.

## Task 1: Shared Managed Composer Tests

**Files:**
- Modify: `packages/ui/src/components/session-composer.test.tsx`

- [ ] **Step 1: Add failing tests for managed draft submission**

Append these imports to `packages/ui/src/components/session-composer.test.tsx`:

```ts
import { ManagedSessionComposer } from './session-composer'
```

Update the Testing Library import in the same file:

```ts
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
```

Append these tests inside `describe('sessionComposer', () => { ... })`:

```ts
  it('submits a neutral managed draft with text, materials, template and mentions', async () => {
    const onSubmitDraft = vi.fn()
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add source materials',
          attached: 'Attached source materials',
          closePreview: name => `Close preview for ${name}`,
          materialReadError: 'Failed to read source material.',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        mentionOptions={[{ id: 'review-notes', label: 'Review notes' }]}
        selectedTemplateId="review-template"
        submitAriaLabel="Start"
        templateOptions={[{ label: 'Review template', value: 'review-template' }]}
        value="Use $review-notes"
        variant="large"
        onSubmitDraft={onSubmitDraft}
        onValueChange={vi.fn()}
      />,
    )

    const input = screen.getByTestId('managed-session-file-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.submit(screen.getByRole('form', { name: 'Session input' }))

    await waitFor(() => expect(onSubmitDraft).toHaveBeenCalledTimes(1))
    expect(onSubmitDraft.mock.calls[0]?.[0]).toMatchObject({
      text: 'Use $review-notes',
      selectedTemplateId: 'review-template',
      mentions: [{ id: 'review-notes', kind: 'skill', label: 'Review notes' }],
      materials: [{
        content: 'hello',
        encoding: 'utf8',
        mimeType: 'text/plain',
        name: 'notes.txt',
        size: 5,
      }],
    })
    expect(onSubmitDraft.mock.calls[0]?.[0].files[0]).toBe(file)
  })
```

- [ ] **Step 2: Add failing tests for cleanup and failure preservation**

Append these tests inside the same `describe` block:

```ts
  it('clears managed text and attachments after successful submit', async () => {
    const onValueChange = vi.fn()
    const onSubmitDraft = vi.fn()

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add source materials',
          attached: 'Attached source materials',
          closePreview: name => `Close preview for ${name}`,
          materialReadError: 'Failed to read source material.',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Draft request"
        submitAriaLabel="Start"
        variant="large"
        onSubmitDraft={onSubmitDraft}
        onValueChange={onValueChange}
      />,
    )

    fireEvent.submit(screen.getByRole('form', { name: 'Session input' }))

    await waitFor(() => expect(onSubmitDraft).toHaveBeenCalledTimes(1))
    expect(onValueChange).toHaveBeenLastCalledWith('')
    expect((screen.getByRole('textbox', { name: 'Session input' }) as HTMLTextAreaElement).value).toBe('')
  })

  it('preserves managed draft and shows submit errors', async () => {
    const onSubmitDraft = vi.fn(async () => {
      throw new Error('Create session failed')
    })

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add source materials',
          attached: 'Attached source materials',
          closePreview: name => `Close preview for ${name}`,
          materialReadError: 'Failed to read source material.',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Keep this"
        submitAriaLabel="Start"
        variant="large"
        onSubmitDraft={onSubmitDraft}
      />,
    )

    fireEvent.submit(screen.getByRole('form', { name: 'Session input' }))

    await waitFor(() => expect(screen.getByText('Create session failed')).toBeTruthy())
    expect((screen.getByRole('textbox', { name: 'Session input' }) as HTMLTextAreaElement).value).toBe('Keep this')
  })
```

- [ ] **Step 3: Add failing tests for dedupe and preview release**

Append these tests inside the same `describe` block:

```ts
  it('deduplicates managed attachments by name, size and MIME type', () => {
    const file = new File(['same'], 'same.txt', { type: 'text/plain' })

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add source materials',
          attached: 'Attached source materials',
          closePreview: name => `Close preview for ${name}`,
          materialReadError: 'Failed to read source material.',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        submitAriaLabel="Start"
        variant="large"
        onSubmitDraft={vi.fn()}
      />,
    )

    const input = screen.getByTestId('managed-session-file-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file, file] } })

    expect(screen.getAllByText('same.txt')).toHaveLength(1)
  })

  it('releases managed image preview URLs on removal and unmount', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const file = new File(['image'], 'photo.png', { type: 'image/png' })

    const { unmount } = render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add source materials',
          attached: 'Attached source materials',
          closePreview: name => `Close preview for ${name}`,
          materialReadError: 'Failed to read source material.',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        submitAriaLabel="Start"
        variant="large"
        onSubmitDraft={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByTestId('managed-session-file-input'), { target: { files: [file] } })
    expect(createObjectURL).toHaveBeenCalledWith(file)
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo.png' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview')

    fireEvent.change(screen.getByTestId('managed-session-file-input'), { target: { files: [file] } })
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })
```

- [ ] **Step 4: Run shared UI tests and verify the new tests fail**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/session-composer.test.tsx
```

Expected: FAIL with `ManagedSessionComposer` export missing.

## Task 2: Shared Managed Composer Implementation

**Files:**
- Create: `packages/ui/src/components/managed-session-composer.tsx`
- Modify: `packages/ui/src/components/session-composer.tsx`
- Modify: `packages/ui/src/components/session-composer.test.tsx`

- [ ] **Step 1: Add the managed composer file**

Create `packages/ui/src/components/managed-session-composer.tsx` with this implementation:

```tsx
import type { FormEvent, ReactNode } from 'react'
import type {
  SessionComposerAttachmentItem,
  SessionComposerMaterial,
  SessionComposerMentionOption,
  SessionComposerOption,
  SessionComposerProps,
} from './session-composer'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createComposerAttachment,
  formatSessionAttachmentKind,
  formatSessionAttachmentSize,
  isSessionAttachmentImage,
  SessionComposer,
} from './session-composer'

export interface ManagedSessionComposerMention {
  id: string
  kind: 'skill'
  label: string
}

export interface ManagedSessionComposerDraft {
  files: File[]
  materials: SessionComposerMaterial[]
  mentions: ManagedSessionComposerMention[]
  selectedTemplateId?: string
  text: string
}

export interface ManagedSessionComposerAttachmentLabels {
  add: string
  attached: string
  closePreview: (name: string) => string
  materialReadError: string
  preview: (name: string) => string
  remove: (name: string) => string
}

export interface ManagedSessionComposerHandle {
  focus: () => void
}

export interface ManagedSessionComposerProps extends Omit<
  SessionComposerProps,
  | 'attachmentCountLabel'
  | 'attachmentTriggerLabel'
  | 'attachments'
  | 'error'
  | 'onAddAttachmentFiles'
  | 'onAddAttachments'
  | 'onMentionDismiss'
  | 'onMentionSelect'
  | 'onRemoveAttachment'
  | 'onSubmit'
  | 'onValueChange'
  | 'value'
> {
  attachmentLabels: ManagedSessionComposerAttachmentLabels
  defaultValue?: string
  error?: ReactNode
  onSubmitDraft: (draft: ManagedSessionComposerDraft, event: FormEvent<HTMLFormElement>) => Promise<void> | void
  onValueChange?: (value: string) => void
  value?: string
}

interface ManagedAttachment {
  file: File
  id: string
  previewUrl?: string
}

const EMPTY_ATTACHMENTS: ManagedAttachment[] = []

export function useSessionComposerDraft({
  defaultValue = '',
  onValueChange,
  value,
}: {
  defaultValue?: string
  onValueChange?: (value: string) => void
  value?: string
} = {}) {
  const [localValue, setLocalValue] = useState(defaultValue)
  const [attachments, setAttachments] = useState<ManagedAttachment[]>(EMPTY_ATTACHMENTS)
  const attachmentsRef = useRef<ManagedAttachment[]>(EMPTY_ATTACHMENTS)
  const currentValue = value ?? localValue

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => revokeManagedPreviewUrls(attachmentsRef.current)
  }, [])

  function setText(nextValue: string) {
    if (value === undefined)
      setLocalValue(nextValue)
    onValueChange?.(nextValue)
  }

  function addFiles(files: FileList | File[] | readonly File[] | null) {
    const nextFiles = Array.from(files ?? [])
    if (nextFiles.length === 0)
      return
    setAttachments((current) => {
      const seen = new Set(current.map(attachment => managedFileKey(attachment.file)))
      const deduped = nextFiles.filter((file) => {
        const key = managedFileKey(file)
        if (seen.has(key))
          return false
        seen.add(key)
        return true
      })
      return [
        ...current,
        ...deduped.map(file => ({
          file,
          id: managedAttachmentId(file),
          previewUrl: createManagedPreviewUrl(file),
        })),
      ]
    })
  }

  function removeAttachment(id: string) {
    setAttachments(current => current.filter((attachment) => {
      if (attachment.id === id)
        revokeManagedPreviewUrl(attachment)
      return attachment.id !== id
    }))
  }

  function clear() {
    setText('')
    setAttachments((current) => {
      revokeManagedPreviewUrls(current)
      return EMPTY_ATTACHMENTS
    })
  }

  return {
    addFiles,
    attachments,
    clear,
    removeAttachment,
    setText,
    text: currentValue,
  }
}

export function ManagedSessionComposer({
  allowSubmitWithoutText,
  ariaLabel,
  attachmentLabels,
  className,
  defaultValue,
  disabled,
  disabledReason,
  error,
  mentionOptions = [],
  mentionQuery,
  onSubmitDraft,
  onTemplateChange,
  onValueChange,
  selectedTemplateId,
  submitAriaLabel,
  submitDisabled,
  submitting,
  submitTitle,
  templateOptions,
  value,
  ...composerProps
}: ManagedSessionComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const draft = useSessionComposerDraft({ defaultValue, onValueChange, value })
  const [localError, setLocalError] = useState<ReactNode>(null)
  const activeMentionQuery = mentionQuery ?? resolveManagedMentionQuery(draft.text)
  const attachmentItems = useMemo(
    () => draft.attachments.map(attachment => managedAttachmentItem(attachment, attachmentLabels)),
    [attachmentLabels, draft.attachments],
  )

  function openFilePicker() {
    const input = fileInputRef.current
    if (!input)
      return
    input.value = ''
    input.click()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || submitDisabled || submitting)
      return
    if (!allowSubmitWithoutText && !draft.text.trim() && draft.attachments.length === 0)
      return
    try {
      setLocalError(null)
      const materials = await Promise.all(draft.attachments.map(attachment => createComposerAttachment(attachment.file)))
      await onSubmitDraft({
        files: draft.attachments.map(attachment => attachment.file),
        materials,
        mentions: resolveManagedMentions(draft.text, mentionOptions),
        selectedTemplateId,
        text: draft.text,
      }, event)
      draft.clear()
    }
    catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : attachmentLabels.materialReadError)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        aria-hidden="true"
        aria-label={attachmentLabels.add}
        className="sr-only"
        data-testid="managed-session-file-input"
        multiple
        tabIndex={-1}
        type="file"
        onChange={(event) => {
          draft.addFiles(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
      />
      <SessionComposer
        {...composerProps}
        allowSubmitWithoutText={allowSubmitWithoutText}
        ariaLabel={ariaLabel}
        attachmentCountLabel={attachmentLabels.attached}
        attachmentTriggerLabel={attachmentLabels.add}
        attachments={attachmentItems}
        className={className}
        disabled={disabled}
        disabledReason={disabledReason}
        error={error ?? localError}
        mentionOptions={mentionOptions}
        mentionQuery={activeMentionQuery}
        onAddAttachmentFiles={draft.addFiles}
        onAddAttachments={openFilePicker}
        onMentionDismiss={() => draft.setText(draft.text.replace(/\$([\w.-]*)$/, ''))}
        onMentionSelect={option => draft.setText(draft.text.replace(/\$([\w.-]*)$/, `$${option.id} `))}
        onRemoveAttachment={draft.removeAttachment}
        onSubmit={handleSubmit}
        onTemplateChange={onTemplateChange}
        onValueChange={draft.setText}
        selectedTemplateId={selectedTemplateId}
        submitAriaLabel={submitAriaLabel}
        submitDisabled={submitDisabled}
        submitting={submitting}
        submitTitle={submitTitle}
        templateOptions={templateOptions}
        value={draft.text}
      />
    </>
  )
}

function managedAttachmentItem(
  attachment: ManagedAttachment,
  labels: ManagedSessionComposerAttachmentLabels,
): SessionComposerAttachmentItem {
  const previewUrl = attachment.previewUrl
  return {
    id: attachment.id,
    kind: formatSessionAttachmentKind(attachment.file),
    closePreviewLabel: labels.closePreview(attachment.file.name),
    mediaType: previewUrl ? 'image' : 'file',
    name: attachment.file.name,
    onPreviewLabel: previewUrl ? labels.preview(attachment.file.name) : undefined,
    previewAlt: previewUrl ? attachment.file.name : undefined,
    previewTitle: previewUrl ? attachment.file.name : undefined,
    previewUrl,
    removeLabel: labels.remove(attachment.file.name),
    size: formatSessionAttachmentSize(attachment.file.size),
  }
}

function resolveManagedMentionQuery(value: string) {
  const match = value.match(/\$([\w.-]*)$/)
  return match ? { active: true, query: match[1] ?? '', trigger: '$' as const } : undefined
}

function resolveManagedMentions(
  value: string,
  options: SessionComposerMentionOption[],
): ManagedSessionComposerMention[] {
  const ids = new Set([...value.matchAll(/\$([\w.-]+)/g)].map(match => match[1]).filter(Boolean))
  return options
    .filter(option => ids.has(option.id))
    .map(option => ({
      id: option.id,
      kind: 'skill' as const,
      label: typeof option.label === 'string' ? option.label : option.id,
    }))
}

function managedAttachmentId(file: File): string {
  const entropy = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${managedFileKey(file)}-${entropy}`
}

function managedFileKey(file: Pick<File, 'name' | 'size' | 'type'>): string {
  return `${file.name}:${file.size}:${file.type || 'application/octet-stream'}`
}

function createManagedPreviewUrl(file: File): string | undefined {
  if (!isSessionAttachmentImage(file))
    return undefined
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function')
    return undefined
  return URL.createObjectURL(file)
}

function revokeManagedPreviewUrls(attachments: readonly ManagedAttachment[]) {
  for (const attachment of attachments)
    revokeManagedPreviewUrl(attachment)
}

function revokeManagedPreviewUrl(attachment: ManagedAttachment) {
  if (!attachment.previewUrl)
    return
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function')
    return
  URL.revokeObjectURL(attachment.previewUrl)
}
```

- [ ] **Step 2: Re-export the managed API**

Append this export block to the bottom of `packages/ui/src/components/session-composer.tsx`:

```ts
export {
  ManagedSessionComposer,
  useSessionComposerDraft,
} from './managed-session-composer'
export type {
  ManagedSessionComposerAttachmentLabels,
  ManagedSessionComposerDraft,
  ManagedSessionComposerMention,
  ManagedSessionComposerProps,
} from './managed-session-composer'
```

- [ ] **Step 3: Give the composer form an accessible name for tests and consumers**

In `packages/ui/src/components/session-composer.tsx`, update the `<form>` element inside `SessionComposer`:

```tsx
    <form
      aria-label={ariaLabel}
      data-slot="session-composer"
      data-variant={variant}
      className={cn(
        'flex min-w-0 flex-col gap-2',
        className,
      )}
      onSubmit={onSubmit}
    >
```

- [ ] **Step 4: Run shared UI tests**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/session-composer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit shared managed composer**

Run:

```bash
git add packages/ui/src/components/session-composer.tsx packages/ui/src/components/managed-session-composer.tsx packages/ui/src/components/session-composer.test.tsx
git commit -m "feat: 添加可复用 managed session composer"
```

## Task 3: Universal Workbench New Session And Follow-Up

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/SessionChatView.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
- Create: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`

- [ ] **Step 1: Add failing render test for no raw new-session form**

Create `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`:

```tsx
import type { LocalWorkspace } from '@zonease/aiworker-shared'
import { describe, expect, it, vi } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { UniversalWorkbenchApp } from './UniversalWorkbenchApp'

const workspace = {
  createdAt: '2026-05-23T00:00:00.000Z',
  id: 'workspace-1',
  name: 'Universal Workspace',
  status: 'active',
  updatedAt: '2026-05-23T00:00:00.000Z',
  workerId: 'worker-1',
} as LocalWorkspace

describe('UniversalWorkbenchApp', () => {
  it('renders the managed composer when a workspace is selected without a session', () => {
    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Engine bridge ready', label: 'Engine bridge', ready: true }}
        events={[]}
        sessions={[]}
        turnInput=""
        turnSubmitting={false}
        turns={[]}
        workspace={workspace}
        workspaces={[workspace]}
        onBackToWorkspace={vi.fn()}
        onCreateSession={vi.fn()}
        onCreateWorkspace={vi.fn()}
        onRefresh={vi.fn()}
        onSubmitTurn={vi.fn()}
        onTurnInputChange={vi.fn()}
      />,
    )

    expect(html).toContain('data-slot="session-composer"')
    expect(html).toContain('What do you want to work on?')
    expect(html).not.toContain('class="flex w-full max-w-xl gap-2"')
  })
})
```

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
```

Expected: FAIL because the new-session surface still uses the raw input/button.

- [ ] **Step 2: Add universal draft types and labels**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`, add imports:

```ts
import type { ManagedSessionComposerDraft } from '@zonease/aiworker-ui/components/session-composer'
import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/session-composer'
```

Add this exported type near `UniversalWorkbenchAppProps`:

```ts
export interface UniversalWorkbenchCreateSessionDraft {
  input: string
  materials?: ManagedSessionComposerDraft['materials']
  mentions?: ManagedSessionComposerDraft['mentions']
  selectedTemplateId?: string
}

export interface UniversalWorkbenchSubmitTurnDraft {
  input: string
  materials?: ManagedSessionComposerDraft['materials']
  mentions?: ManagedSessionComposerDraft['mentions']
}
```

Change the props:

```ts
  onCreateSession: (workspaceId: string, draft: UniversalWorkbenchCreateSessionDraft) => Promise<void>
  onSubmitTurn: (draft: UniversalWorkbenchSubmitTurnDraft) => Promise<void> | void
```

Remove `newSessionInput` state from `UniversalWorkbenchApp`.

- [ ] **Step 3: Replace workspace empty-state form**

Replace `handleCreateSession` with:

```ts
  async function handleCreateSession(workspaceId: string, draft: ManagedSessionComposerDraft) {
    if (!draft.text.trim() && draft.materials.length === 0)
      return
    await onCreateSession(workspaceId, {
      input: draft.text.trim(),
      materials: draft.materials,
      mentions: draft.mentions,
      selectedTemplateId: draft.selectedTemplateId,
    })
  }

  async function handleSubmitTurn(draft: ManagedSessionComposerDraft) {
    if (!draft.text.trim() && draft.materials.length === 0)
      return
    await onSubmitTurn({
      input: draft.text.trim(),
      materials: draft.materials,
      mentions: draft.mentions,
    })
  }
```

Replace the selected-workspace empty state with:

```tsx
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">{selectedWorkspace.name}</h2>
                    <p className="text-sm text-muted-foreground">Start a new session or select one from the sidebar.</p>
                  </div>
                  <ManagedSessionComposer
                    ariaLabel="New session input"
                    attachmentLabels={{
                      add: 'Add source materials',
                      attached: 'Attached source materials',
                      closePreview: name => `Close preview for ${name}`,
                      materialReadError: 'Failed to read source material.',
                      preview: (name: string) => `Preview ${name}`,
                      remove: (name: string) => `Remove ${name}`,
                    }}
                    className="w-full max-w-xl"
                    disabled={!engineReadiness.ready}
                    disabledReason={engineReadiness.ready ? undefined : engineReadiness.detail}
                    placeholder="What do you want to work on?"
                    submitAriaLabel="Start"
                    submitDisabled={!engineReadiness.ready}
                    submitting={turnSubmitting}
                    variant="large"
                    onSubmitDraft={draft => handleCreateSession(selectedWorkspace.id, draft)}
                  />
                </div>
```

Update the sidebar tree callback so it no longer submits an empty draft:

```tsx
            onCreateSession={() => {
              if (selectedWorkspace) {
                setSelectedWorkspaceId(selectedWorkspace.id)
                setInternalSelectedSessionId(null)
                onSelectSession?.(null)
              }
            }}
```

Update the `SessionChatView` and `SessionDetail` call sites in `UniversalWorkbenchApp`:

```tsx
                onSubmitTurn={handleSubmitTurn}
```

```tsx
        onSubmitTurn={handleSubmitTurn}
```

- [ ] **Step 4: Replace SessionChatView attachment logic with managed composer**

In `packages/soul-app-workbench/src/universal-workbench/SessionChatView.tsx`, replace imports from `@zonease/aiworker-ui/components/session-composer` with:

```ts
import type { ManagedSessionComposerDraft } from '@zonease/aiworker-ui/components/session-composer'
import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/session-composer'
```

Remove `fileInputRef`, `attachmentsRef`, `attachments`, `attachmentItems`, `addAttachmentFiles`, `openFilePicker` and `removeAttachment`.

Change `SessionChatViewProps` so `onSubmitTurn` receives a draft:

```ts
  onSubmitTurn: (draft: ManagedSessionComposerDraft) => Promise<void> | void
```

Replace `handleSubmit` with:

```ts
  async function handleSubmitDraft(draft: ManagedSessionComposerDraft) {
    if (!engineReadiness.ready || (!draft.text.trim() && draft.materials.length === 0))
      return
    await onSubmitTurn(draft)
  }
```

Replace the hidden file input and `<SessionComposer ... />` with:

```tsx
      <ManagedSessionComposer
        ariaLabel={copy.followUpInput}
        attachmentLabels={{
          add: copy.addSourceMaterials,
          attached: copy.attachedSourceMaterials,
          closePreview: () => copy.closeSourceMaterialPreview,
          materialReadError: copy.materialReadError,
          preview: copy.previewSourceMaterial,
          remove: copy.removeSourceMaterial,
        }}
        className="min-w-0 max-w-full px-6 pt-3 pb-4 max-md:px-4"
        disabled={!engineReadiness.ready}
        disabledReason={engineReadiness.ready ? undefined : engineReadiness.detail}
        placeholder={copy.followUpPlaceholder}
        submitAriaLabel={turnSubmitting || composerBusy ? copy.sendingTurn : copy.sendTurn}
        submitDisabled={!engineReadiness.ready}
        submitting={composerBusy}
        submitTitle={turnSubmitting || composerBusy ? copy.sendingTurn : copy.sendTurn}
        usage={composerUsage}
        value={turnInput}
        variant="compact"
        onSubmitDraft={draft => handleSubmitDraft(draft)}
        onValueChange={onTurnInputChange}
      />
```

- [ ] **Step 5: Replace SessionDetail composer with managed composer**

In `packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx`, replace the import:

```ts
import type { ManagedSessionComposerDraft } from '@zonease/aiworker-ui/components/session-composer'
import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/session-composer'
```

Change the `onSubmitTurn` prop type:

```ts
  onSubmitTurn: (draft: ManagedSessionComposerDraft) => Promise<void> | void
```

Replace the `SessionComposer` element in `SessionDetailPanel` with:

```tsx
                <ManagedSessionComposer
                  ariaLabel={copy.workspace.followUpInput}
                  attachmentLabels={{
                    add: copy.workspace.addSourceMaterials,
                    attached: copy.workspace.attachedSourceMaterials,
                    closePreview: () => copy.workspace.closeSourceMaterialPreview,
                    materialReadError: copy.workspace.materialReadError,
                    preview: copy.workspace.previewSourceMaterial,
                    remove: copy.workspace.removeSourceMaterial,
                  }}
                  className="min-w-0"
                  description={engineReadiness.detail}
                  disabled={!engineReadiness.ready}
                  disabledReason={engineReadiness.ready ? undefined : engineReadiness.detail}
                  placeholder={copy.workspace.followUpPlaceholder}
                  submitAriaLabel={composerBusy ? copy.workspace.sendingTurn : copy.workspace.sendTurn}
                  submitDisabled={!engineReadiness.ready}
                  submitting={composerBusy}
                  submitTitle={composerBusy ? copy.workspace.sendingTurn : copy.workspace.sendTurn}
                  title={copy.workspace.continueSession}
                  usage={composerUsage}
                  value={turnInput}
                  variant="compact"
                  onSubmitDraft={draft => onSubmitTurn(draft)}
                  onValueChange={onTurnInputChange}
                />
```

- [ ] **Step 6: Carry managed metadata in the mounted client**

In `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`, import the draft types:

```ts
import type { UniversalWorkbenchCreateSessionDraft, UniversalWorkbenchSubmitTurnDraft } from './UniversalWorkbenchApp'
```

Change `handleCreateSession`:

```ts
  async function handleCreateSession(targetWorkspaceId: string, draft: UniversalWorkbenchCreateSessionDraft) {
    if (!workerId)
      return
    const template = templates.find(t => t.id === draft.selectedTemplateId) ?? templates[0]
    if (!template)
      return
    const input = draft.input.trim()
    const result = await fetchJson<SessionTurnResult>(`${routePrefix}/api/sessions?workerId=${encodeURIComponent(workerId)}&workspaceId=${encodeURIComponent(targetWorkspaceId)}`, {
      body: JSON.stringify({
        capabilityTemplateId: template.id,
        input,
        metadata: {
          materials: draft.materials ?? [],
          mentions: draft.mentions ?? [],
        },
        title: input.slice(0, 80) || template.name || template.id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    if (result.session) {
      setSelectedSessionId(result.session.id)
      setSessions(current => [
        result.session!,
        ...current.filter(session => session.id !== result.session!.id),
      ])
      void refresh(result.session.id).catch(() => {})
    }
    if (result.turn)
      setTurns(current => [...current, result.turn!])
    if (result.events)
      setEvents(current => [...current, ...result.events!])
  }
```

Change `handleSubmitTurn` so continuation turns carry the same managed draft metadata:

```ts
  async function handleSubmitTurn(draft: UniversalWorkbenchSubmitTurnDraft) {
    if (!workerId || !selectedSessionId || (!draft.input.trim() && (draft.materials?.length ?? 0) === 0))
      return
    setTurnSubmitting(true)
    try {
      const result = await fetchJson<SessionTurnResult>(`${routePrefix}/api/sessions/${encodeURIComponent(selectedSessionId)}/turns?workerId=${encodeURIComponent(workerId)}`, {
        body: JSON.stringify({
          input: draft.input.trim(),
          metadata: {
            materials: draft.materials ?? [],
            mentions: draft.mentions ?? [],
          },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      setTurnInput('')
      if (result.turn)
        setTurns(current => [...current, result.turn!])
      if (result.events)
        setEvents(current => [...current, ...result.events!])
    }
    finally {
      setTurnSubmitting(false)
    }
  }
```

When rendering `UniversalWorkbenchApp`, adapt the callback:

```tsx
      onSubmitTurn={draft => handleSubmitTurn({
        input: draft.text,
        materials: draft.materials,
        mentions: draft.mentions,
      })}
```

- [ ] **Step 7: Run soul app workbench tests**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit universal workbench migration**

Run:

```bash
git add packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx packages/soul-app-workbench/src/universal-workbench/SessionChatView.tsx packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx packages/soul-app-workbench/src/universal-workbench/client-entry.tsx packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx
git commit -m "refactor: 统一 universal workbench session composer"
```

## Task 4: HR Profile Composer Migration

**Files:**
- Modify: `apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx`
- Modify: `apps/aiworker-hr/product/web/component-proof.test.tsx`

- [ ] **Step 1: Add failing HR proof assertion**

In `apps/aiworker-hr/product/web/component-proof.test.tsx`, update the existing
`renders the HR people workbench as three visible columns by default` test by
adding these assertions after the existing `data-slot="hr-profile-composer"`
assertion:

```ts
expect(html).toContain('data-slot="session-composer"')
expect(html).toContain('data-variant="panel"')
```

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test -- product/web/component-proof.test.tsx
```

Expected: existing assertions pass; new assertions fail until the composer wrapper is migrated or until the test points at the current rendered composer root.

- [ ] **Step 2: Replace HR-local attachment state with managed composer**

In `apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx`, replace imports with:

```ts
import type { ManagedSessionComposerDraft, SessionComposerOption } from '@zonease/aiworker-ui/components/session-composer'
import type { HrWorkbenchCopy } from './copy'

import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/session-composer'
import { useMemo, useState } from 'react'
```

Remove `HrProfileComposerAttachment`, `HrProfileComposerAttachmentItemLabels`, `createHrProfileComposerAttachmentItem`, `attachmentId`, `createAttachmentPreviewUrl`, `revokeAttachmentPreviewUrls` and `revokeAttachmentPreviewUrl`.

Change `HrProfileComposerSubmitInput`:

```ts
export interface HrProfileComposerSubmitInput {
  attachments: Array<{
    file: File
    mimeType: string
    name: string
    size: number
  }>
  context: string
  draft: HrProfileDraftOption
  materials: ManagedSessionComposerDraft['materials']
}
```

Replace local state with:

```ts
  const [context, setContext] = useState('')
  const [draftTemplateId, setDraftTemplateId] = useState(DEFAULT_PROFILE_DRAFT.templateId)
  const [localError, setLocalError] = useState<string | null>(null)
```

Replace `submitDisabled`:

```ts
  const submitDisabled = disabled || submitting || !profileName
```

Add submit adapter:

```ts
  async function handleSubmitDraft(draft: ManagedSessionComposerDraft) {
    setLocalError(null)
    try {
      await onSubmit({
        attachments: draft.files.map(file => ({
          file,
          mimeType: file.type || 'application/octet-stream',
          name: file.name,
          size: file.size,
        })),
        context: draft.text,
        draft: selectedDraft,
        materials: draft.materials,
      })
      setContext('')
    }
    catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }
```

Replace the return body with:

```tsx
  return (
    <div data-slot="hr-profile-composer" className="h-full min-h-0">
      <ManagedSessionComposer
        ariaLabel={labels.contextLabel}
        attachmentLabels={{
          add: labels.openCandidateMaterialPicker,
          attached: labels.attachedCandidateMaterialsLabel,
          closePreview: labels.closeCandidateMaterialPreview,
          materialReadError: labels.materialReadError,
          preview: labels.previewCandidateMaterial,
          remove: labels.removeCandidateMaterial,
        }}
        className={className ?? 'min-h-0'}
        description={labels.composerSafetyDetail}
        disabled={disabled || !profileName}
        disabledReason={profileName ? undefined : labels.selectProfileFirst}
        error={errorMessage ?? localError}
        placeholder={profileName ? labels.contextPlaceholder : labels.selectProfileFirst}
        selectedTemplateId={draftTemplateId}
        submitAriaLabel={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
        submitDisabled={submitDisabled}
        submitting={submitting}
        submitTitle={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
        templateLabel={labels.draftTypeSelectLabel}
        templateOptions={templateOptions}
        title={selectedDraft.label}
        value={context}
        variant="panel"
        onSubmitDraft={handleSubmitDraft}
        onTemplateChange={setDraftTemplateId}
        onValueChange={setContext}
      />
    </div>
  )
```

- [ ] **Step 3: Run HR tests**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test -- product/web/component-proof.test.tsx product/web/people-workbench/api.test.ts
bun run --filter '@zonease/aiworker-hr' typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit HR migration**

Run:

```bash
git add apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx apps/aiworker-hr/product/web/component-proof.test.tsx
git commit -m "refactor: 让 HR profile composer 使用 managed API"
```

## Task 5: Cross-Package Verification And UI Governance

**Files:**
- Modify only files required by failures from the commands below.

- [ ] **Step 1: Run focused package tests**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-hr' test -- product/web/component-proof.test.tsx product/web/people-workbench/api.test.ts
```

Expected: all commands PASS.

- [ ] **Step 2: Run typechecks**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' typecheck
bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck
bun run --filter '@zonease/aiworker-hr' typecheck
```

Expected: all commands PASS.

- [ ] **Step 3: Run UI governance**

Run:

```bash
bun run ui:check
```

Expected: PASS with no new custom class, icon-library or token violations from the managed composer migration.

- [ ] **Step 4: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: `crg:update` exits 0 and `crg:review` reports no blocking findings. If it reports risk, address concrete findings or record residual risk with the exact focused tests that cover it.

- [ ] **Step 5: Final commit for verification fixes**

If Step 1 through Step 4 required follow-up fixes, commit them:

```bash
git add packages/ui packages/soul-app-workbench apps/aiworker-hr
git commit -m "fix: 收口 managed session composer 迁移验证"
```

If no files changed after previous task commits, skip this commit and record that no verification fixes were needed.

## Self-Review Checklist

- Spec coverage: Tasks 1 and 2 cover the reusable `packages/ui` managed API; Task 3 covers universal workbench new session and follow-up session surfaces; Task 4 covers HR profile composer; Task 5 covers UI governance and code-review-graph.
- Boundary check: `packages/ui` receives labels and emits neutral drafts; Host, workspace, session and HR profile semantics stay in consumers.
- Engine bridge check: no task implements engine tool loops, approvals, memory, event interpretation or orchestration.
- Test check: shared UI tests prove managed behavior; consumer tests prove adapter behavior; final verification covers focused tests, typechecks, UI governance and code-review-graph.
