import { render, screen, within } from '@testing-library/react'
import { CollapsibleGroup } from '@zonease/aiworker-ui/components/collapsible-group'
import { describe, expect, it, vi } from 'vitest'
import { StudioMainFrame, StudioSectionHeader } from '../../worker/components/studio-shell'

describe('studio collapsible group', () => {
  it('renders an expanded compact grouped list shell with meta and drawer props', () => {
    const onToggle = vi.fn()

    render(
      <CollapsibleGroup
        collapsed={false}
        controlsId="profile-section-candidates"
        description="Active pipeline"
        drawerProps={{ 'aria-label': 'Candidate profiles', 'role': 'group' }}
        meta={0}
        title="Candidates"
        toggleAriaLabel="Candidates 0"
        onToggle={onToggle}
      >
        <button type="button">Open profile</button>
      </CollapsibleGroup>,
    )

    const toggle = screen.getByRole('button', { name: 'Candidates 0' })
    expect(toggle.getAttribute('data-slot')).toBe('collapsible-trigger')
    expect(toggle.getAttribute('data-variant')).toBe('ghost')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-controls')).toBe('profile-section-candidates')
    expect(within(toggle).getByText('Candidates').getAttribute('data-slot')).toBe('item-title')
    expect(within(toggle).queryByText('Active pipeline')).toBeNull()
    expect(within(toggle).getByText('0').getAttribute('data-slot')).toBe('badge')

    const drawer = screen.getByRole('group', { name: 'Candidate profiles' })
    expect(drawer.id).toBe('profile-section-candidates')
    expect(drawer.getAttribute('data-slot')).toBe('collapsible-content')
    expect(within(drawer).getByRole('button', { name: 'Open profile' })).toBeTruthy()
  })

  it('keeps the drawer hidden when collapsed', () => {
    render(
      <CollapsibleGroup
        collapsed
        controlsId="worker-soul-group-qa"
        title="QA (1)"
        toggleAriaLabel="QA (1) quality-assurance"
        onToggle={() => {}}
      >
        <button type="button">QA</button>
      </CollapsibleGroup>,
    )

    expect(screen.getByRole('button', { name: 'QA (1) quality-assurance' }).getAttribute('aria-expanded')).toBe('false')
    const drawer = document.querySelector('[data-slot="collapsible-content"]')
    expect(drawer?.getAttribute('data-state')).toBe('closed')
    expect(drawer?.hasAttribute('hidden')).toBe(true)
  })

  it('renders main frame chrome through shadcn header and item slots', () => {
    render(
      <StudioMainFrame
        actions={<button type="button">Refresh</button>}
        kicker="Current workspace"
        title="Hiring Workspace"
      >
        <p>Workspace content</p>
      </StudioMainFrame>,
    )

    const heading = screen.getByRole('heading', { name: 'Hiring Workspace' })
    expect(heading.getAttribute('data-slot')).toBe('item-title')
    expect(heading.closest('[data-slot="item"]')).toBeTruthy()
    expect(screen.getByText('Current workspace').getAttribute('data-slot')).toBe('item-description')
    expect(screen.getByText('Refresh').closest('[data-slot="card-header"]')).toBeTruthy()
    expect(screen.getByText('Workspace content').closest('[data-slot="card-content"]')).toBeTruthy()
  })

  it('renders section header chrome through shadcn item slots', () => {
    render(
      <StudioSectionHeader
        action={<button type="button">Add</button>}
        description="2 visible profiles"
        icon={<span aria-hidden="true">Icon</span>}
        title="People Profiles"
      />,
    )

    const title = screen.getByText('People Profiles')
    expect(title.getAttribute('data-slot')).toBe('item-title')
    expect(title.closest('[data-slot="item"]')).toBeTruthy()
    expect(screen.getByText('2 visible profiles').getAttribute('data-slot')).toBe('item-description')
    expect(screen.getByText('Add').closest('[data-slot="item-actions"]')).toBeTruthy()
  })
})
