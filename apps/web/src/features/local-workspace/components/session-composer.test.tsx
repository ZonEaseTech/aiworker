import type { LocalWorkspace } from '@zonease/aiworker-shared'
import type { CapabilityTemplate } from '../types.compat'

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { messagesFor } from '../../i18n'
import { WorkspaceSessionComposer } from './session-composer'

const template = {
  description: 'Create a release gate.',
  id: 'qa-release-gate',
  inputHints: [],
  name: 'Release Gate',
  outputKind: 'Release Gate',
  prompt: 'Create a release gate.',
  reviewRubric: [],
  soulId: 'aiworker-qa',
} as CapabilityTemplate

const workspace = {
  createdAt: '2026-05-20T00:00:00.000Z',
  id: 'workspace-1',
  name: 'QA Release Workspace',
  status: 'active',
  updatedAt: '2026-05-20T00:00:00.000Z',
  workerId: 'worker-1',
} as LocalWorkspace

describe('workspaceSessionComposer', () => {
  it('renders its shell copy through shadcn item slots without local typography overrides', () => {
    render(
      <WorkspaceSessionComposer
        copy={messagesFor('en')}
        engineReadiness={{ detail: 'Ready', ready: true }}
        locale="en"
        selectedTemplate={template}
        submitting={false}
        templates={[template]}
        value=""
        workspace={workspace}
        onContextChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const panel = screen.getByTestId('new-session-panel')
    expect(panel.getAttribute('data-slot')).toBe('item-group')
    expect(panel.classList.contains('max-w-[920px]')).toBe(false)

    const heading = within(panel).getByRole('heading', { name: 'What do you want to build in QA Release Workspace?' })
    expect(heading.getAttribute('data-slot')).toBe('item-title')
    expect(heading.classList.contains('leading-tight')).toBe(false)
    expect(heading.classList.contains('text-foreground')).toBe(false)
    expect(heading.classList.contains('text-center')).toBe(false)
    expect(heading.classList.contains('text-2xl')).toBe(false)
    expect(heading.classList.contains('md:text-3xl')).toBe(false)

    const hint = within(panel).getByText('Start a Release Gate session in this workspace.')
    expect(hint.getAttribute('data-slot')).toBe('item-description')
    expect(hint.classList.contains('-mt-2')).toBe(false)
    expect(hint.classList.contains('text-center')).toBe(false)
  })
})
