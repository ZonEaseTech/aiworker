import type { SessionTimelineTurnViewModel } from './session-view-model'

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionTimeline } from './session-timeline'

describe('sessionTimeline', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders repeated activity detail values without duplicate React keys', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const turns: SessionTimelineTurnViewModel[] = [{
      events: [{
        activityKind: 'command',
        details: [
          { label: 'Command', value: 'bun run check' },
          { label: 'Output', value: 'same log chunk' },
          { label: 'Output', value: 'same log chunk' },
        ],
        id: 'event-1',
        kind: 'activity',
        label: 'Ran command',
        status: 'succeeded',
        turnId: 'turn-1',
      }],
      turn: {
        id: 'turn-1',
        input: 'Run the task',
        seq: 1,
        status: 'succeeded',
      },
    }]

    render(
      <SessionTimeline
        assistantRoleLabel="Assistant"
        operatorRoleLabel="Operator"
        turns={turns}
      />,
    )

    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('Encountered two children with the same key'),
      expect.anything(),
    )
    const repeatedOutput = screen.getAllByText('same log chunk')
    expect(repeatedOutput[0]?.className).toContain('max-w-full')
    expect(repeatedOutput[0]?.closest('[data-slot="scroll-area"]')?.className).toContain('max-w-full')
  })

  it('renders turn errors as shadcn alerts instead of card shells', () => {
    const turns: SessionTimelineTurnViewModel[] = [{
      events: [],
      turn: {
        error: 'Engine failed to produce a valid artifact.',
        id: 'turn-error',
        input: 'Try a risky run',
        seq: 1,
        status: 'failed',
      },
    }]

    const { container } = render(
      <SessionTimeline
        assistantRoleLabel="Assistant"
        operatorRoleLabel="Operator"
        turns={turns}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('data-slot')).toBe('alert')
    expect(alert.closest('[data-slot="card"]')).toBeNull()
    expect(container.querySelector('[data-slot="alert-description"]')?.textContent).toBe('Engine failed to produce a valid artifact.')
  })
})
