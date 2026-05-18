import { render, screen, within } from '@testing-library/react'
import { StudioCollapsibleGroup } from '@zonease/aiworker-component'
import { describe, expect, it, vi } from 'vitest'

describe('studio collapsible group', () => {
  it('renders an expanded grouped list shell with meta, description, and drawer props', () => {
    const onToggle = vi.fn()

    render(
      <StudioCollapsibleGroup
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
      </StudioCollapsibleGroup>,
    )

    const toggle = screen.getByRole('button', { name: 'Candidates 0' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-controls')).toBe('profile-section-candidates')
    expect(within(toggle).getByText('Active pipeline')).toBeTruthy()
    expect(within(toggle).getByText('0')).toBeTruthy()

    const drawer = screen.getByRole('group', { name: 'Candidate profiles' })
    expect(drawer.id).toBe('profile-section-candidates')
    expect(drawer.classList.contains('studio-collapsible-group-drawer')).toBe(true)
    expect(within(drawer).getByRole('button', { name: 'Open profile' })).toBeTruthy()
  })

  it('omits the drawer when collapsed', () => {
    render(
      <StudioCollapsibleGroup
        collapsed
        controlsId="worker-soul-group-qa"
        title="QA (1)"
        toggleAriaLabel="QA (1) quality-assurance"
        onToggle={() => {}}
      >
        <button type="button">QA</button>
      </StudioCollapsibleGroup>,
    )

    expect(screen.getByRole('button', { name: 'QA (1) quality-assurance' }).getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.studio-collapsible-group-drawer')).toBeNull()
  })
})
