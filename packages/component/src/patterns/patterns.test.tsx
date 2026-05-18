// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ProgressCard,
  ProfileReaderShell,
  SegmentedControl,
  SettingsShell,
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

  it('renders profile reader states without domain language', () => {
    const { rerender, container } = render(<ProfileReaderShell loading title="Profile" />)

    expect(container.textContent?.toLowerCase()).not.toContain('candidate')
    expect(container.textContent?.toLowerCase()).not.toContain('hr')

    rerender(<ProfileReaderShell title="Profile" error="Could not load" />)
    expect(screen.getByRole('alert').textContent).toBe('Could not load')

    rerender(<ProfileReaderShell title="Profile" empty="No profile selected" />)
    expect(screen.getByText('No profile selected')).toBeTruthy()
  })
})
