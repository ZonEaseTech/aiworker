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
        controlsId="item-section-primary"
        description="Active group"
        drawerProps={{ 'aria-label': 'Primary items', 'role': 'group' }}
        meta={0}
        title="Items"
        toggleAriaLabel="Items 0"
        onToggle={onToggle}
      >
        <button type="button">Open item</button>
      </CollapsibleGroup>,
    )

    const toggle = screen.getByRole('button', { name: 'Items 0' })
    expect(toggle.getAttribute('data-slot')).toBe('collapsible-trigger')
    expect(toggle.getAttribute('data-variant')).toBe('ghost')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-controls')).toBe('item-section-primary')
    expect(within(toggle).getByText('Items').getAttribute('data-slot')).toBe('item-title')
    expect(within(toggle).queryByText('Active group')).toBeNull()
    expect(within(toggle).getByText('0').getAttribute('data-slot')).toBe('badge')

    const drawer = screen.getByRole('group', { name: 'Primary items' })
    expect(drawer.id).toBe('item-section-primary')
    expect(drawer.getAttribute('data-slot')).toBe('collapsible-content')
    expect(within(drawer).getByRole('button', { name: 'Open item' })).toBeTruthy()
  })

  it('keeps the drawer hidden when collapsed', () => {
    render(
      <CollapsibleGroup
        collapsed
        controlsId="worker-soul-group-demo"
        title="Demo Group (1)"
        toggleAriaLabel="Demo Group (1) sample-capability"
        onToggle={() => {}}
      >
        <button type="button">Demo</button>
      </CollapsibleGroup>,
    )

    expect(screen.getByRole('button', { name: 'Demo Group (1) sample-capability' }).getAttribute('aria-expanded')).toBe('false')
    const drawer = document.querySelector('[data-slot="collapsible-content"]')
    expect(drawer?.getAttribute('data-state')).toBe('closed')
    expect(drawer?.hasAttribute('hidden')).toBe(true)
  })

  it('renders main frame chrome through shadcn header and item slots', () => {
    render(
      <StudioMainFrame
        actions={<button type="button">Refresh</button>}
        kicker="Current workspace"
        title="Demo Workspace"
      >
        <p>Workspace content</p>
      </StudioMainFrame>,
    )

    const heading = screen.getByRole('heading', { name: 'Demo Workspace' })
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
