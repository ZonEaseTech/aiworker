// @vitest-environment happy-dom
import type { FormEvent } from 'react'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ManagedSessionComposer } from './managed-session-composer'
import { SessionComposer } from './session-composer'

afterEach(() => cleanup())

describe('sessionComposer', () => {
  it('opens a composer-attached upward typeahead when the textarea contains an active $ mention', () => {
    const { container } = render(
      <SessionComposer
        ariaLabel="Session input"
        mentionOptions={[
          { description: 'Prepare interview questions.', id: 'interview-brief', label: 'Interview brief' },
          { description: 'Create a candidate profile.', id: 'candidate-profile', label: 'Candidate profile' },
        ]}
        mentionQuery={{ active: true, query: 'inter', trigger: '$' }}
        onMentionSelect={vi.fn()}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Start"
        value="Prepare $inter"
        variant="large"
      />,
    )

    const panel = screen.getByRole('listbox', { name: 'Skill suggestions' })
    expect(panel).toBeTruthy()
    expect(panel.getAttribute('data-session-slot')).toBe('composer-typeahead')
    expect(panel.getAttribute('data-side')).toBe('top')
    expect(panel.closest('[data-session-slot="composer-field"]')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Interview brief/ })).toBeTruthy()
    expect(container.querySelector('[data-session-slot="composer-action-main"] [role="combobox"]')).toBeNull()
  })

  it('does not render a skill picker button when mention options are available', () => {
    render(
      <SessionComposer
        ariaLabel="Session input"
        mentionOptions={[{ id: 'candidate-profile', label: 'Candidate profile' }]}
        onMentionSelect={vi.fn()}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Start"
        value=""
        variant="large"
      />,
    )

    expect(screen.queryByRole('button', { name: /\$ skill/i })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('navigates active mention options from the textarea and skips disabled options', () => {
    const onMentionSelect = vi.fn()
    const onSubmit = vi.fn()

    render(
      <SessionComposer
        ariaLabel="Session input"
        mentionOptions={[
          { id: 'interview-brief', label: 'Interview brief' },
          { disabled: true, id: 'interview-archive', label: 'Interview archive' },
          { id: 'candidate-profile', label: 'Candidate profile' },
        ]}
        mentionQuery={{ active: true, query: '', trigger: '$' }}
        onMentionSelect={onMentionSelect}
        onSubmit={onSubmit}
        onValueChange={vi.fn()}
        submitAriaLabel="Start"
        value="Prepare $"
        variant="large"
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Session input' })
    const panel = screen.getByRole('listbox', { name: 'Skill suggestions' })
    const interviewOption = screen.getByRole('option', { name: /Interview brief/ })
    const disabledOption = screen.getByRole('option', { name: /Interview archive/ })
    const candidateOption = screen.getByRole('option', { name: /Candidate profile/ })

    expect(textarea.getAttribute('aria-expanded')).toBe('true')
    expect(textarea.getAttribute('aria-controls')).toBe(panel.id)
    expect(textarea.getAttribute('aria-activedescendant')).toBe(interviewOption.id)
    expect(interviewOption.getAttribute('aria-selected')).toBe('true')
    expect(disabledOption.getAttribute('aria-disabled')).toBe('true')

    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    expect(textarea.getAttribute('aria-activedescendant')).toBe(candidateOption.id)
    expect(candidateOption.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    expect(textarea.getAttribute('aria-activedescendant')).toBe(interviewOption.id)

    fireEvent.keyDown(textarea, { key: 'ArrowUp' })
    expect(textarea.getAttribute('aria-activedescendant')).toBe(candidateOption.id)

    expect(fireEvent.keyDown(textarea, { key: 'Enter' })).toBe(false)
    expect(onMentionSelect).toHaveBeenCalledWith({ id: 'candidate-profile', label: 'Candidate profile' })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the form from the textarea with Cmd+Enter or Ctrl+Enter only', () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())

    render(
      <SessionComposer
        ariaLabel="Session input"
        onSubmit={onSubmit}
        onValueChange={vi.fn()}
        submitAriaLabel="Start"
        value="Start the focused session"
        variant="large"
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Session input' })

    fireEvent.keyDown(textarea, { key: 'Enter' })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()

    expect(fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })).toBe(false)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    expect(fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })).toBe(false)
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('restores keyboard focus to the textarea when the focus request token changes', async () => {
    const props = {
      ariaLabel: 'Session input',
      onSubmit: vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault()),
      onValueChange: vi.fn(),
      submitAriaLabel: 'Start',
      value: 'Ready to send',
      variant: 'large' as const,
    }

    const { rerender } = render(<SessionComposer {...props} />)

    const submitButton = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement
    submitButton.focus()
    expect(document.activeElement).toBe(submitButton)

    rerender(<SessionComposer {...props} focusRequestToken={1} />)

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Session input' }))
    })
  })

  it('keeps modifier-enter behind the same submit eligibility guard as the send button', () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())
    const props = {
      ariaLabel: 'Session input',
      onSubmit,
      onValueChange: vi.fn(),
      submitAriaLabel: 'Start',
      variant: 'large' as const,
    }

    const { rerender } = render(<SessionComposer {...props} value="" />)
    const textarea = screen.getByRole('textbox', { name: 'Session input' })

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(onSubmit).not.toHaveBeenCalled()

    rerender(<SessionComposer {...props} value="Ready" submitDisabled />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Session input' }), { key: 'Enter', metaKey: true })
    expect(onSubmit).not.toHaveBeenCalled()

    rerender(<SessionComposer {...props} value="Ready" submitting />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Session input' }), { key: 'Enter', ctrlKey: true })
    expect(onSubmit).not.toHaveBeenCalled()

    rerender(
      <SessionComposer
        {...props}
        attachments={[{
          id: 'notes',
          kind: 'TXT',
          name: 'notes.txt',
          removeLabel: 'Remove notes.txt',
        }]}
        value=""
      />,
    )
    expect(fireEvent.keyDown(screen.getByRole('textbox', { name: 'Session input' }), { key: 'Enter', ctrlKey: true })).toBe(false)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('dismisses the active mention typeahead from the textarea', () => {
    const onMentionDismiss = vi.fn()

    render(
      <SessionComposer
        ariaLabel="Session input"
        mentionOptions={[{ id: 'candidate-profile', label: 'Candidate profile' }]}
        mentionQuery={{ active: true, query: '', trigger: '$' }}
        onMentionDismiss={onMentionDismiss}
        onMentionSelect={vi.fn()}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Start"
        value="Prepare $"
        variant="large"
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Session input' })
    expect(fireEvent.keyDown(textarea, { key: 'Escape' })).toBe(false)
    expect(onMentionDismiss).toHaveBeenCalledTimes(1)
  })

  it('keeps the selected mode trigger to one title line while mode options can include descriptions', () => {
    const { container } = render(
      <SessionComposer
        ariaLabel="Profile context"
        onSubmit={vi.fn()}
        onModeChange={vi.fn()}
        onValueChange={vi.fn()}
        selectedModeId="profile-update-proposal"
        submitAriaLabel="Send"
        modeOptions={[
          {
            description: 'profile-update-proposal',
            label: '候选人档案草案',
            value: 'profile-update-proposal',
          },
          {
            description: 'candidate-screen',
            label: '证据整理',
            value: 'candidate-screen',
          },
        ]}
        value=""
        variant="panel"
      />,
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger.textContent).toContain('候选人档案草案')
    expect(trigger.textContent).not.toContain('profile-update-proposal')
    expect(container.querySelector('[data-session-slot="composer-action-left"] [data-slot="button"] svg')).toBeNull()
  })

  it('centers icon-only attachment and submit actions without inline-start padding hints', () => {
    const { container } = render(
      <SessionComposer
        ariaLabel="Profile context"
        attachmentTriggerLabel="Attach"
        onAddAttachments={vi.fn()}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Send"
        value="Draft"
        variant="panel"
      />,
    )

    const attachIcon = screen.getByRole('button', { name: 'Attach' }).querySelector('svg')
    const submitIcon = screen.getByRole('button', { name: 'Send' }).querySelector('svg')
    expect(attachIcon?.hasAttribute('data-icon')).toBe(false)
    expect(submitIcon?.hasAttribute('data-icon')).toBe(false)
    expect(container.querySelectorAll('[data-session-slot="composer-action-bar"] [data-icon="inline-start"]').length).toBe(0)
  })

  it('lets the panel textarea fill the fixed composer pane instead of staying content-sized', () => {
    const { container } = render(
      <SessionComposer
        ariaLabel="Profile context"
        className="h-full min-h-0"
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Send"
        title="候选人档案草案"
        value=""
        variant="panel"
      />,
    )

    const field = container.querySelector('[data-session-slot="composer-field"]')
    const textarea = container.querySelector('[data-session-slot="composer-input"]')
    expect(field?.className).toContain('flex-1')
    expect(textarea?.className).toContain('flex-1')
    expect(textarea?.className).toContain('max-h-none')
    expect(textarea?.className).toContain('field-sizing-fixed')
  })

  it('keeps composer action buttons inside the shadcn input-group composition', () => {
    render(
      <SessionComposer
        ariaLabel="Follow-up"
        attachmentCountLabel="Attached materials"
        attachmentTriggerLabel="Add material"
        attachments={[{
          id: 'readme',
          kind: 'MD',
          name: 'README.md',
          removeLabel: 'Remove README.md',
        }]}
        onAddAttachments={vi.fn()}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Send"
        value="Continue"
        variant="compact"
      />,
    )

    const addMaterialButton = screen.getByRole('button', { name: 'Add material' })
    expect(addMaterialButton.closest('[data-slot="input-group-addon"]')).toBeTruthy()
    expect(addMaterialButton.className).not.toContain('relative')

    const countBadge = screen.getByLabelText('Attached materials')
    expect(countBadge.getAttribute('data-slot')).toBe('badge')
    expect(countBadge.className).not.toContain('absolute')

    const attachmentItem = screen.getByText('README.md').closest('[data-slot="item"]')
    expect(attachmentItem).toBeTruthy()
    expect(attachmentItem?.closest('[data-slot="card"]')).toBeNull()

    const submitButton = screen.getByRole('button', { name: 'Send' })
    expect(submitButton.closest('[data-slot="input-group-addon"]')).toBeTruthy()
    expect(submitButton.getAttribute('data-slot')).toBe('button')
  })

  it('renders image attachment previews without an outline button frame', () => {
    render(
      <SessionComposer
        ariaLabel="Follow-up"
        attachments={[{
          id: 'source-image',
          kind: 'PNG',
          mediaType: 'image',
          name: 'source-image.png',
          onPreviewLabel: 'Preview source-image.png',
          previewUrl: 'blob:source-image',
          removeLabel: 'Remove source-image.png',
        }]}
        onRemoveAttachment={vi.fn()}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Send"
        value="Continue"
        variant="compact"
      />,
    )

    const previewButton = screen.getByRole('button', { name: 'Preview source-image.png' })
    expect(previewButton.getAttribute('data-slot')).toBe('button')
    expect(previewButton.getAttribute('data-variant')).toBe('ghost')
    expect(previewButton.className).not.toContain('border-border')
    const media = previewButton.querySelector('[data-slot="item-media"][data-variant="image"]')
    expect(media).toBeTruthy()
    expect(media?.className).toContain('size-14')
    expect(media?.querySelector('img')?.getAttribute('src')).toBe('blob:source-image')
    expect(previewButton.closest('[data-slot="card"]')).toBeNull()
  })

  it('submits a neutral managed draft with text, materials, mode and mentions', async () => {
    const onSubmitDraft = vi.fn()
    const onValueChange = vi.fn()
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        mentionOptions={[{ id: 'review-notes', label: 'Review notes' }]}
        onSubmitDraft={onSubmitDraft}
        onValueChange={onValueChange}
        selectedModeId="review-mode"
        submitAriaLabel="Start"
        modeOptions={[{ label: 'Review mode', value: 'review-mode' }]}
        value="Use $review-notes"
        variant="large"
      />,
    )

    fireEvent.change(screen.getByTestId('managed-session-file-input'), {
      target: { files: [file] },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Session input' }))

    await waitFor(() => expect(onSubmitDraft).toHaveBeenCalledTimes(1))
    const draft = onSubmitDraft.mock.calls[0]?.[0]
    expect(draft).toMatchObject({
      text: 'Use $review-notes',
      selectedModeId: 'review-mode',
      mentions: [{ id: 'review-notes', kind: 'skill', label: 'Review notes' }],
      materials: [{
        content: 'hello',
        encoding: 'utf8',
        mimeType: 'text/plain',
        name: 'notes.txt',
        size: file.size,
      }],
    })
    expect(draft.files[0]).toBe(file)
  })

  it('reads TSV attachments without a MIME type as utf8 source material', async () => {
    const onSubmitDraft = vi.fn()
    const file = new File(['col_a\tcol_b\n1\t2\n'], 'burn-20260528021436.tsv')

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Read this"
        onSubmitDraft={onSubmitDraft}
        submitAriaLabel="Start"
      />,
    )

    fireEvent.change(screen.getByTestId('managed-session-file-input'), {
      target: { files: [file] },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Session input' }))

    await waitFor(() => expect(onSubmitDraft).toHaveBeenCalledTimes(1))
    expect(onSubmitDraft.mock.calls[0]?.[0].materials[0]).toMatchObject({
      content: 'col_a\tcol_b\n1\t2\n',
      encoding: 'utf8',
      mimeType: 'application/octet-stream',
      name: 'burn-20260528021436.tsv',
    })
  })

  it('shows the controlled selected mode label and submits its id', async () => {
    const onSubmitDraft = vi.fn()

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Create the profile"
        onSubmitDraft={onSubmitDraft}
        onModeChange={vi.fn()}
        selectedModeId="aiworker-demo-people.profile"
        submitAriaLabel="Start"
        modeLabel="Mode"
        modeOptions={[{
          description: 'Create a source-backed people profile snapshot.',
          label: 'Person Profile',
          value: 'aiworker-demo-people.profile',
        }]}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Mode' }).textContent).toContain('Person Profile')
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.submit(screen.getByRole('form', { name: 'Session input' }))

    await waitFor(() => expect(onSubmitDraft).toHaveBeenCalledTimes(1))
    expect(onSubmitDraft.mock.calls[0]?.[0]).toMatchObject({
      selectedModeId: 'aiworker-demo-people.profile',
      text: 'Create the profile',
    })
  })

  it('clears managed text and attachments after successful submit', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:success-preview')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const onSubmitDraft = vi.fn()
    const onValueChange = vi.fn()
    const file = new File(['image'], 'source-image.png', { type: 'image/png' })

    try {
      render(
        <ManagedSessionComposer
          ariaLabel="Session input"
          attachmentLabels={{
            add: 'Add material',
            attached: 'Attached materials',
            closePreview: name => `Close preview ${name}`,
            materialReadError: 'Could not read material',
            preview: name => `Preview ${name}`,
            remove: name => `Remove ${name}`,
          }}
          defaultValue="Draft request"
          onSubmitDraft={onSubmitDraft}
          onValueChange={onValueChange}
          submitAriaLabel="Start"
        />,
      )

      fireEvent.change(screen.getByTestId('managed-session-file-input'), {
        target: { files: [file] },
      })
      await screen.findByRole('button', { name: 'Preview source-image.png' })

      fireEvent.submit(screen.getByRole('form', { name: 'Session input' }))

      await waitFor(() => expect(onSubmitDraft).toHaveBeenCalledTimes(1))
      expect(onValueChange).toHaveBeenLastCalledWith('')
      expect((screen.getByRole('textbox', { name: 'Session input' }) as HTMLTextAreaElement).value).toBe('')
      expect(screen.queryByRole('button', { name: 'Preview source-image.png' })).toBeNull()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:success-preview')
    }
    finally {
      createObjectURL.mockRestore()
      revokeObjectURL.mockRestore()
    }
  })

  it('clears open image previews when the attachment list is cleared and replaced', async () => {
    const firstAttachment = {
      closePreviewLabel: 'Close preview first-image.png',
      id: 'first-image',
      kind: 'PNG',
      mediaType: 'image' as const,
      name: 'first-image.png',
      onPreviewLabel: 'Preview first-image.png',
      previewUrl: 'blob:first-preview',
      removeLabel: 'Remove first-image.png',
    }
    const secondAttachment = {
      closePreviewLabel: 'Close preview second-image.png',
      id: 'second-image',
      kind: 'PNG',
      mediaType: 'image' as const,
      name: 'second-image.png',
      onPreviewLabel: 'Preview second-image.png',
      previewUrl: 'blob:second-preview',
      removeLabel: 'Remove second-image.png',
    }

    const { rerender } = render(
      <SessionComposer
        ariaLabel="Session input"
        attachments={[firstAttachment]}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Start"
        value="Draft request"
        variant="large"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Preview first-image.png' }))
    await screen.findByRole('button', { name: 'Close preview first-image.png' })

    rerender(
      <SessionComposer
        ariaLabel="Session input"
        attachments={[]}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Start"
        value="Draft request"
        variant="large"
      />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Close preview first-image.png' })).toBeNull()
    })

    rerender(
      <SessionComposer
        ariaLabel="Session input"
        attachments={[secondAttachment]}
        onSubmit={vi.fn()}
        onValueChange={vi.fn()}
        submitAriaLabel="Start"
        value="Draft request"
        variant="large"
      />,
    )

    await screen.findByRole('button', { name: 'Preview second-image.png' })
    expect(screen.queryByRole('button', { name: 'Close preview first-image.png' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close preview second-image.png' })).toBeNull()
  })

  it('preserves managed draft and shows submit errors', async () => {
    const onSubmitDraft = vi.fn().mockRejectedValue(new Error('Create session failed'))

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Keep this"
        onSubmitDraft={onSubmitDraft}
        submitAriaLabel="Start"
      />,
    )

    fireEvent.submit(screen.getByRole('form', { name: 'Session input' }))

    expect(await screen.findByText('Create session failed')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Session input' }) as HTMLTextAreaElement).value).toBe('Keep this')
  })

  it('renders external managed composer errors', () => {
    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Keep this"
        error="Profile session failed"
        onSubmitDraft={vi.fn()}
        submitAriaLabel="Start"
      />,
    )

    expect(screen.getByText('Profile session failed')).toBeTruthy()
  })

  it('guards async managed submit and attachment edits while pending', async () => {
    let resolveSubmit: (() => void) | undefined
    const pendingSubmit = new Promise<void>((resolve) => {
      resolveSubmit = resolve
    })
    const onSubmitDraft = vi.fn(() => pendingSubmit)
    const file = new File(['pending'], 'pending.txt', { type: 'text/plain' })

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Start session"
        onSubmitDraft={onSubmitDraft}
        submitAriaLabel="Start"
      />,
    )

    const form = screen.getByRole('form', { name: 'Session input' })
    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => expect(onSubmitDraft).toHaveBeenCalledTimes(1))
    expect((screen.getByRole('textbox', { name: 'Session input' }) as HTMLTextAreaElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Start' }).getAttribute('aria-busy')).toBe('true')
    expect((screen.getByRole('button', { name: 'Add material' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('managed-session-file-input') as HTMLInputElement).disabled).toBe(true)

    fireEvent.change(screen.getByTestId('managed-session-file-input'), {
      target: { files: [file] },
    })
    expect(screen.queryByText('pending.txt')).toBeNull()

    resolveSubmit?.()
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Session input' }) as HTMLTextAreaElement).value).toBe(''))
  })

  it('does not add managed files while disabled', () => {
    const file = new File(['disabled'], 'disabled.txt', { type: 'text/plain' })

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Start session"
        disabled
        onSubmitDraft={vi.fn()}
        submitAriaLabel="Start"
      />,
    )

    expect((screen.getByTestId('managed-session-file-input') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Add material' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('managed-session-file-input'), {
      target: { files: [file] },
    })

    expect(screen.queryByText('disabled.txt')).toBeNull()
  })

  it('deduplicates managed attachments by name, size and MIME type', async () => {
    const file = new File(['same'], 'same.txt', { type: 'text/plain' })

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Draft request"
        onSubmitDraft={vi.fn()}
        submitAriaLabel="Start"
      />,
    )

    const input = screen.getByTestId('managed-session-file-input')
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getAllByText('same.txt')).toHaveLength(1))
  })

  it('preserves duplicate managed attachments when dedupe is disabled', async () => {
    const firstFile = new File(['same'], 'same.txt', { type: 'text/plain' })
    const secondFile = new File(['same'], 'same.txt', { type: 'text/plain' })

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        dedupeAttachments={false}
        defaultValue="Draft request"
        onSubmitDraft={vi.fn()}
        submitAriaLabel="Start"
      />,
    )

    fireEvent.change(screen.getByTestId('managed-session-file-input'), {
      target: { files: [firstFile, secondFile] },
    })

    await waitFor(() => expect(screen.getAllByText('same.txt')).toHaveLength(2))
  })

  it('releases managed image preview URLs on removal and unmount', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const file = new File(['image'], 'source-image.png', { type: 'image/png' })

    const { unmount } = render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Draft request"
        onSubmitDraft={vi.fn()}
        submitAriaLabel="Start"
      />,
    )

    const input = screen.getByTestId('managed-session-file-input')
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove source-image.png' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview')

    fireEvent.change(input, { target: { files: [file] } })
    await screen.findByRole('button', { name: 'Preview source-image.png' })
    unmount()

    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it('uses managed close labels for image attachment previews', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const file = new File(['image'], 'source-image.png', { type: 'image/png' })

    try {
      render(
        <ManagedSessionComposer
          ariaLabel="Session input"
          attachmentLabels={{
            add: 'Add material',
            attached: 'Attached materials',
            closePreview: name => `Close preview ${name}`,
            materialReadError: 'Could not read material',
            preview: name => `Preview ${name}`,
            remove: name => `Remove ${name}`,
          }}
          defaultValue="Draft request"
          onSubmitDraft={vi.fn()}
          submitAriaLabel="Start"
        />,
      )

      fireEvent.change(screen.getByTestId('managed-session-file-input'), {
        target: { files: [file] },
      })
      fireEvent.click(await screen.findByRole('button', { name: 'Preview source-image.png' }))

      const closeButton = await screen.findByRole('button', { name: 'Close preview source-image.png' })
      fireEvent.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Close preview source-image.png' })).toBeNull()
      })
    }
    finally {
      createObjectURL.mockRestore()
      revokeObjectURL.mockRestore()
    }
  })
})
