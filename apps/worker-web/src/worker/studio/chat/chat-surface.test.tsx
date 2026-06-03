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

function sessionDetail(events: unknown[] = [], invocations: unknown[] = []) {
  return {
    events,
    invocations,
    session: { id: 'session-1', status: 'active' },
  }
}

function deferredResponse<T>(value: T) {
  let resolve!: () => void
  const gate = new Promise<void>((resolveGate) => {
    resolve = resolveGate
  })
  return {
    resolve,
    response: async () => {
      await gate
      return new Response(JSON.stringify(value))
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat surface', () => {
  it('renders an empty transcript and a composer for the selected session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sessionDetail()))))
    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading transcript' })).toBeNull()
    })
    expect(screen.getByRole('log', { name: 'Session transcript' })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('stretches to the main workbench so the composer stays pinned to the bottom', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sessionDetail()))))
    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading transcript' })).toBeNull()
    })

    const surface = document.querySelector('[data-chat-surface="true"]')
    expect(surface?.className).toContain('flex-1')
    expect(surface?.className).toContain('overflow-hidden')
  })

  it('shows transcript loading skeleton while session detail is loading without replacing the composer', async () => {
    const pendingSession = deferredResponse(sessionDetail())
    vi.stubGlobal('fetch', vi.fn(pendingSession.response))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    expect(screen.getByRole('log', { name: 'Session transcript' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status', { name: 'Loading transcript' })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()

    pendingSession.resolve()

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading transcript' })).toBeNull()
    })
  })

  it('renders a transcript restore error instead of the default empty state when session detail fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('session detail unavailable')
    }))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading transcript' })).toBeNull()
    })
    expect(screen.getByRole('status', { name: 'Transcript history unavailable' })).toBeTruthy()
    expect(document.querySelector('[data-transcript-slot="chat-thread-error"]')?.closest('[role="log"]')).toBeNull()
    expect(screen.queryByText('Ready when you are')).toBeNull()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('replays persisted session events after a browser refresh with no in-memory active invocation', async () => {
    const persistedEvent = {
      createdAt: '2026-06-01T00:00:00.000Z',
      id: 3,
      invocationId: 'inv-restored',
      payloadJson: { data: { text: 'persisted reply after refresh' } },
      seq: 1,
      sessionId: 'session-1',
      type: 'assistant_delta',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/sessions/session-1') {
        return new Response(JSON.stringify(sessionDetail(
          [persistedEvent],
          [{
            id: 'inv-restored',
            metadataJson: { uiUserDisplayText: 'persisted user prompt after refresh' },
            seq: 1,
            sessionId: 'session-1',
            status: 'succeeded',
          }],
        )))
      }
      return new Response(JSON.stringify({
        events: [persistedEvent],
        invocation: { id: 'inv-restored', status: 'succeeded' },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    expect(await screen.findByText(/persisted reply after refresh/)).toBeTruthy()
    expect(screen.getByText(/persisted user prompt after refresh/)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session-1', expect.any(Object))
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
      if (url === '/api/sessions/session-1')
        return new Response(JSON.stringify(sessionDetail()))
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

  it('echoes the submitted message as a user-message turn in the transcript', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/invocations') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          events: [],
          files: [],
          invocation: { id: 'inv-echo', status: 'queued' },
          session: { id: 'session-1', status: 'active' },
        }), { status: 201 })
      }
      if (url === '/api/sessions/session-1')
        return new Response(JSON.stringify(sessionDetail()))
      return new Response(JSON.stringify({
        events: [],
        invocation: { id: 'inv-echo', status: 'succeeded' },
      }))
    }))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'echo this back please' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => {
      const userMessage = document.querySelector('[data-transcript-slot="user-message"]')
      expect(userMessage?.textContent).toContain('echo this back please')
    })
  })
})
