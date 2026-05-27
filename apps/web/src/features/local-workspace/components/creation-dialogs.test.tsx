import type { VerticalSoul } from '../types.compat'

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { messagesFor } from '../../i18n'
import { CreateWorkerDialog, CreateWorkspaceDialog } from './creation-dialogs'

const copy = messagesFor('en')
const soul = {
  defaultCapabilities: [],
  description: 'People operations workspace',
  id: 'aiworker-demo-people',
  name: 'Demo People',
  status: 'available',
} as VerticalSoul

describe('creation dialogs', () => {
  it('renders the worker dialog through shadcn dialog, field, select and button slots', () => {
    render(
      <CreateWorkerDialog
        availableSouls={[soul]}
        copy={copy}
        locale="en"
        open
        selectedSoulId={soul.id}
        workerName="Demo People"
        onClose={vi.fn()}
        onNameChange={vi.fn()}
        onSoulChange={vi.fn()}
        onSubmit={event => event.preventDefault()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: copy.workspace.createWorker })
    expect(dialog.getAttribute('data-slot')).toBe('dialog-content')
    expect(within(dialog).getByRole('heading', { name: copy.workspace.createWorker }).getAttribute('data-slot')).toBe('dialog-title')
    expect(within(dialog).getByText(copy.workspace.createWorkerHint).getAttribute('data-slot')).toBe('dialog-description')

    const soulTrigger = within(dialog).getByRole('combobox', { name: copy.create.soul })
    expect(soulTrigger.getAttribute('data-slot')).toBe('select-trigger')
    expect(dialog.querySelector('[data-slot="field-group"] [data-slot="field-group"]')).toBeNull()

    const workerInput = within(dialog).getByLabelText(copy.workspace.workerName)
    expect(workerInput.getAttribute('data-slot')).toBe('input')

    const submit = within(dialog).getByRole('button', { name: copy.workspace.createWorker })
    expect(submit.getAttribute('data-slot')).toBe('button')
    expect(submit.getAttribute('data-variant')).toBe('default')
    expect(submit.querySelector('svg')?.getAttribute('data-icon')).toBe('inline-start')

    const closeButtons = within(dialog).getAllByRole('button', { name: copy.accessibility.closeDialog })
    expect(closeButtons.every(button => button.getAttribute('data-slot') === 'dialog-close')).toBe(true)
    expect(closeButtons[0]?.getAttribute('data-variant')).toBe('ghost')
    expect(closeButtons[0]?.getAttribute('data-size')).toBe('icon-sm')
    expect(closeButtons[0]?.querySelector('svg')?.getAttribute('data-icon')).toBe('inline-start')
  })

  it('renders the workspace dialog with shadcn slots and no legacy creation shell classes', () => {
    render(
      <CreateWorkspaceDialog
        copy={copy}
        open
        placeholder="Release name"
        submitting={false}
        workerLabel="Demo People"
        workspaceTitle="Hiring Workspace"
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
