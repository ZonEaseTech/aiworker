import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { messagesFor } from '../../i18n'
import { CreateWorkspaceDialog } from './creation-dialogs'

const copy = messagesFor('en')

describe('creation dialogs', () => {
  it('renders the workspace dialog with shadcn slots and no legacy creation shell classes', () => {
    render(
      <CreateWorkspaceDialog
        copy={copy}
        open
        placeholder="Release name"
        submitting={false}
        workerLabel="Demo People"
        workspaceTitle="Demo Workspace"
        onClose={vi.fn()}
        onSubmit={event => event.preventDefault()}
        onTitleChange={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: copy.workspace.createWorkspace })
    expect(dialog.getAttribute('data-slot')).toBe('dialog-content')
    expect(dialog.classList.contains('creation-dialog')).toBe(false)

    const workerInput = within(dialog).getByDisplayValue('Demo People')
    expect(workerInput.getAttribute('data-slot')).toBe('input')

    const workspaceInput = within(dialog).getByTestId('new-project-name')
    expect(workspaceInput.getAttribute('data-slot')).toBe('input')
    expect(dialog.querySelector('[data-slot="field-group"] [data-slot="field-group"]')).toBeNull()

    const footer = dialog.querySelector('[data-slot="dialog-footer"]')
    expect(footer).not.toBeNull()

    const submit = within(dialog).getByTestId('create-project')
    expect(submit.getAttribute('data-slot')).toBe('button')
    expect(submit.querySelector('svg')?.getAttribute('data-icon')).toBe('inline-start')
  })
})
