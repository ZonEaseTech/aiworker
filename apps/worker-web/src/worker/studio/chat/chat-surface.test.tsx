// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatSurface } from './chat-surface'

const composerLabels = {
  ariaLabel: 'Message composer',
  attachment: {
    add: 'Add',
    attached: 'Attached',
    closePreview: (name: string) => `Close ${name}`,
    materialReadError: 'Could not read material',
    preview: (name: string) => `Preview ${name}`,
    remove: (name: string) => `Remove ${name}`,
  },
  submitAriaLabel: 'Send message',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat surface', () => {
  it('renders an empty transcript and a composer for the selected session', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)
    expect(screen.getByRole('log', { name: 'Session transcript' })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('submits a message and streams the resulting invocation into the transcript', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/invocations') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          events: [],
          files: [],
          invocation: { id: 'inv-1', status: 'queued' },
          session: { id: 'session-1', status: 'active' },
        }), { status: 201 })
      }
      return new Response(JSON.stringify({
        events: [{
          createdAt: '2026-06-01T00:00:00.000Z',
          id: 1,
          invocationId: 'inv-1',
          payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'engine reply here' } },
          seq: 1,
          sessionId: 'session-1',
          type: 'assistant_delta',
        }],
        invocation: { id: 'inv-1', status: 'succeeded' },
      }))
    }))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'go' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => {
      expect(screen.getByText(/engine reply here/)).toBeTruthy()
    })
  })
})
