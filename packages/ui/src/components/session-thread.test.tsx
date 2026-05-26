// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SessionThread } from './session-thread'

afterEach(() => cleanup())

describe('sessionThread', () => {
  it('renders turns, progress, and app-owned artifact cards without nested cards', () => {
    const { container } = render(
      <SessionThread
        ariaLabel="Session thread"
        messages={[
          { body: 'Review this candidate.', id: 'turn-1-user', kind: 'user', title: 'You' },
          { body: 'Running interview brief skill.', id: 'turn-1-status', kind: 'status', title: 'Running' },
          {
            artifacts: [
              {
                description: 'Interview questions and evidence gaps.',
                id: 'artifact-1',
                status: 'available',
                title: 'Interview brief',
              },
            ],
            body: 'Created an interview brief.',
            id: 'turn-1-assistant',
            kind: 'assistant',
            title: 'Recruiting worker',
          },
        ]}
      />,
    )

    expect(screen.getByRole('log', { name: 'Session thread' })).toBeTruthy()
    expect(screen.getByText('Review this candidate.')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Running interview brief skill.')).toBeTruthy()
    expect(screen.getByText('Created an interview brief.')).toBeTruthy()
    expect(screen.getByText('Interview brief')).toBeTruthy()
    expect(container.querySelector('[data-session-slot="artifact-card"]')?.closest('[data-slot="card"] [data-slot="card"]')).toBeNull()
  })

  it('keeps legacy SessionThread as a compatibility surface', () => {
    const { container } = render(
      <SessionThread
        ariaLabel="Legacy session thread"
        messages={[
          { body: 'Legacy body', id: 'legacy-user', kind: 'user', title: 'User' },
        ]}
      />,
    )

    expect(screen.getByRole('log', { name: 'Legacy session thread' })).toBeTruthy()
    expect(screen.getByText('Legacy body')).toBeTruthy()
    expect(container.querySelector('[data-session-slot="session-thread"]')).toBeTruthy()
  })
})
