// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SessionTimeline } from './session-timeline'

afterEach(() => cleanup())

describe('session timeline', () => {
  it('renders the Worker-owned session timeline wrapper around transcript turns', () => {
    render(
      <SessionTimeline
        ariaLabel="Session transcript"
        turns={[{
          id: 'inv-1',
          items: [{ id: 'assistant', kind: 'assistant-markdown', markdown: 'Worker-owned answer.' }],
        }]}
      />,
    )

    expect(document.querySelector('[data-session-timeline="true"]')).toBeTruthy()
    expect(screen.getByRole('log', { name: 'Session transcript' })).toBeTruthy()
    expect(screen.getByText('Worker-owned answer.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Host-owned|Soul UI/i)
  })
})
