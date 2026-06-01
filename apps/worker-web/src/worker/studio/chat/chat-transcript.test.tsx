// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatTranscript } from './chat-transcript'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat transcript view', () => {
  it('renders an empty, labelled transcript log when no invocation is selected', () => {
    render(<ChatTranscript ariaLabel="Session transcript" invocationId={null} />)
    expect(screen.getByRole('log', { name: 'Session transcript' })).toBeTruthy()
    expect(screen.queryByText(/engine/)).toBeNull()
  })

  it('renders assistant output from live invocation events', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      events: [{
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 1,
        invocationId: 'inv-1',
        payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'Hello from the engine.' } },
        seq: 1,
        sessionId: 's1',
        type: 'assistant_delta',
      }],
      invocation: { id: 'inv-1', status: 'succeeded' },
    }))))

    render(<ChatTranscript ariaLabel="Session transcript" invocationId="inv-1" />)

    await waitFor(() => {
      expect(screen.getByText(/Hello from the engine/)).toBeTruthy()
    })
  })
})
