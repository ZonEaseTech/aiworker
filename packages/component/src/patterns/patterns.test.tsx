// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ArtifactPreviewFrame,
  MessageFlow,
  ProfileReaderShell,
  ProgressCard,
  ReviewPanelShell,
  SegmentedControl,
  SettingsShell,
  SessionComposer,
  SessionDetailPanel,
  SessionTimeline,
  StatusEventPill,
  ToolResultCard,
  createComposerAttachment,
  createSessionTimelineViewModel,
  formatSessionAttachmentKind,
  formatSessionAttachmentSize,
  isSessionAttachmentImage,
  normalizeSessionEvents,
  summarizeSessionUsage,
} from '.'

afterEach(() => cleanup())

describe('shared patterns', () => {
  it('renders settings sidebar and content regions', () => {
    render(
      <SettingsShell
        sidebar={<nav aria-label="Settings navigation">Navigation</nav>}
        content={<main>Main content</main>}
      />,
    )

    expect(screen.getByRole('complementary').textContent).toContain('Navigation')
    expect(screen.getByRole('main').textContent).toBe('Main content')
  })

  it('changes segmented control value', () => {
    const onChange = vi.fn()

    render(
      <SegmentedControl
        ariaLabel="View mode"
        value="list"
        onChange={onChange}
        options={[
          { label: 'List', value: 'list' },
          { description: 'Dense', label: 'Table', value: 'table' },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Table/ }))
    expect(onChange).toHaveBeenCalledWith('table')
  })

  it('renders progress card label detail and compact class', () => {
    render(<ProgressCard compact label="Running" detail="2 steps left" />)

    const card = screen.getByText('Running').closest('.session-progress-card')
    expect(card?.classList.contains('compact')).toBe(true)
    expect(screen.getByText('2 steps left')).toBeTruthy()
  })

  it('renders artifact and review shell state variants', () => {
    const { rerender } = render(
      <ArtifactPreviewFrame
        title="Artifact"
        description="Preview"
        actions={<button type="button">Open</button>}
      >
        <p>Rendered artifact body</p>
      </ArtifactPreviewFrame>,
    )

    expect(screen.getByText('Artifact').closest('.artifact-preview-frame')).toBeTruthy()
    expect(screen.getByText('Preview')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
    expect(screen.getByText('Rendered artifact body').closest('.surface-shell-body')).toBeTruthy()

    rerender(<ReviewPanelShell title="Review" loading="Checking review" />)
    expect(screen.getByText('Checking review').closest('.surface-shell-state')).toBeTruthy()

    rerender(<ReviewPanelShell title="Review" error="Review failed" />)
    expect(screen.getByRole('alert').textContent).toBe('Review failed')

    rerender(<ReviewPanelShell title="Review" empty="No review yet" />)
    expect(screen.getByText('No review yet').closest('.surface-shell-state')).toBeTruthy()
  })

  it('renders message flow rows tool cards and status pills', () => {
    render(
      <MessageFlow aria-label="Session messages">
        <StatusEventPill detail="2 files" tone="success">Saved</StatusEventPill>
        <ToolResultCard command="aiworker status" result="ok" tone="muted" />
      </MessageFlow>,
    )

    expect(screen.getByLabelText('Session messages').classList.contains('message-flow')).toBe(true)
    expect(screen.getByText('Saved').closest('.status-event-pill-success')).toBeTruthy()
    expect(screen.getByText('2 files')).toBeTruthy()
    expect(screen.getByText('aiworker status')).toBeTruthy()
    expect(screen.getByText('ok')).toBeTruthy()
  })

  it('renders profile reader states without domain language', () => {
    const { rerender, container } = render(<ProfileReaderShell loading title="Profile" />)

    expect(container.textContent?.toLowerCase()).not.toContain('candidate')
    expect(container.textContent?.toLowerCase()).not.toContain('hr')

    rerender(<ProfileReaderShell title="Profile" error="Could not load" />)
    expect(screen.getByRole('alert').textContent).toBe('Could not load')

    rerender(<ProfileReaderShell title="Profile" empty="No profile selected" />)
    expect(screen.getByText('No profile selected')).toBeTruthy()
  })

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
    expect(isSessionAttachmentImage(new File(['png'], 'portrait.png', { type: 'image/png' }))).toBe(true)
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

  it('renders session composer action bar with attachments template and submit', () => {
    const onSubmit = vi.fn(event => event.preventDefault())

    render(
      <SessionComposer
        ariaLabel="Profile draft material"
        attachmentTriggerLabel="Add candidate materials"
        attachments={[
          { id: 'a1', kind: 'MD', name: 'resume.md', removeLabel: 'Remove resume.md', size: '1 KB' },
          {
            closePreviewLabel: 'Close preview',
            id: 'a2',
            kind: 'PNG',
            mediaType: 'image',
            name: 'portrait.png',
            onPreviewLabel: 'Preview portrait.png',
            previewAlt: 'portrait.png',
            previewTitle: 'portrait.png',
            previewUrl: 'blob:portrait',
            removeLabel: 'Remove portrait.png',
            size: '12 KB',
          },
        ]}
        description="Drafts stay reviewable before profile promotion."
        selectedTemplateId="profile-update-proposal"
        submitAriaLabel="Generate profile draft"
        submitTitle="Generate profile draft"
        templateLabel="Proposal type"
        templateOptions={[{ label: 'Candidate profile proposal', value: 'profile-update-proposal' }]}
        title="Complete Hiring Workspace candidate profile"
        usage={{ ariaLabel: 'Usage 120 input tokens, 15 output tokens', label: 'Usage', meterValue: 0.89, value: '120 in / 15 out' }}
        value="Summarize new evidence"
        onAddAttachments={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onSubmit={onSubmit}
        onTemplateChange={vi.fn()}
        onValueChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Profile draft material' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add candidate materials' })).toBeTruthy()
    expect(screen.getByLabelText('Usage 120 input tokens, 15 output tokens')).toBeTruthy()
    expect(screen.getByText('120 in / 15 out').closest('.session-composer-action-right')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Proposal type' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate profile draft' })).toBeTruthy()
    expect(screen.getByText('resume.md')).toBeTruthy()
    const composerField = screen.getByRole('textbox', { name: 'Profile draft material' }).closest('.session-composer-field')
    expect(composerField).toBeTruthy()
    expect(composerField?.querySelector('.session-composer-attachment-list')).toBeTruthy()
    expect(composerField?.querySelector('.session-composer-action-bar')).toBeTruthy()
    expect(screen.getByText('resume.md').closest('.session-composer-attachment-card')?.classList.contains('file')).toBe(true)
    expect(screen.getByRole('button', { name: 'Preview portrait.png' }).closest('.session-composer-attachment-card')?.classList.contains('image')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Preview portrait.png' }))
    expect(screen.getByRole('dialog', { name: 'portrait.png' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    expect(screen.queryByRole('dialog', { name: 'portrait.png' })).toBeNull()
  })

  it('hands pasted files to the session composer consumer once', () => {
    const onAddAttachmentFiles = vi.fn()
    const portrait = new File(['png'], 'portrait.png', { lastModified: 1, type: 'image/png' })
    const duplicatePortrait = new File(['png'], 'portrait.png', { lastModified: 2, type: 'image/png' })
    const source = new File(['name,role'], 'bom_export_2026.csv', { type: 'text/csv' })
    const clipboardData = {
      files: [portrait],
      items: [
        { getAsFile: () => duplicatePortrait, kind: 'file' },
        { getAsFile: () => source, kind: 'file' },
        { getAsFile: () => null, kind: 'string' },
      ],
    } as unknown as DataTransfer

    render(
      <SessionComposer
        ariaLabel="Profile draft material"
        attachmentTriggerLabel="Add candidate materials"
        placeholder="Ask for the next change"
        submitAriaLabel="Generate profile draft"
        value=""
        onAddAttachmentFiles={onAddAttachmentFiles}
        onAddAttachments={vi.fn()}
        onSubmit={event => event.preventDefault()}
        onValueChange={vi.fn()}
      />,
    )

    fireEvent.paste(screen.getByRole('textbox', { name: 'Profile draft material' }), { clipboardData })

    expect(onAddAttachmentFiles).toHaveBeenCalledTimes(1)
    expect(onAddAttachmentFiles.mock.calls[0]?.[0].map((file: File) => file.name)).toEqual(['portrait.png', 'bom_export_2026.csv'])
  })

  it('classifies Codex CLI tool events as readable activity with raw evidence', () => {
    const events = normalizeSessionEvents([
      {
        id: 'tool-use',
        payloadJson: { agentEvent: { id: 'run-1', input: { command: 'rg -n "SessionTimeline" packages/component/src' }, kind: 'tool_use', name: 'Bash' } },
        seq: 1,
        turnId: 'turn-1',
        type: 'tool',
      },
      {
        id: 'tool-result',
        payloadJson: { agentEvent: { content: 'packages/component/src/patterns/session-timeline.tsx:1', id: 'run-1', isError: false, kind: 'tool_result' } },
        seq: 2,
        turnId: 'turn-1',
        type: 'tool',
      },
    ], { parser: 'codex-cli' })
    const viewModel = createSessionTimelineViewModel({
      events,
      turns: [{ id: 'turn-1', input: 'Find timeline', seq: 1, status: 'succeeded' }],
    })
    const activity = viewModel.turns[0]?.events[0]

    expect(activity?.kind).toBe('activity')
    if (activity?.kind !== 'activity')
      return
    expect(activity.activityKind).toBe('search')
    expect(activity.label).toBe('Searched files')
    expect(activity.details?.some(detail => detail.value.includes('rg -n'))).toBe(true)
    expect(activity.details?.some(detail => detail.value.includes('session-timeline.tsx'))).toBe(true)
  })

  it('treats empty Codex search results as completed exploration instead of an expanded failure', () => {
    const events = normalizeSessionEvents([
      {
        id: 'tool-use',
        payloadJson: { agentEvent: { id: 'run-empty', input: { command: 'rg -n "secret" README.md' }, kind: 'tool_use', name: 'Bash' } },
        seq: 1,
        turnId: 'turn-1',
        type: 'tool',
      },
      {
        id: 'tool-result',
        payloadJson: { agentEvent: { content: '', id: 'run-empty', isError: true, kind: 'tool_result' } },
        seq: 2,
        turnId: 'turn-1',
        type: 'tool',
      },
    ], { parser: 'codex-cli' })
    const viewModel = createSessionTimelineViewModel({
      events,
      turns: [{ id: 'turn-1', input: 'Search secrets', seq: 1, status: 'succeeded' }],
    })
    const activity = viewModel.turns[0]?.events[0]

    expect(activity?.kind).toBe('activity')
    if (activity?.kind !== 'activity')
      return
    expect(activity.status).toBe('succeeded')
    expect(activity.label).toBe('Searched files')
  })

  it('collapses repeated Codex file-change status updates for the same path', () => {
    const events = normalizeSessionEvents([
      {
        id: 'file-1',
        payloadJson: { agentEvent: { detail: 'add artifacts/profile.md (in_progress)', kind: 'status', label: 'file_change', status: 'in_progress' } },
        seq: 1,
        turnId: 'turn-1',
        type: 'status',
      },
      {
        id: 'file-2',
        payloadJson: { agentEvent: { detail: 'add artifacts/profile.md (completed)', kind: 'status', label: 'file_change', status: 'completed' } },
        seq: 2,
        turnId: 'turn-1',
        type: 'status',
      },
    ], { parser: 'codex-cli' })
    const viewModel = createSessionTimelineViewModel({
      events,
      turns: [{ id: 'turn-1', input: 'Write artifact', seq: 1, status: 'succeeded' }],
    })

    expect(viewModel.turns[0]?.events).toHaveLength(1)
    const activity = viewModel.turns[0]?.events[0]
    expect(activity?.kind).toBe('activity')
    if (activity?.kind !== 'activity')
      return
    expect(activity.label).toBe('Created file')
    expect(activity.status).toBe('succeeded')
  })

  it('collapses Codex status output signals and keeps usage for the composer', () => {
    const events = normalizeSessionEvents([
      {
        id: 'status-1',
        payloadJson: { agentEvent: { detail: 'running', kind: 'status', label: 'status' } },
        seq: 1,
        turnId: 'turn-1',
        type: 'status',
      },
      {
        id: 'status-2',
        payloadJson: { agentEvent: { detail: 'Codex CLI via Local CLI', kind: 'status', label: 'initializing' } },
        seq: 2,
        turnId: 'turn-1',
        type: 'status',
      },
      {
        id: 'usage-1',
        payloadJson: { agentEvent: { inputTokens: 175170, kind: 'usage', outputTokens: 3446 } },
        seq: 3,
        turnId: 'turn-1',
        type: 'usage',
      },
      {
        id: 'artifact-1',
        payloadJson: { path: 'artifacts/profile.md' },
        seq: 4,
        turnId: 'turn-1',
        type: 'artifact',
      },
      {
        id: 'review-1',
        payloadJson: { verdict: 'needs_review' },
        seq: 5,
        turnId: 'turn-1',
        type: 'review',
      },
      {
        id: 'status-3',
        payloadJson: { agentEvent: { detail: 'succeeded', kind: 'status', label: 'status' } },
        seq: 6,
        turnId: 'turn-1',
        type: 'status',
      },
    ], { parser: 'codex-cli' })
    const usage = summarizeSessionUsage(events)
    const viewModel = createSessionTimelineViewModel({
      events,
      turns: [{ id: 'turn-1', input: 'Build profile', seq: 1, status: 'succeeded' }],
    })

    expect(usage).toMatchObject({ inputTokens: 175170, outputTokens: 3446 })
    expect(viewModel.turns[0]?.events.map(event => event.kind)).toEqual(['signal', 'signal'])
    expect(viewModel.turns[0]?.events.some(event => event.kind === 'usage')).toBe(false)
    expect(viewModel.turns[0]?.events.filter(event => event.kind === 'signal').map(event => event.label)).toEqual(['Session running', 'Session output'])
  })

  it('renders session timeline turns and event blocks', () => {
    render(
      <SessionTimeline
        assistantRoleLabel="Agent"
        operatorRoleLabel="Operator"
        turns={[{
          events: [{ detail: 'artifact.md', id: 'event-1', kind: 'status', label: 'file_change', turnId: 'turn-1' }],
          turn: { id: 'turn-1', input: 'Build profile', seq: 1, status: 'running' },
        }]}
      />,
    )

    expect(screen.getByText('Operator')).toBeTruthy()
    expect(screen.getByText('Build profile')).toBeTruthy()
    expect(screen.getByText('Agent')).toBeTruthy()
    expect(screen.getByText('file_change')).toBeTruthy()
  })

  it('renders session timeline assistant text as markdown', () => {
    render(
      <SessionTimeline
        assistantRoleLabel="Agent"
        operatorRoleLabel="Operator"
        turns={[{
          events: [{ id: 'event-1', kind: 'text', text: '- first\n- `second`', turnId: 'turn-1' }],
          turn: { id: 'turn-1', input: 'Render markdown', seq: 1, status: 'succeeded' },
        }]}
      />,
    )

    expect(screen.getByText('first').closest('li')).toBeTruthy()
    expect(screen.getByText('second').tagName.toLowerCase()).toBe('code')
  })

  it('renders codex activity without exposing Bash as the primary label', () => {
    render(
      <SessionTimeline
        assistantRoleLabel="Agent"
        operatorRoleLabel="Operator"
        turns={[{
          events: [{
            activityKind: 'search',
            command: 'rg SessionTimeline packages/component',
            details: [{ label: 'Command', value: 'rg SessionTimeline packages/component' }],
            id: 'activity-1',
            kind: 'activity',
            label: 'Searched files',
            status: 'succeeded',
            toolName: 'Bash',
            toolUseId: 'run-1',
            turnId: 'turn-1',
          }],
          turn: { id: 'turn-1', input: 'Search', seq: 1, status: 'succeeded' },
        }]}
      />,
    )

    expect(screen.getByText('Searched files')).toBeTruthy()
    expect(screen.queryByText('Bash')).toBeNull()
    fireEvent.click(screen.getByText('Searched files'))
    expect(screen.getByText('rg SessionTimeline packages/component')).toBeTruthy()
  })

  it('renders session timeline tool result next to its tool call', () => {
    render(
      <SessionTimeline
        assistantRoleLabel="Agent"
        operatorRoleLabel="Operator"
        turns={[{
          events: [
            { id: 'tool-1', input: { command: 'aiworker status', description: 'Inspect worker' }, kind: 'tool_use', name: 'Shell', toolUseId: 'run-1', turnId: 'turn-1' },
            { content: 'ok', id: 'result-1', kind: 'tool_result', toolUseId: 'run-1', turnId: 'turn-1' },
          ],
          turn: { id: 'turn-1', input: 'Check status', seq: 1, status: 'succeeded' },
        }]}
      />,
    )

    expect(screen.getByText('Shell')).toBeTruthy()
    expect(screen.getByText('done')).toBeTruthy()
    expect(screen.getByText('aiworker status')).toBeTruthy()
    expect(screen.getByText('ok')).toBeTruthy()
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
})
