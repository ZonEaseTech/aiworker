// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { TranscriptActivityGroup } from './transcript-activity-group'

afterEach(() => cleanup())

describe('transcript activity group', () => {
  it('collapses successful activity details by default', () => {
    render(
      <TranscriptActivityGroup
        activities={[{ description: 'packages/ui', id: 'read', title: 'Read files' }]}
        summary="Explored 1 file"
      />,
    )

    const trigger = screen.getByRole('button', { name: /Toggle activity details/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBeTruthy()
    expect(screen.queryByText('packages/ui')).toBeNull()
  })

  it('wraps the dot trigger summary with comfortable horizontal padding and centered dot rhythm', () => {
    const { container } = render(
      <TranscriptActivityGroup
        activities={[{ description: 'ran long command', id: 'bash', title: 'Bash' }]}
        summary="Ran Bash: printf a very long command that should wrap instead of truncating out of view"
      />,
    )

    const trigger = screen.getByRole('button', { name: /Toggle activity details/ })
    const summary = container.querySelector('[data-transcript-slot="activity-summary"]')
    const dot = container.querySelector('[data-transcript-slot="activity-dot"]')
    const content = container.querySelector('[data-slot="collapsible-content"]')

    expect(trigger.className).toContain('px-2')
    expect(trigger.className).toContain('py-1')
    expect(trigger.className).toContain('items-center')
    expect(trigger.className).toContain('transition-all')
    expect(summary?.className).toContain('whitespace-normal')
    expect(summary?.className).toContain('break-words')
    expect(summary?.className).not.toContain('truncate')
    expect(dot?.className).toContain('self-center')
    expect(dot?.className).not.toContain('mt-2')
    expect(content?.className).toContain('data-open:animate-in')
  })

  it('renders successful activity summary as quiet inline disclosure without card chrome', () => {
    const { container } = render(
      <TranscriptActivityGroup
        activities={[{ description: 'packages/ui', id: 'read', title: 'Read files' }]}
        defaultCollapsed
        summary="Explored 1 file"
      />,
    )

    const group = container.querySelector('[data-transcript-slot="activity-group"]')
    expect(group?.className).not.toContain('border')
    expect(group?.className).not.toContain('rounded-md')
    expect(container.querySelector('[data-slot="badge"]')).toBeNull()
  })

  it('uses the readable activity summary in the disclosure label', () => {
    render(
      <TranscriptActivityGroup
        activities={[
          {
            command: { command: 'printf bridge', status: 'succeeded', title: 'Bash' },
            id: 'bash',
            status: 'succeeded',
            title: 'Bash',
          },
        ]}
        defaultCollapsed
        summary="Ran Bash: printf bridge"
      />,
    )

    expect(screen.getByRole('button', { name: 'Toggle activity details: Ran Bash: printf bridge' })).toBeTruthy()
    expect(screen.queryByText('1 tool activity')).toBeNull()
  })

  it('expands activity details from the summary trigger', () => {
    render(
      <TranscriptActivityGroup
        activities={[{ description: 'packages/ui', id: 'read', title: 'Read files' }]}
        defaultCollapsed
        summary="Explored 1 file"
      />,
    )

    const trigger = screen.getByRole('button', { name: /Toggle activity details/ })

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('packages/ui')).toBeTruthy()
  })

  it('keeps failed activity summaries visible while details stay collapsed by default', () => {
    const { container } = render(
      <TranscriptActivityGroup
        activities={[{ description: 'lint failed', id: 'lint', status: 'failed', title: 'Run lint' }]}
        defaultCollapsed
        summary="Ran 1 command"
      />,
    )

    const trigger = screen.getByRole('button', { name: /Toggle activity details/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('lint failed')).toBeNull()
    expect(screen.getAllByText('failed').length).toBeGreaterThan(0)
    expect(container.querySelector('[data-transcript-activity-status="failed"]')).toBeNull()

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('lint failed')).toBeTruthy()
    expect(container.querySelector('[data-transcript-activity-status="failed"]')).toBeTruthy()
  })

  it('does not force-open collapsed activity details when a failure arrives after render', () => {
    const { rerender } = render(
      <TranscriptActivityGroup
        activities={[{ description: 'lint running', id: 'lint', status: 'running', title: 'Run lint' }]}
        defaultCollapsed
        summary="Ran 1 command"
      />,
    )

    const trigger = screen.getByRole('button', { name: /Toggle activity details/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    rerender(
      <TranscriptActivityGroup
        activities={[{ description: 'lint failed after retry', id: 'lint', status: 'failed', title: 'Run lint' }]}
        defaultCollapsed
        summary="Ran 1 command"
      />,
    )

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('lint failed after retry')).toBeNull()
  })

  it('treats a failed nested command as a failed activity', () => {
    const { container } = render(
      <TranscriptActivityGroup
        activities={[
          {
            command: {
              command: 'bun run lint',
              output: 'lint failed',
              status: 'failed',
            },
            id: 'lint',
            title: 'Run lint',
          },
        ]}
        defaultCollapsed
        summary="Ran 1 command"
      />,
    )

    const trigger = screen.getByRole('button', { name: /Toggle activity details/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getAllByText('failed').length).toBeGreaterThan(0)
    expect(screen.queryByText('lint failed')).toBeNull()
    expect(container.querySelector('[data-transcript-activity-status="failed"]')).toBeNull()
  })
})
