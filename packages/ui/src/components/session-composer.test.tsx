// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

  it('keeps the selected template trigger to one title line while menu options can include descriptions', () => {
    const { container } = render(
      <SessionComposer
        ariaLabel="Profile context"
        onSubmit={vi.fn()}
        onTemplateChange={vi.fn()}
        onValueChange={vi.fn()}
        selectedTemplateId="profile-update-proposal"
        submitAriaLabel="Send"
        templateOptions={[
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
})
