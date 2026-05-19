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
  normalizeSessionEvents,
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
        attachments={[{ id: 'a1', kind: 'MD', name: 'resume.md', removeLabel: 'Remove resume.md', size: '1 KB' }]}
        description="Drafts stay reviewable before profile promotion."
        selectedTemplateId="profile-update-proposal"
        submitAriaLabel="Generate profile draft"
        submitTitle="Generate profile draft"
        templateLabel="Proposal type"
        templateOptions={[{ label: 'Candidate profile proposal', value: 'profile-update-proposal' }]}
        title="Complete Hiring Workspace candidate profile"
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
    expect(screen.getByRole('combobox', { name: 'Proposal type' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate profile draft' })).toBeTruthy()
    expect(screen.getByText('resume.md')).toBeTruthy()
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
