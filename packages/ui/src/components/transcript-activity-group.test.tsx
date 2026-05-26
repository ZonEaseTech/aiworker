// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { TranscriptActivityGroup } from './transcript-activity-group'

afterEach(() => cleanup())

describe('TranscriptActivityGroup', () => {
  it('collapses successful activity details by default', () => {
    render(
      <TranscriptActivityGroup
        activities={[{ description: 'packages/ui', id: 'read', title: 'Read files' }]}
        defaultCollapsed
        summary="Explored 1 file"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle activity details' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBeTruthy()
    expect(screen.queryByText('packages/ui')).toBeNull()
  })

  it('expands activity details from the summary trigger', () => {
    render(
      <TranscriptActivityGroup
        activities={[{ description: 'packages/ui', id: 'read', title: 'Read files' }]}
        defaultCollapsed
        summary="Explored 1 file"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle activity details' })

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('packages/ui')).toBeTruthy()
  })

  it('keeps failed activity details visible', () => {
    render(
      <TranscriptActivityGroup
        activities={[{ description: 'lint failed', id: 'lint', status: 'failed', title: 'Run lint' }]}
        defaultCollapsed
        summary="Ran 1 command"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Toggle activity details' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('lint failed')).toBeTruthy()
    expect(screen.getByText('failed')).toBeTruthy()
  })
})
